import { describe, expect, it } from 'vitest';
import type { ControlEventUpdate } from '../../domain/handoff';
import type { MonitoringEvent } from '../../domain/monitoring';
import { applyControlEventUpdateRule } from './syncRules';

const event: MonitoringEvent = {
  monitoringEventId: 'ME-9', version: 5, alarmIds: [], eventType: 'traffic_accident',
  location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, suggestedLevel: 'L3', confirmedLevel: 'L3',
  verificationStatus: 'confirmed', lifecycleStatus: 'taken_over', observationCount: 0, conflicts: [],
  controlEventId: 'CE-9', handoffId: 'HO-9', detectedAt: '2026-08-25T00:00:00.000Z',
  updatedAt: '2026-08-25T00:01:00.000Z', simulation: true,
};

function update(patch: Partial<ControlEventUpdate> = {}): ControlEventUpdate {
  return {
    messageId: 'MSG-C-1', correlationId: 'HO-9', streamSequence: 1, controlEventId: 'CE-9', handoffId: 'HO-9',
    controlEventVersion: 1, occurredAt: '2026-08-25T00:02:00.000Z', eventLifecycleStatus: 'handling',
    controlPhase: 'review', simulation: true, ...patch,
  };
}

describe('阶段9管控回写纯规则', () => {
  it.each(['已完成', '已作废', '已被替换'])('planState=%s只更新摘要，不关闭或恢复监测事件', (planState) => {
    const output = applyControlEventUpdateRule(event, update({ planState }));
    expect(output.code).toBe('APPLIED'); expect(output.event.lifecycleStatus).toBe('taken_over');
    expect(output.event.controlSummary?.planState).toBe(planState);
  });
  it('关闭没有closureDecision时拒绝', () => {
    expect(applyControlEventUpdateRule(event, update({ eventLifecycleStatus: 'closed' })).code).toBe('CLOSURE_DECISION_REQUIRED');
  });
  it('有效事件级决定可以解除或关闭', () => {
    const closureDecision = { decisionId: 'D-1', decidedAt: '2026-08-25T00:03:00.000Z', decidedBy: 'USR-D', reason: '现场清撤完成' };
    expect(applyControlEventUpdateRule(event, update({ eventLifecycleStatus: 'resolved', closureDecision })).event.lifecycleStatus).toBe('resolved');
    expect(applyControlEventUpdateRule(event, update({ eventLifecycleStatus: 'closed', closureDecision })).event.lifecycleStatus).toBe('closed');
  });
  it('旧实体版本不覆盖新摘要', () => {
    const current = { ...event, controlSummary: { eventLifecycleStatus: 'handling' as const, controlPhase: 'executing' as const, controlEventVersion: 3, lastMessageId: 'M3', lastStreamSequence: 3, updatedAt: event.updatedAt } };
    expect(applyControlEventUpdateRule(current, update({ controlEventVersion: 2 })).code).toBe('STALE_ENTITY_VERSION');
  });
});
