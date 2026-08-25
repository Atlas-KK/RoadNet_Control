import { freezeAlarm, type MonitoringEvent } from '../../domain/monitoring';
import type { MonitoringListItem } from '../selectors';

export function monitoringListItemFixture(withVideo = true): MonitoringListItem {
  const alarm = freezeAlarm({
    alarmId: 'ALM-UI-001', sourceAlarmId: 'SRC-UI-001', sourceType: 'video_ai', sourceSystem: '模拟视频算法平台',
    eventType: 'fire', detectedAt: '2026-08-25T02:00:00.000Z', firstReceivedAt: '2026-08-25T02:00:01.000Z',
    location: { roadCode: 'G65', direction: 'up', kilometer: 128.6, facilityId: 'TUN-G65-129', facilityType: 'tunnel', laneIds: ['1', '2'], deviceId: 'CAM-G65-129-01' },
    confidence: 0.94, algorithmVersion: 'v1.0', modelName: '模拟视频事件检测算法', rawPayloadRef: 'demo-payload://fire/1',
    evidenceIds: withVideo ? ['EVD-UI-FRAME', 'EVD-UI-VIDEO'] : ['EVD-UI-FRAME'], simulation: true,
  });
  const event: MonitoringEvent = {
    monitoringEventId: 'ME-UI-001', version: 1, alarmIds: [alarm.alarmId], eventType: 'fire', location: alarm.location,
    suggestedLevel: 'L4', verificationStatus: 'pending', lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [],
    detectedAt: alarm.detectedAt, updatedAt: alarm.detectedAt, simulation: true,
  };
  return {
    event, alarms: [alarm], primaryAlarm: alarm, displayLevel: 'L4', eventConfidence: 0.94,
    overdue: true, hasConflict: false, takenOver: false,
  };
}
