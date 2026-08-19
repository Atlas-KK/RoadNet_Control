import { describe, expect, it } from 'vitest';
import type { Resource } from '../data/resources';
import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import { buildCongestionSegments, congestionColor, resolveResourcePositions } from './twinMapModel';
import { demoCaseById } from '../data/demoCases';

const EVENT: SimEvent = {
  id: 'EV-TEST',
  road: 'G65',
  accidentKp: 1195,
  lanesTotal: 3,
  lanesClosed: 2,
  q: 2000,
  typeNodeId: 'E_追尾',
  label: '测试事件',
  startSimSec: 0,
  congested: true,
  w: 12,
};

const RESOURCE: Resource = {
  id: 'W-T',
  label: '测试清障车',
  kind: 'wrecker',
  road: 'G65',
  homeKp: 1175,
  driveSpeed: 60,
  status: 'idle',
  station: '测试驻点',
  contact: '测试联系人',
  phone: '029-00000000',
};

describe('双 GIS 共享地图模型', () => {
  it('统一映射拥堵颜色边界', () => {
    expect(congestionColor(1.9)).toBe('#e4b13f');
    expect(congestionColor(2)).toBe('#ef7f3b');
    expect(congestionColor(5)).toBe('#ef4e50');
  });

  it('按模拟时钟生成上游拥堵线段', () => {
    const [segment] = buildCongestionSegments([EVENT], 30 * 60);
    expect(segment.lengthKm).toBe(6);
    expect(segment.coordinates.length).toBeGreaterThan(2);
    // 队尾桩号 = 事故点 − 排队长度，且队尾坐标即折线上游端点。
    expect(segment.tailKp).toBe(1189);
    expect(segment.tailCoordinate).toEqual(segment.coordinates[0]);
  });

  it('按已下发措施 ETA 插值资源位置', () => {
    const plan: Plan = {
      id: 'PLAN-EV-TEST',
      version: 1,
      label: '测试预案',
      state: '已下发',
      responsible: '测试单位',
      confidence: '测试',
      measures: [{
        id: 'M-T',
        measureId: 'M_调清障',
        title: '调派清障',
        tier: '控制类',
        summary: '测试',
        params: {},
        resource: { id: RESOURCE.id, etaMin: 20 },
        supports: [],
        runState: '已下发',
        shownAtMs: 0,
        confirmSimSec: 0,
      }],
    };
    const [position] = resolveResourcePositions([RESOURCE], [EVENT], [plan], {}, 10 * 60);
    expect(position.currentKp).toBe(1185);
    expect(position.occupied).toBe(false);
  });

  it('案例三按脚本将路政落到 VMS-05，并用脚本队尾覆盖通用流模型', () => {
    const script = demoCaseById('condition-jump').twinScript!;
    const active = { eventId: EVENT.id, script };
    const patrol: Resource = { ...RESOURCE, id: 'L-01', kind: 'patrol', homeKp: 1150 };
    const [position] = resolveResourcePositions([patrol], [EVENT], [], {}, 50 * 60, active);
    const [segment] = buildCongestionSegments([{ ...EVENT, accidentKp: 1177.2 }], 50 * 60, [], active);

    expect(position.currentKp).toBe(1168);
    expect(position.statusLabel).toContain('到位');
    expect(segment.tailKp).toBe(1173.8);
  });
});
