import { describe, expect, it } from 'vitest';
import type { CalcRecord } from './trace';
import { summarizeEventCalcs } from './calcSummary';
import { computeFlow, queueLength, timeToPoint } from './flowModel';

describe('flowModel', () => {
  it('复现 S1 的拥堵回溯速度', () => {
    const result = computeFlow({
      eventId: 'EV-A',
      accidentKp: 1180,
      lanesTotal: 3,
      lanesClosed: 2,
      q: 4300,
    });

    expect(result.congested).toBe(true);
    expect(result.C_b).toBe(1530);
    expect(result.w).toBeCloseTo(7.27, 2);
    expect(queueLength(result.w, 30)).toBeCloseTo(3.64, 2);
    expect(result.calcs[3].conclusion).toContain('已形成排队');
    expect(result.calcs[3].conclusion).toContain('向上游回溯');
    expect(result.calcs[0].summaryRole).toBe('capacity');
    expect(result.calcs[3].summaryRole).toBe('spillbackSpeed');
  });

  it('为未形成排队的结果生成面向值班人员的结论', () => {
    const result = computeFlow({
      eventId: 'EV-B',
      accidentKp: 1180,
      lanesTotal: 3,
      lanesClosed: 1,
      q: 1800,
    });

    expect(result.congested).toBe(false);
    expect(result.calcs[3].conclusion).toContain('暂不形成排队');
    expect(result.calcs[3].conclusionTone).toBe('success');
  });

  it('生成本次事件的交通流综合结论', () => {
    const result = computeFlow({
      eventId: 'EV-A',
      accidentKp: 1180,
      lanesTotal: 3,
      lanesClosed: 2,
      q: 4300,
    });

    const summary = summarizeEventCalcs(result.calcs, 'EV-A');

    expect(summary?.text).toContain('瓶颈通行能力 1530 veh/h');
    expect(summary?.text).toContain('行驶密度 39.1 veh/km');
    expect(summary?.text).toContain('排队密度 420 veh/km');
    expect(summary?.text).toContain('队尾回溯速度 7.3 km/h');
    expect(summary?.tone).toBe('danger');
  });

  it('兼容未带 summaryRole 的旧计算记录', () => {
    const legacy: CalcRecord[] = [
      { id: 'C-EV-OLD-01', eventId: 'EV-OLD', label: '瓶颈通行能力', formula: '', substitution: '', result: '= 1530 veh/h', badges: [] },
      { id: 'C-EV-OLD-02', eventId: 'EV-OLD', label: '行驶密度', formula: '', substitution: '', result: '= 39.1 veh/km', badges: [] },
      { id: 'C-EV-OLD-03', eventId: 'EV-OLD', label: '排队密度', formula: '', substitution: '', result: '= 420 veh/km', badges: [] },
      { id: 'C-EV-OLD-04', eventId: 'EV-OLD', label: '排队回溯速度', formula: '', substitution: '', result: '= 7.3 km/h', badges: [] },
    ];

    const summary = summarizeEventCalcs(legacy, 'EV-OLD');

    expect(summary?.text).toContain('瓶颈通行能力 1530 veh/h');
    expect(summary?.text).toContain('行驶密度 39.1 veh/km');
    expect(summary?.text).toContain('排队密度 420 veh/km');
    expect(summary?.text).toContain('队尾回溯速度 7.3 km/h');
  });

  it('无排队时到达时间为无穷大', () => {
    expect(timeToPoint(5, 0)).toBe(Infinity);
  });

  it('拒绝非法车道和密度参数', () => {
    expect(() =>
      computeFlow({
        eventId: 'BAD-LANE',
        accidentKp: 1180,
        lanesTotal: 2,
        lanesClosed: 3,
        q: 2000,
      }),
    ).toThrow('车道参数非法');

    expect(() =>
      computeFlow({
        eventId: 'BAD-DENSITY',
        accidentKp: 1180,
        lanesTotal: 1,
        lanesClosed: 1,
        q: 20000,
        vf: 50,
      }),
    ).toThrow('排队密度必须大于行驶密度');
  });
});
