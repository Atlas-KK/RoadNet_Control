import type { CalcRecord } from './trace';

type SummaryRole = NonNullable<CalcRecord['summaryRole']>;

export interface CalcSummary {
  eventId?: string;
  text: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

function legacyRoleOf(record: CalcRecord): SummaryRole | undefined {
  if (record.summaryRole) return record.summaryRole;
  if (record.label.includes('瓶颈') || record.id.endsWith('-01')) return 'capacity';
  if (record.label.includes('行驶密度') || record.id.endsWith('-02')) return 'drivingDensity';
  if (record.label.includes('排队密度') || record.id.endsWith('-03')) return 'queueDensity';
  if (record.label.includes('回溯速度') || record.id.endsWith('-04')) return 'spillbackSpeed';
  if (record.label.includes('排队长度') || record.label.includes('队尾桩号') || record.id.endsWith('-05')) return 'queueLength';
  if (record.formula.includes('T(kp)') || record.label.includes('到达')) return 'arrivalTime';
  return undefined;
}

function resultValue(record: CalcRecord): string | undefined {
  if (record.summaryValue) return record.summaryValue;
  const cleaned = record.result.trim().replace(/^=\s*/, '');
  return cleaned || undefined;
}

function recordFor(records: CalcRecord[], role: SummaryRole) {
  return records.find((record) => legacyRoleOf(record) === role);
}

function valueOf(records: CalcRecord[], role: SummaryRole) {
  const record = recordFor(records, role);
  return record ? resultValue(record) : undefined;
}

function isCongested(spillback: CalcRecord): boolean {
  if (spillback.conclusionTone === 'danger') return true;
  if (spillback.conclusionTone === 'success') return false;
  const text = `${spillback.result} ${spillback.conclusion ?? ''}`;
  if (text.includes('暂不') || text.includes('未形成') || text.includes('≤') || text.includes('<=') || text.includes('= 0')) {
    return false;
  }
  return /[1-9]\d*(?:\.\d+)?\s*km\/h/.test(text);
}

export function summarizeEventCalcs(records: CalcRecord[], eventId?: string): CalcSummary | null {
  const scoped = records.filter((record) => !eventId || record.eventId === eventId);
  if (scoped.length === 0) return null;

  const capacity = valueOf(scoped, 'capacity') ?? '未计算';
  const drivingDensity = valueOf(scoped, 'drivingDensity') ?? '未计算';
  const queueDensity = valueOf(scoped, 'queueDensity') ?? '未计算';
  const spillback = recordFor(scoped, 'spillbackSpeed');
  const queueLength = valueOf(scoped, 'queueLength');
  const arrivalTime = valueOf(scoped, 'arrivalTime');

  const tone: CalcSummary['tone'] = scoped.some((record) => record.conclusionTone === 'danger')
    ? 'danger'
    : scoped.some((record) => record.conclusionTone === 'warning')
      ? 'warning'
      : scoped.some((record) => record.conclusionTone === 'success')
        ? 'success'
        : 'info';

  const trafficJudgement = spillback && isCongested(spillback)
    ? `当前流量已超过瓶颈能力，队尾回溯速度 ${resultValue(spillback) ?? '未计算'}，需要按拥堵外溢处置。`
    : spillback
      ? '当前流量未超过瓶颈能力，暂不形成排队。'
      : '回溯速度尚未计算，暂不能判断是否外溢。';
  const dynamicState = queueLength ? `实时排队状态：${queueLength}。` : '';
  const arrivalState = arrivalTime ? `目标点到达判断：${arrivalTime}。` : '';

  return {
    eventId,
    tone,
    text: [
      `本次事件交通流综合判断：瓶颈通行能力 ${capacity}，行驶密度 ${drivingDensity}，排队密度 ${queueDensity}。`,
      trafficJudgement,
      dynamicState,
      arrivalState,
    ].filter(Boolean).join(''),
  };
}
