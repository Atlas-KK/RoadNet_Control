import { describe, expect, it } from 'vitest';
import { freezeAlarm, type Alarm, type MonitoringEvent } from '../domain/monitoring';
import { SIMULATED_USERS } from './permissions';
import { DEFAULT_MONITORING_FILTERS, type MonitoringFilters } from './uiState';
import { buildMonitoringListItems, monitoringFilterOptionValues } from './selectors';

const NOW = new Date(2026, 7, 25, 12).getTime();
const time = (hour: number) => new Date(2026, 7, 25, hour).toISOString();

function alarm(id: string, eventType: Alarm['eventType'], confidence: number, deviceId = 'CAM-01'): Alarm {
  return freezeAlarm({
    alarmId: id, sourceAlarmId: `SRC-${id}`, sourceType: 'video_ai', sourceSystem: 'VIDEO-A', eventType,
    detectedAt: time(8), firstReceivedAt: time(8), location: { roadCode: 'G65', direction: 'up', kilometer: 100, deviceId },
    confidence, rawPayloadRef: `demo://${id}`, evidenceIds: [`EVD-${id}-FRAME`], simulation: true,
  });
}

function event(id: string, alarmIds: string[], overrides: Partial<MonitoringEvent> = {}): MonitoringEvent {
  return {
    monitoringEventId: id, version: 1, alarmIds, eventType: 'traffic_accident',
    location: { roadCode: 'G65', direction: 'up', kilometer: 100 }, suggestedLevel: 'L2', verificationStatus: 'pending',
    lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [], detectedAt: time(8), updatedAt: time(8), simulation: true,
    ...overrides,
  };
}

function filters(overrides: Partial<MonitoringFilters> = {}): MonitoringFilters {
  return { ...structuredClone(DEFAULT_MONITORING_FILTERS), ...overrides };
}

describe('FR-EM-004 列表投影、筛选和排序', () => {
  const alarms = [
    alarm('A-OVERDUE', 'traffic_accident', 0.8, 'CAM-OVERDUE'),
    alarm('A-L4', 'fire', 0.96, 'CAM-FIRE'),
    alarm('A-PENDING', 'traffic_accident', 0.72, 'CAM-PENDING'),
    alarm('A-OUT', 'fire', 0.99, 'CAM-OUT'),
  ];
  const events = [
    event('ME-PENDING', ['A-PENDING'], { detectedAt: time(10) }),
    event('ME-L4', ['A-L4'], { eventType: 'fire', suggestedLevel: 'L4', verificationStatus: 'confirmed', detectedAt: time(9), confirmedAt: time(10) }),
    event('ME-OVERDUE', ['A-OVERDUE'], { verificationStatus: 'verifying', nextReviewAt: time(7), detectedAt: time(7) }),
    event('ME-OUT', ['A-OUT'], { eventType: 'fire', suggestedLevel: 'L4', location: { roadCode: 'G50', direction: 'up', kilometer: 20 } }),
  ];

  it('默认顺序为超时、严重等级、待核实、检测时间倒序，并过滤越权事件', () => {
    const result = buildMonitoringListItems({
      events, alarms, handoffs: [], filters: filters(), sort: 'default_priority', user: SIMULATED_USERS[0]!, operationalNowMs: NOW,
    });
    expect(result.map((item) => item.event.monitoringEventId)).toEqual(['ME-OVERDUE', 'ME-L4', 'ME-PENDING']);
  });

  it('组合应用事件类型、状态、等级、设备、置信度和关键词', () => {
    const result = buildMonitoringListItems({
      events, alarms, handoffs: [],
      filters: filters({ eventTypes: ['fire'], verificationStatuses: ['confirmed'], levels: ['L4'], deviceIds: ['CAM-FIRE'], minimumConfidence: 0.9, keyword: '火灾' }),
      sort: 'detected_desc', user: SIMULATED_USERS[0]!, operationalNowMs: NOW,
    });
    expect(result.map((item) => item.event.monitoringEventId)).toEqual(['ME-L4']);
  });

  it('指标快捷筛选使用对应业务时间字段', () => {
    const result = buildMonitoringListItems({
      events, alarms, handoffs: [], filters: filters({ quickMetric: 'today_confirmed' }), sort: 'default_priority',
      user: SIMULATED_USERS[0]!, operationalNowMs: NOW,
    });
    expect(result.map((item) => item.event.monitoringEventId)).toEqual(['ME-L4']);
  });

  it('筛选项只从已有道路和设备去重生成', () => {
    expect(monitoringFilterOptionValues(events, alarms)).toEqual({
      roadCodes: ['G50', 'G65'], deviceIds: ['CAM-FIRE', 'CAM-OUT', 'CAM-OVERDUE', 'CAM-PENDING'],
    });
  });
});
