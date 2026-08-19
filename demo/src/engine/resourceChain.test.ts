import { describe, expect, it } from 'vitest';
import { parseElapsedWorkMin, resolveResourceChain, waitReleaseEta } from './resourceChain';
import { RESOURCES, resourceById } from '../data/resources';

describe('资源链式挤兑推理', () => {
  it('解析演化阶段已作业分钟', () => {
    expect(parseElapsedWorkMin('清障作业中（已 28min）')).toBe(28);
    expect(parseElapsedWorkMin('清障作业中')).toBe(0);
    expect(parseElapsedWorkMin(undefined)).toBe(0);
  });

  it('S2 等待释放路线：W-01 剩余17 + 转场24 = 41min', () => {
    const w01 = resourceById('W-01')!;
    const r = waitReleaseEta(w01, 1210, { id: 'EV-A', accidentKp: 1180, stage: '清障作业中（已 28min）' });
    expect(r.remainingWorkMin).toBe(17);
    expect(r.transferMin).toBe(24);
    expect(r.etaMin).toBe(41);
  });

  it('S2 全链：等待释放 41min 优于跨辖区 48min', () => {
    const chain = resolveResourceChain({
      resources: RESOURCES,
      occupancy: { 'W-01': 'EV-A', 'W-02': 'EV-A' },
      events: [{ id: 'EV-A', accidentKp: 1180, stage: '清障作业中（已 28min）' }],
      targetKp: 1210,
      targetRoad: 'G65',
    });
    expect(chain.recommended?.resource.id).toBe('W-01');
    expect(chain.recommended?.etaMin).toBe(41);
    const wex = chain.candidates.find((c) => c.resource.id === 'W-EX');
    expect(wex?.etaMin).toBe(48);
    expect(chain.reason).toContain('快 7min');
  });

  it('无占用时 idle 清障车按纯车程取胜', () => {
    const chain = resolveResourceChain({
      resources: RESOURCES,
      occupancy: {},
      events: [],
      targetKp: 1195,
      targetRoad: 'G65',
    });
    // W-01/W-02 驻点 K1150 → |1150-1195|/75*60 = 36min，优于 W-EX 48min
    expect(chain.recommended?.etaMin).toBe(36);
    expect(chain.recommended?.mode).toBe('idle');
  });

  it('跨路段清障车不进入候选池：G65 目标不得推荐 G65S 驻点的 W-S01', () => {
    const chain = resolveResourceChain({
      resources: RESOURCES,
      occupancy: {},
      events: [],
      targetKp: 1195,
      targetRoad: 'G65',
    });
    expect(chain.candidates.some((c) => c.resource.id === 'W-S01')).toBe(false);
  });

  it('同路目标下 W-S01 是候选；异路目标（G65）下换成 G65S 目标即可推荐 W-S01', () => {
    const chain = resolveResourceChain({
      resources: RESOURCES,
      occupancy: {},
      events: [],
      targetKp: 1260, // 终南山隧道段，同属 G65S
      targetRoad: 'G65S',
    });
    expect(chain.recommended?.resource.id).toBe('W-S01');
  });

  it('跨辖区资源（crossJurisdiction）不受同路限制，任意目标道路均可入池', () => {
    const chain = resolveResourceChain({
      resources: RESOURCES,
      occupancy: {},
      events: [],
      targetKp: 1260,
      targetRoad: 'G65S',
    });
    expect(chain.candidates.some((c) => c.resource.id === 'W-EX')).toBe(true);
  });
});
