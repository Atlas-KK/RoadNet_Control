import { describe, expect, it } from 'vitest';
import { freezeAlarm, isActiveMonitoringLifecycle, isMonitoringEventType, type Alarm } from './monitoring';

const ALARM: Alarm = {
  alarmId: 'ALM-001',
  sourceAlarmId: 'SRC-001',
  sourceType: 'video_ai',
  sourceSystem: 'demo-video-ai',
  eventType: 'abnormal_stop',
  detectedAt: '2026-08-25T02:00:00.000Z',
  firstReceivedAt: '2026-08-25T02:00:01.000Z',
  location: { roadCode: 'G65', direction: 'up', kilometer: 1195, laneIds: ['1'] },
  confidence: 0.91,
  rawPayloadRef: 'demo://alarm/SRC-001',
  evidenceIds: ['EVD-001'],
  simulation: true,
};

describe('FR-EM-002 监测领域模型', () => {
  it('只接受PRD确认的八类P0事件', () => {
    expect(isMonitoringEventType('fire')).toBe(true);
    expect(isMonitoringEventType('bridge_collapse')).toBe(false);
  });

  it('Alarm及其嵌套字段创建后不可变', () => {
    const alarm = freezeAlarm(ALARM);
    expect(Object.isFrozen(alarm)).toBe(true);
    expect(Object.isFrozen(alarm.location)).toBe(true);
    expect(Object.isFrozen(alarm.evidenceIds)).toBe(true);
    expect(Object.isFrozen(alarm.location.laneIds)).toBe(true);
  });

  it('resolved和closed不进入活跃投影', () => {
    expect(isActiveMonitoringLifecycle('monitoring')).toBe(true);
    expect(isActiveMonitoringLifecycle('taken_over')).toBe(true);
    expect(isActiveMonitoringLifecycle('resolved')).toBe(false);
    expect(isActiveMonitoringLifecycle('closed')).toBe(false);
  });
});
