import { describe, expect, it } from 'vitest';
import type { Alarm, AlarmAssessment } from '../../domain/monitoring';
import { prepareAlgorithmMetricSamples } from './algorithmMetrics';

const alarm = (id: string): Alarm => ({
  alarmId: id, sourceAlarmId: id, sourceType: 'video_ai', sourceSystem: 'VIDEO-A', eventType: 'fire',
  detectedAt: '2026-08-25T01:00:00.000Z', firstReceivedAt: '2026-08-25T01:00:01.000Z',
  location: { roadCode: 'G65', direction: 'up', deviceId: 'CAM-1' }, confidence: 0.98,
  algorithmVersion: 'v2', modelName: 'FireDetector', rawPayloadRef: `demo://${id}`, evidenceIds: [], simulation: true,
});
const assessment = (alarmId: string, result: AlarmAssessment['result'], at: string): AlarmAssessment => ({
  assessmentId: `${alarmId}-${at}`, alarmId, result, reason: '人工核实', assessedBy: 'USR-MONITOR-01', assessedAt: at,
});

describe('FR-EM-013 P1算法指标数据准备', () => {
  it('按算法、版本、来源和事件类型提供原始计数，小样本不输出准确率结论', () => {
    const rows = prepareAlgorithmMetricSamples([alarm('A1'), alarm('A2')], [
      assessment('A1', 'valid', '2026-08-25T01:01:00.000Z'),
      assessment('A2', 'false_positive', '2026-08-25T01:02:00.000Z'),
    ]);
    expect(rows[0]).toMatchObject({ sampleCount: 2, humanLabeledCount: 2, humanConfirmedCount: 1,
      humanFalsePositiveCount: 1, sampleStatus: 'insufficient' });
    expect(Object.keys(rows[0] ?? {}).join(' ')).not.toContain('accuracy');
  });

  it('同一告警多次评估只取最新人工标签', () => {
    const rows = prepareAlgorithmMetricSamples([alarm('A1')], [
      assessment('A1', 'valid', '2026-08-25T01:01:00.000Z'),
      assessment('A1', 'false_positive', '2026-08-25T01:02:00.000Z'),
    ], 1);
    expect(rows[0]).toMatchObject({ humanLabeledCount: 1, humanConfirmedCount: 0, humanFalsePositiveCount: 1,
      sampleStatus: 'ready_for_p1_analysis' });
  });
});
