import { describe, expect, it } from 'vitest';
import { traverseUpstreamHubs, type HubSpec } from './traversal';
import { computeFlow } from './flowModel';

// S5 EV-A：G65 K1165.8 三车追尾，q=5200 → w≈9.85。
const flowA = computeFlow({ eventId: 'EV-A', accidentKp: 1165.8, lanesTotal: 3, lanesClosed: 2, q: 5200 });
const HUB_1160: HubSpec = { id: 'K1160枢纽', road: 'G65', kp: 1160, crossRoad: 'G56' };

describe('变长枢纽遍历与自引用检测', () => {
  it('EV-A 回溯速度 w≈9.8 km/h', () => {
    expect(flowA.w).toBeCloseTo(9.8, 1);
  });

  it('S5 自引用命中：排队 35.5min 到达 K1160 枢纽，G56=当前分流承接线', () => {
    const r = traverseUpstreamHubs({
      event: { road: 'G65', accidentKp: 1165.8, w: flowA.w },
      hubsUpstream: [HUB_1160],
      currentDiversionConnector: 'G56',
    });
    expect(r.selfReference?.hub.id).toBe('K1160枢纽');
    expect(r.actionWindowMin).toBeCloseTo(35.5, 0); // 5.8km / 9.85 * 60 ≈ 35.3
    expect(r.recommendation).toContain('K1140');
  });

  it('分流承接线不经过枢纽交叉线 → 无自引用冲突', () => {
    const r = traverseUpstreamHubs({
      event: { road: 'G65', accidentKp: 1165.8, w: flowA.w },
      hubsUpstream: [HUB_1160],
      currentDiversionConnector: 'S204',
    });
    expect(r.selfReference).toBeUndefined();
    expect(r.recommendation).toContain('可维持');
  });

  it('最大深度限制遍历枢纽数', () => {
    const hubs: HubSpec[] = [
      { id: 'H1', road: 'G65', kp: 1160, crossRoad: 'G56' },
      { id: 'H2', road: 'G65', kp: 1150, crossRoad: 'S204' },
      { id: 'H3', road: 'G65', kp: 1140, crossRoad: 'S204' },
    ];
    const r = traverseUpstreamHubs({ event: { road: 'G65', accidentKp: 1165.8, w: flowA.w }, hubsUpstream: hubs, maxDepth: 2 });
    expect(r.reaches).toHaveLength(2);
  });
});
