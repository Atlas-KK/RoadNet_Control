import { describe, expect, it } from 'vitest';
import type { Plan } from '../domain/plan';
import type { SimEvent } from '../domain/event';
import { resolveTrafficResponse } from './trafficResponse';

const EVENT: SimEvent = {
  id: 'EV-RESPONSE',
  road: 'G65',
  accidentKp: 1180,
  lanesTotal: 3,
  lanesClosed: 2,
  q: 4300,
  typeNodeId: 'E_追尾',
  label: '测试追尾',
  startSimSec: 0,
  congested: true,
  w: 9,
};

const PLAN: Plan = {
  id: 'PLAN-EV-RESPONSE',
  version: 1,
  label: 'V1 初报',
  state: '已下发',
  responsible: '测试',
  confidence: '测试',
  measures: [
    { id: 'm-close', measureId: 'M_封车道', title: '封闭车道', tier: '控制类', summary: '', params: {}, supports: [], runState: '已下发', shownAtMs: 0, confirmSimSec: 600 },
    { id: 'm-diversion', measureId: 'M_提前分流', title: '提前分流', tier: '控制类', summary: '', params: {}, supports: [], runState: '已下发', shownAtMs: 0, confirmSimSec: 600 },
    { id: 'm-speed', measureId: 'M_限速', title: '上游限速', tier: '控制类', summary: '', params: {}, supports: [], runState: '已下发', shownAtMs: 0, confirmSimSec: 600 },
  ],
};

describe('管控后交通响应', () => {
  it('措施下发后由增长切换为消散，队列不再只按时间增长', () => {
    const before = resolveTrafficResponse(EVENT, [PLAN], 600);
    const after = resolveTrafficResponse(EVENT, [PLAN], 900);

    expect(before.stage).toBe('stabilizing');
    expect(after.stage).toBe('dissipating');
    expect(after.queueLengthKm).toBeLessThan(before.queueLengthKm);
    expect(after.queueTailKp).toBeGreaterThan(before.queueTailKp);
  });

  it('没有分流或限速类执行结果时仍保持事故后的增长态势', () => {
    const plan = { ...PLAN, measures: [PLAN.measures[0]] };
    const result = resolveTrafficResponse(EVENT, [plan], 900);

    expect(result.stage).toBe('growing');
    expect(result.queueLengthKm).toBe(2.25);
  });
});
