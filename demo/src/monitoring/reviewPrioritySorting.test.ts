import { describe, expect, it } from 'vitest';
import type { MonitoringEvent } from '../domain/monitoring';
import { SIMULATED_USERS } from './permissions';
import { buildMonitoringListItems } from './selectors';
import { DEFAULT_MONITORING_FILTERS } from './uiState';

function event(id: string, overrides: Partial<MonitoringEvent> = {}): MonitoringEvent {
  return {
    monitoringEventId: id,
    version: 1,
    alarmIds: [],
    eventType: 'abnormal_stop',
    location: { roadCode: 'G65', direction: 'up' },
    suggestedLevel: 'L2',
    verificationStatus: 'pending',
    lifecycleStatus: 'monitoring',
    observationCount: 0,
    conflicts: [],
    detectedAt: '2026-08-25T02:00:00.000Z',
    updatedAt: '2026-08-25T02:00:00.000Z',
    simulation: true,
    ...overrides,
  };
}

describe('AC6 新证据复核置顶', () => {
  it('新证据复核标记优先于等级和超时排序，认领清标记后恢复默认排序', () => {
    const monitor = SIMULATED_USERS.find((user) => user.role === 'monitor');
    expect(monitor).toBeDefined();
    const overdueL4 = event('ME-L4', {
      suggestedLevel: 'L4',
      verificationStatus: 'verifying',
      nextReviewAt: '2026-08-25T01:00:00.000Z',
    });
    const evidenceReview = event('ME-REVIEW', {
      suggestedLevel: 'L2',
      reviewPriorityAt: '2026-08-25T02:10:00.000Z',
      updatedAt: '2026-08-25T02:10:00.000Z',
    });
    const sorted = buildMonitoringListItems({
      events: [overdueL4, evidenceReview], alarms: [], handoffs: [], filters: DEFAULT_MONITORING_FILTERS,
      sort: 'default_priority', user: monitor!, operationalNowMs: Date.parse('2026-08-25T02:20:00.000Z'),
    });
    expect(sorted.map((item) => item.event.monitoringEventId)).toEqual(['ME-REVIEW', 'ME-L4']);

    const restored = buildMonitoringListItems({
      events: [overdueL4, { ...evidenceReview, reviewPriorityAt: undefined }], alarms: [], handoffs: [],
      filters: DEFAULT_MONITORING_FILTERS, sort: 'default_priority', user: monitor!,
      operationalNowMs: Date.parse('2026-08-25T02:20:00.000Z'),
    });
    expect(restored[0]?.event.monitoringEventId).toBe('ME-L4');
  });
});
