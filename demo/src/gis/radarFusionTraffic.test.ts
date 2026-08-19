import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../domain/event';
import { buildRadarFusionTraffic } from './radarFusionTraffic';
import { demoCaseById } from '../data/demoCases';

const EVENT: SimEvent = {
  id: 'EV-RADAR',
  road: 'G65',
  accidentKp: 1195,
  lanesTotal: 3,
  lanesClosed: 2,
  q: 4300,
  typeNodeId: 'E_追尾',
  label: '雷视融合测试事件',
  startSimSec: 0,
  congested: true,
  w: 12,
};

describe('雷视融合事件孪生车流', () => {
  it('未聚焦事件时不生成孪生车流', () => {
    expect(buildRadarFusionTraffic([EVENT], 60, null).vehicles).toHaveLength(0);
  });

  it('基于当前事件生成车辆、轨迹和覆盖区', () => {
    const traffic = buildRadarFusionTraffic([EVENT], 30 * 60, EVENT.id);

    expect(traffic.coverage[0].label).toContain('雷视融合覆盖');
    expect(traffic.lanes).toHaveLength(EVENT.lanesTotal * 2);
    expect(traffic.vehicles.length).toBeGreaterThan(EVENT.lanesTotal * 5);
    expect(traffic.vehicles.some((vehicle) => vehicle.status === 'queued')).toBe(true);
    expect(traffic.vehicles.some((vehicle) => vehicle.status === 'incident')).toBe(true);
    expect(traffic.vehicles.every((vehicle) => vehicle.trail.length === 2)).toBe(true);
    expect(traffic.vehicles.every((vehicle) => vehicle.body.length === 2)).toBe(true);
  });

  it('车辆随模拟时钟移动且保持目标 ID 稳定', () => {
    const first = buildRadarFusionTraffic([EVENT], 60, EVENT.id).vehicles[0];
    const later = buildRadarFusionTraffic([EVENT], 90, EVENT.id).vehicles[0];

    expect(later.id).toBe(first.id);
    expect(later.kp).not.toBe(first.kp);
  });

  it('案例三全封后按下行桩号方向生成静止排队，不允许穿越事故区', () => {
    const script = demoCaseById('condition-jump').twinScript!;
    const event: SimEvent = {
      ...EVENT,
      id: 'EV-S3',
      accidentKp: 1177.2,
      lanesClosed: 3,
      direction: 'down',
    };
    const traffic = buildRadarFusionTraffic([event], 43 * 60, event.id, [], { eventId: event.id, script });
    const queued = traffic.vehicles.filter((vehicle) => vehicle.status === 'queued');

    expect(traffic.vehicles.every((vehicle) => vehicle.direction === 'increasing')).toBe(true);
    expect(queued).toHaveLength(42);
    expect(queued.every((vehicle) => vehicle.speedKmh === 0)).toBe(true);
    expect(queued.every((vehicle) => vehicle.kp >= 1174.5 && vehicle.kp < event.accidentKp)).toBe(true);
    expect(traffic.vehicles.filter((vehicle) => vehicle.status === 'incident')).toHaveLength(3);
  });
});
