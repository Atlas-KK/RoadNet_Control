import type { MonitoringPerformanceDataset } from './performanceDataset';
import type { SimulatedUser } from '../permissions';
import { buildMonitoringListItems } from '../selectors';
import { buildMonitoringGisModel } from '../gis/monitoringGisModel';
import { DEFAULT_MONITORING_FILTERS } from '../uiState';

export interface TimingSummary { samplesMs: number[]; averageMs: number; p95Ms: number; }
export interface MonitoringPerformanceReport {
  seed: number;
  counts: { alarms: number; activeEvents: number };
  filter: TimingSummary;
  detail: TimingSummary;
  gis: TimingSummary;
}

export function summarizeTimings(samplesMs: readonly number[]): TimingSummary {
  if (!samplesMs.length) throw new Error('性能样本不能为空');
  const sorted = [...samplesMs].sort((left, right) => left - right);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return { samplesMs: [...samplesMs], averageMs: samplesMs.reduce((sum, value) => sum + value, 0) / samplesMs.length,
    p95Ms: sorted[p95Index]! };
}

export function runMonitoringPerformanceBenchmark(
  dataset: MonitoringPerformanceDataset,
  user: SimulatedUser,
  nowMs: number,
  iterations = 5,
  clock: () => number = () => performance.now(),
): MonitoringPerformanceReport {
  if (!Number.isSafeInteger(iterations) || iterations < 5) throw new Error('性能验收至少执行5次');
  const filterSamples: number[] = [];
  const detailSamples: number[] = [];
  const gisSamples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    let started = clock();
    const items = buildMonitoringListItems({
      events: dataset.events, alarms: dataset.alarms, handoffs: dataset.handoffs, user, operationalNowMs: nowMs,
      filters: { ...DEFAULT_MONITORING_FILTERS, eventTypes: ['traffic_accident', 'fire'], levels: ['L3', 'L4'], roadCodes: ['G65', 'G75'], keyword: 'PERF' },
      sort: 'level_desc',
    });
    filterSamples.push(clock() - started);

    const detailTarget = dataset.events[(index * 37) % dataset.events.length]!;
    started = clock();
    const detail = { event: detailTarget, alarms: dataset.alarms.filter((alarm) => detailTarget.alarmIds.includes(alarm.alarmId)) };
    if (detail.alarms.length !== 5) throw new Error('详情投影缺少关联告警');
    detailSamples.push(clock() - started);

    started = clock();
    buildMonitoringGisModel(items, items[0]?.event.monitoringEventId, 10.4);
    gisSamples.push(clock() - started);
  }
  return { seed: dataset.seed, counts: { alarms: dataset.alarms.length, activeEvents: dataset.events.length },
    filter: summarizeTimings(filterSamples), detail: summarizeTimings(detailSamples), gis: summarizeTimings(gisSamples) };
}

export interface SoakSimulationResult {
  simulatedSeconds: number;
  cycles: number;
  maxProjectedEvents: number;
  maxProjectedAlarms: number;
  completed: boolean;
}

/** 快速自动化只验证两小时消息周期的有界投影；真实浏览器两小时堆增长仍需单独实跑。 */
export function simulateTwoHourProjectionSoak(dataset: MonitoringPerformanceDataset, cycles = 7_200): SoakSimulationResult {
  if (!Number.isSafeInteger(cycles) || cycles <= 0) throw new Error('cycles必须是正安全整数');
  let maxProjectedEvents = 0;
  let maxProjectedAlarms = 0;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const offset = cycle % dataset.events.length;
    const projectedEvents = [...dataset.events.slice(offset), ...dataset.events.slice(0, offset)].slice(0, 200);
    const alarmIds = new Set(projectedEvents.flatMap((event) => [...event.alarmIds]));
    const projectedAlarms = dataset.alarms.filter((alarm) => alarmIds.has(alarm.alarmId));
    maxProjectedEvents = Math.max(maxProjectedEvents, projectedEvents.length);
    maxProjectedAlarms = Math.max(maxProjectedAlarms, projectedAlarms.length);
  }
  return { simulatedSeconds: 7_200, cycles, maxProjectedEvents, maxProjectedAlarms, completed: true };
}

