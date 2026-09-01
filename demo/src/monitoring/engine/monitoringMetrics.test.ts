import { describe, expect, it } from 'vitest';
import { freezeAlarm, type Alarm, type MonitoringEvent } from '../../domain/monitoring';
import { SIMULATED_USERS } from '../permissions';
import { computeMonitoringMetrics, isMonitoringVerificationOverdue } from './monitoringMetrics';

const NOW = new Date(2026, 7, 25, 12, 0, 0).getTime();
const today = (hour: number) => new Date(2026, 7, 25, hour, 0, 0).toISOString();
const yesterday = new Date(2026, 7, 24, 20, 0, 0).toISOString();

function alarm(alarmId: string, detectedAt: string, roadCode = 'G65'): Alarm {
  return freezeAlarm({
    alarmId, sourceAlarmId: `SRC-${alarmId}`, sourceType: 'video_ai', sourceSystem: 'VIDEO-A', eventType: 'fire',
    detectedAt, firstReceivedAt: detectedAt, location: { roadCode, direction: 'up', kilometer: 100 },
    rawPayloadRef: `demo://${alarmId}`, evidenceIds: [], simulation: true,
  });
}

function event(id: string, alarmIds: string[], overrides: Partial<MonitoringEvent> = {}): MonitoringEvent {
  return {
    monitoringEventId: id, version: 1, alarmIds, eventType: 'fire', location: { roadCode: 'G65', direction: 'up', kilometer: 100 },
    suggestedLevel: 'L3', verificationStatus: 'pending', lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [],
    detectedAt: today(8), updatedAt: today(8), simulation: true, ...overrides,
  };
}

describe('FR-EM-001 工作指标时间和数据范围口径', () => {
  it('今日检测按有效Alarm流量计算，其余指标按事件流量或当前存量计算', () => {
    const alarms = [alarm('A-TODAY', today(8)), alarm('A-OLD', yesterday), alarm('A-OUT', today(9), 'G99')];
    const events = [
      event('ME-PENDING', ['A-TODAY']),
      event('ME-VERIFYING', ['A-OLD'], { verificationStatus: 'verifying' }),
      event('ME-CONFIRMED', [], { verificationStatus: 'confirmed', confirmedAt: today(10) }),
      event('ME-FALSE', [], { verificationStatus: 'false_positive', falsePositiveAt: today(11) }),
      event('ME-OVERDUE', [], { verificationStatus: 'verifying', nextReviewAt: today(7) }),
      event('ME-TAKEN', [], { lifecycleStatus: 'taken_over', takenOverAt: today(9) }),
      event('ME-OUT', ['A-OUT'], { location: { roadCode: 'G99', direction: 'up', kilometer: 10 } }),
    ];
    const metrics = computeMonitoringMetrics(events, alarms, SIMULATED_USERS[0]!, NOW);
    expect(metrics).toEqual({
      todayDetected: 1,
      currentPending: 2,
      currentVerifying: 2,
      todayConfirmed: 1,
      todayFalsePositive: 1,
      currentOverdue: 1,
      todayTakenOver: 1,
      currentControlHandling: 1,
    });
  });

  it('没有明确nextReviewAt时不擅自按检测时间推算超时', () => {
    expect(isMonitoringVerificationOverdue(event('ME-1', []), NOW)).toBe(false);
    expect(isMonitoringVerificationOverdue(event('ME-2', [], { nextReviewAt: today(7) }), NOW)).toBe(true);
    expect(isMonitoringVerificationOverdue(event('ME-3', [], {
      verificationStatus: 'confirmed', nextReviewAt: today(7), confirmedAt: today(8),
    }), NOW)).toBe(false);
  });
});
