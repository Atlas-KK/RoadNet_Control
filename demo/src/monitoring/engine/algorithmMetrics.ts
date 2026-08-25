import type { Alarm, AlarmAssessment } from '../../domain/monitoring';

export interface AlgorithmMetricSampleGroup {
  algorithmName: string;
  algorithmVersion: string;
  sourceSystem: string;
  eventType: Alarm['eventType'];
  sampleCount: number;
  humanLabeledCount: number;
  humanConfirmedCount: number;
  humanFalsePositiveCount: number;
  sampleStatus: 'insufficient' | 'ready_for_p1_analysis';
}

/** P1只准备可追溯的计数数据，不把置信度均值或小样本结果命名为准确率。 */
export function prepareAlgorithmMetricSamples(
  alarms: readonly Alarm[],
  assessments: readonly AlarmAssessment[],
  minimumSampleSize = 30,
): AlgorithmMetricSampleGroup[] {
  if (!Number.isSafeInteger(minimumSampleSize) || minimumSampleSize <= 0) throw new Error('minimumSampleSize必须是正安全整数');
  const latestAssessment = new Map<string, AlarmAssessment>();
  for (const assessment of [...assessments].sort((left, right) => left.assessedAt.localeCompare(right.assessedAt))) {
    latestAssessment.set(assessment.alarmId, assessment);
  }
  const groups = new Map<string, AlgorithmMetricSampleGroup>();
  for (const alarm of alarms) {
    const algorithmName = alarm.modelName?.trim() || '算法名称待记录';
    const algorithmVersion = alarm.algorithmVersion?.trim() || '版本待记录';
    const key = [algorithmName, algorithmVersion, alarm.sourceSystem, alarm.eventType].join('\u001f');
    const current = groups.get(key) ?? {
      algorithmName, algorithmVersion, sourceSystem: alarm.sourceSystem, eventType: alarm.eventType,
      sampleCount: 0, humanLabeledCount: 0, humanConfirmedCount: 0, humanFalsePositiveCount: 0,
      sampleStatus: 'insufficient' as const,
    };
    current.sampleCount += 1;
    const assessment = latestAssessment.get(alarm.alarmId);
    if (assessment) {
      current.humanLabeledCount += 1;
      if (assessment.result === 'valid') current.humanConfirmedCount += 1;
      if (assessment.result === 'false_positive') current.humanFalsePositiveCount += 1;
    }
    current.sampleStatus = current.sampleCount >= minimumSampleSize ? 'ready_for_p1_analysis' : 'insufficient';
    groups.set(key, current);
  }
  return [...groups.values()].sort((left, right) => right.sampleCount - left.sampleCount
    || left.algorithmName.localeCompare(right.algorithmName));
}
