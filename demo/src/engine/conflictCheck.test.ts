import { describe, expect, it } from 'vitest';
import { buildAnchorIndex, checkDiversionConflict, type ActiveEventLite } from './conflictCheck';
import { computeFlow } from './flowModel';

// S1 背景事件 EV-B：G56 K30 货车侧翻，q=3388、vf=100，占 1/2 车道 → w≈7.55。
const flowB = computeFlow({ eventId: 'EV-B', accidentKp: 30, lanesTotal: 2, lanesClosed: 1, q: 3388, vf: 100 });
const EV_B: ActiveEventLite = { id: 'EV-B', road: 'G56', accidentKp: 30, w: flowB.w, congested: flowB.congested };

// S1 分流路径：经承接段 G56 K27 汇入，A 路径距离 21km、建议车速 70。
const S1_PATH = { connectorRoad: 'G56' as const, mergeKp: 27, pathDistanceKm: 21, suggestedSpeedKmh: 70 };

describe('跨事件分流冲突校验', () => {
  it('EV-B 回溯速度 w≈7.55 km/h', () => {
    expect(flowB.w).toBeCloseTo(7.55, 1);
  });

  it('S1 时间窗重叠 → 裁剪分流（T_conflict≈24 ≥ T_arrive=18 − 缓冲）', () => {
    const r = checkDiversionConflict(S1_PATH, [EV_B]);
    expect(r.status).toBe('conflict');
    expect(r.conflictEventId).toBe('EV-B');
    expect(r.tConflictMin).toBeCloseTo(23.8, 0);
    expect(r.tArriveMin).toBeCloseTo(18, 5);
  });

  it('承接路径无活跃拥堵事件 → 通过', () => {
    const r = checkDiversionConflict(S1_PATH, []);
    expect(r.status).toBe('pass');
  });

  it('汇入区上游的事件不构成冲突（队尾不覆盖汇入区）', () => {
    const upstream: ActiveEventLite = { ...EV_B, accidentKp: 20 }; // 20 < mergeKp 27
    const r = checkDiversionConflict(S1_PATH, [upstream]);
    expect(r.status).toBe('pass');
  });

  it('锚点索引按 road:kpBucket 反查活跃实例', () => {
    const index = buildAnchorIndex([EV_B]);
    expect(index.get('G56:30')).toEqual(['EV-B']);
  });
});
