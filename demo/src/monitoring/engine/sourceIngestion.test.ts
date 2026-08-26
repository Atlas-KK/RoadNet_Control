import { describe, expect, it } from 'vitest';
import type { Alarm, MonitoringEvent } from '../../domain/monitoring';
import { monitoringEventIdForCorrelation, projectSourceAlarmToMonitoringEvent } from './sourceIngestion';

const alarm = (eventType: Alarm['eventType'] = 'abnormal_stop'): Alarm => ({
  alarmId: 'ALM-1', sourceAlarmId: 'SRC-1', sourceType: 'video_ai', sourceSystem: 'DEMO', eventType,
  detectedAt: '2026-08-25T01:00:00.000Z', firstReceivedAt: '2026-08-25T01:00:00.000Z',
  location: { roadCode: 'G65', direction: 'up', kilometer: 128.6, facilityId: 'ROAD-G65-128', laneIds: ['1'] },
  confidence: 0.9, rawPayloadRef: 'demo://1', evidenceIds: ['E1'], simulation: true,
});

describe('FR-EM-002 来源告警事件投影', () => {
  it('按correlationId生成稳定事件ID并创建待核实事件', () => {
    const event = projectSourceAlarmToMonitoringEvent({
      correlationId: 'CORR-abnormal-stop-1', alarm: alarm(),
      observedFacts: { eventType: 'abnormal_stop', lanesAffected: 1, lanesTotal: 3 },
      occurredAt: '2026-08-25T01:00:01.000Z',
    });
    expect(event.monitoringEventId).toBe(monitoringEventIdForCorrelation('CORR-abnormal-stop-1'));
    expect(event.sourceFacts).toMatchObject({
      eventType: 'abnormal_stop', lanesAffected: 1, lanesTotal: 3,
    });
    expect(event).toMatchObject({ version: 1, verificationStatus: 'pending', lifecycleStatus: 'monitoring' });
  });

  it('连续告警只追加alarmId并升级建议等级，不覆盖人工核实状态', () => {
    const existing: MonitoringEvent = {
      ...projectSourceAlarmToMonitoringEvent({
        correlationId: 'CORR-1', alarm: alarm(), observedFacts: { eventType: 'abnormal_stop' },
        occurredAt: '2026-08-25T01:00:01.000Z',
      }),
      version: 4, verificationStatus: 'verifying', verificationOwnerId: 'USR-MONITOR-01', confirmedLevel: 'L3',
    };
    const next = projectSourceAlarmToMonitoringEvent({
      correlationId: 'CORR-1', existingEvent: existing,
      alarm: { ...alarm(), alarmId: 'ALM-2', sourceAlarmId: 'SRC-2' },
      observedFacts: { eventType: 'abnormal_stop', lanesAffected: 1, lanesTotal: 3, flowVehPerHour: 1600 },
      occurredAt: '2026-08-25T01:00:20.000Z',
    });
    expect(next.alarmIds).toEqual(['ALM-1', 'ALM-2']);
    expect(next).toMatchObject({ version: 5, suggestedLevel: 'L2', confirmedLevel: 'L3', verificationStatus: 'verifying', verificationOwnerId: 'USR-MONITOR-01' });
    expect(next.sourceFacts).toMatchObject({ lanesAffected: 1, lanesTotal: 3, flowVehPerHour: 1600 });
  });

  it('隧道明火与全幅受阻形成L4建议但不形成自动人工确认', () => {
    const event = projectSourceAlarmToMonitoringEvent({
      correlationId: 'CORR-FIRE', alarm: { ...alarm('fire'), location: { ...alarm('fire').location, facilityId: 'TUN-G75-088', facilityType: 'tunnel' } },
      observedFacts: { eventType: 'fire', lanesAffected: 3, lanesTotal: 3, notes: '检测到明火和浓烟' },
      occurredAt: '2026-08-25T01:00:01.000Z',
    });
    expect(event.suggestedLevel).toBe('L4');
    expect(event.confirmedLevel).toBeUndefined();
  });
});
