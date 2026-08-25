import { describe, expect, it } from 'vitest';
import type { HandoffRequest } from '../domain/handoff';
import type { Plan } from '../domain/plan';
import { prepareControlHandoff, sanitizeHandoffPlan } from './controlHandoffIngress';

function request(): HandoffRequest {
  return {
    messageId: 'M', correlationId: 'H', handoffId: 'H', idempotencyKey: 'K', monitoringEventId: 'ME',
    monitoringEventVersion: 2, requestedAt: '2026-08-25T00:00:00.000Z', requestedBy: { mode: 'user', userId: 'U', ruleIds: ['R'] },
    confirmedFacts: { eventType: 'traffic_accident', location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, lanesTotal: 3, lanesAffected: 2 },
    context: { roadCode: 'G65', direction: 'up', configuredSensitiveFacility: false, configuredCriticalNode: false, trafficSnapshot: { flowVehPerHour: 1800 } },
    evidence: [], conflicts: [], rationale: { level: 'L3', reasons: ['车道影响'] }, simulation: true,
  };
}

describe('智能管控接管准备', () => {
  it('缺少研判参数时只创建PlanningGap', () => {
    const value = request(); value.context.trafficSnapshot = undefined;
    const prepared = prepareControlHandoff(value, value.requestedAt);
    expect(prepared.kind).toBe('planning_gap');
    if (prepared.kind === 'planning_gap') expect(prepared.gap.missingFacts).toContain('交通流量');
  });
  it('完整事实映射为现有运行事件输入且保留显式关联', () => {
    const prepared = prepareControlHandoff(request(), '2026-08-25T00:00:00.000Z');
    expect(prepared).toMatchObject({ kind: 'ready', input: { road: 'G65', q: 1800, monitoringHandoff: { idempotencyKey: 'K' } } });
  });
  it('移除空参数措施并禁止自动执行', () => {
    const plan = { id: 'P', version: 1, label: 'x', state: '待确认' as const, responsible: 'x', confidence: 'x', measures: [
      { id: '1', measureId: 'EMPTY', title: 'x', tier: '控制类' as const, summary: 'x', params: {}, supports: [], runState: '自动执行' as const, shownAtMs: 0 },
      { id: '2', measureId: 'OK', title: 'x', tier: '控制类' as const, summary: 'x', params: { kp: { value: 1, source: 'x' } }, supports: [], runState: '自动执行' as const, shownAtMs: 0 },
    ] };
    const result = sanitizeHandoffPlan(plan as Plan);
    expect(result.removedMeasureIds).toEqual(['EMPTY']);
    expect(result.plan.measures).toMatchObject([{ measureId: 'OK', runState: '待确认' }]);
  });
});
