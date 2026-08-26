import { describe, expect, it } from 'vitest';
import type { MonitoringEvent } from '../../domain/monitoring';
import { SIMULATED_USERS } from '../permissions';
import { buildHandoffRequest, deriveConfirmedEventFacts, evaluateHandoffDecision } from './handoffRules';

const base: MonitoringEvent = {
  monitoringEventId: 'ME-8', version: 3, alarmIds: [], eventType: 'traffic_accident',
  location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, suggestedLevel: 'L3',
  verificationStatus: 'confirmed', lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [],
  detectedAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:01:00.000Z', simulation: true,
};

describe('阶段8接管规则', () => {
  it('L3必须有可解释复合条件，且仅允许人工发起', () => {
    const decision = evaluateHandoffDecision({ ...base, confirmedLevel: 'L3', suggestedLevelReasonCodes: ['LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT'] });
    expect(decision).toMatchObject({ eligible: true, mode: 'user', level: 'L3' });
    expect(decision.reasons).toEqual(['受影响车道数达到配置阈值']);
  });
  it('仅AI建议L4不自动接管，人工确认L4后由规则发起', () => {
    expect(evaluateHandoffDecision({ ...base, suggestedLevel: 'L4', confirmedLevel: undefined, verificationStatus: 'pending' }).eligible).toBe(false);
    expect(evaluateHandoffDecision({ ...base, suggestedLevel: 'L4', confirmedLevel: 'L4' })).toMatchObject({ eligible: true, mode: 'rule', level: 'L4' });
  });

  it('接管请求保留来源侧总车道数、流量和车速', () => {
    const event = {
      ...base,
      confirmedLevel: 'L3' as const,
      suggestedLevelReasonCodes: ['LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT'],
      sourceFacts: {
        eventType: 'traffic_accident' as const,
        location: { ...base.location, facilityType: 'tunnel' as const },
        lanesAffected: 2, lanesTotal: 3, flowVehPerHour: 1800, speedKmh: 35,
      },
    };
    const facts = deriveConfirmedEventFacts(event, []);
    const request = buildHandoffRequest({
      event, facts, decision: evaluateHandoffDecision(event), actor: SIMULATED_USERS[0]!,
      requestedAt: '2026-08-25T02:00:00.000Z',
    });
    expect(facts).toMatchObject({ lanesAffected: 2, lanesTotal: 3, flowVehPerHour: 1800, speedKmh: 35 });
    expect(request.context.trafficSnapshot).toEqual({ queueLengthKm: undefined, flowVehPerHour: 1800, speedKmh: 35 });
  });
  it('L1/L2默认不接管', () => expect(evaluateHandoffDecision({ ...base, confirmedLevel: 'L2' }).eligible).toBe(false));
});
