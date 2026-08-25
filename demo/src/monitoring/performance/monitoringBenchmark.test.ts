import { describe, expect, it } from 'vitest';
import type { SimulatedUser } from '../permissions';
import { generateMonitoringPerformanceDataset, PERFORMANCE_ACTIVE_EVENT_COUNT, PERFORMANCE_ALARM_COUNT } from './performanceDataset';
import { runMonitoringPerformanceBenchmark, simulateTwoHourProjectionSoak, summarizeTimings } from './monitoringBenchmark';

const PERF_USER: SimulatedUser = {
  userId: 'PERF-USER', displayName: '性能验收用户', role: 'supervisor', organizationId: 'PERF',
  authorizedRoadCodes: ['G65', 'G75', 'G50', 'G56'], authorizedFacilityIds: [],
};

describe('阶段10 固定seed性能与稳定性工具', () => {
  it('相同seed生成一致的1000条Alarm和200起活跃事件', () => {
    const first = generateMonitoringPerformanceDataset(20260825);
    const second = generateMonitoringPerformanceDataset(20260825);
    expect(first.alarms).toHaveLength(PERFORMANCE_ALARM_COUNT);
    expect(first.events).toHaveLength(PERFORMANCE_ACTIVE_EVENT_COUNT);
    expect(first).toEqual(second);
  });

  it('平均值与P95按原始样本计算', () => {
    expect(summarizeTimings([1, 2, 3, 4, 10])).toMatchObject({ averageMs: 4, p95Ms: 10 });
  });

  it('组合筛选、详情和GIS各执行5次并满足MVP平均阈值', () => {
    const dataset = generateMonitoringPerformanceDataset(20260825);
    const report = runMonitoringPerformanceBenchmark(dataset, PERF_USER, Date.parse('2026-08-25T12:00:00.000Z'));
    console.info(`MONITORING_PERFORMANCE_REPORT ${JSON.stringify(report)}`);
    expect(report.filter.samplesMs).toHaveLength(5);
    expect(report.detail.samplesMs).toHaveLength(5);
    expect(report.gis.samplesMs).toHaveLength(5);
    expect(report.filter.averageMs).toBeLessThan(500);
    expect(report.detail.averageMs).toBeLessThan(1_000);
  });

  it('快速模拟两小时推送周期时投影始终不超过200起事件和1000条关联告警', () => {
    const result = simulateTwoHourProjectionSoak(generateMonitoringPerformanceDataset(20260825));
    expect(result).toEqual({ simulatedSeconds: 7_200, cycles: 7_200, maxProjectedEvents: 200, maxProjectedAlarms: 1_000, completed: true });
  });
});
