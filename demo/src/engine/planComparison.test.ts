import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../domain/event';
import { buildPlanV1 } from './planBuilder';
import { runReasoning } from './reasoner';
import { buildPlanCandidates } from './planComparison';

const event: SimEvent = {
  id: 'EV-COMPARE', road: 'G65', accidentKp: 1165, lanesTotal: 3, lanesClosed: 2, q: 4300,
  typeNodeId: 'E_追尾', label: '追尾', startSimSec: 0, congested: true, w: 9.8, sourceKind: 'CAM 视频检出', direction: 'up',
};

describe('候选方案对比', () => {
  it('在相同预测窗口内生成可比较且措施不同的 A/B/C 策略', () => {
    const reason = runReasoning({ ...event, eventId: event.id, eventLabel: event.label });
    const plan = buildPlanV1(event, reason.measures);
    const candidates = buildPlanCandidates(event, plan.measures);
    expect(candidates.map((candidate) => candidate.id)).toEqual(['A', 'B', 'C']);
    expect(new Set(candidates.map((candidate) => candidate.effect.horizonMin))).toEqual(new Set([30]));
    expect(candidates[0].recommended).toBe(true);
    expect(candidates[1].measures.some((measure) => measure.measureId === 'M_预置分流')).toBe(false);
    expect(candidates[2].measures.some((measure) => measure.measureId === 'M_提前分流')).toBe(true);
    expect(candidates[2].effect.maxQueueKm).toBeLessThan(candidates[0].effect.maxQueueKm);
    expect(candidates.every((candidate) => candidate.confidence.score >= 0 && candidate.confidence.score <= 100)).toBe(true);
  });
});
