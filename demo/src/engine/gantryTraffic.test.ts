import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../domain/event';
import { congestionLevel, resolveGantryTrafficReading, selectGantryPair } from './gantryTraffic';

const EVENT: SimEvent = {
  id: 'EV-GANTRY',
  road: 'G65',
  accidentKp: 1180,
  lanesTotal: 3,
  lanesClosed: 2,
  q: 4300,
  vf: 110,
  typeNodeId: 'E_追尾',
  label: '门架监测事件',
  startSimSec: 0,
  congested: true,
  w: 7.27,
  direction: 'down',
};

describe('gantry traffic comparison', () => {
  it('searches 10km first and expands to 20km on the same trunk line', () => {
    const pair = selectGantryPair(EVENT);
    expect(pair.upstream?.gantry.id).toBe('G65-GT-1162');
    expect(pair.upstream?.searchRadiusKm).toBe(20);
    expect(pair.downstream?.gantry.id).toBe('G65-GT-1195');
    expect(pair.downstream?.searchRadiusKm).toBe(20);
  });

  it('reverses upstream/downstream selection for the opposite direction', () => {
    const pair = selectGantryPair({ ...EVENT, direction: 'up' });
    expect(pair.upstream?.gantry.id).toBe('G65-GT-1195');
    expect(pair.downstream?.gantry.id).toBe('G65-GT-1162');
  });

  it('generates dynamic demo readings and judges congestion by the lower retention rate', () => {
    const first = resolveGantryTrafficReading(EVENT, [], 0);
    const later = resolveGantryTrafficReading(EVENT, [], 15 * 60);
    const expectedMin = Math.min(first.upstreamPoint!.retentionRate, first.downstreamPoint!.retentionRate);
    expect(first.minRetentionRate).toBe(expectedMin);
    expect(first.congestionLevel).toBe(congestionLevel(expectedMin));
    expect(later.upstreamPoint?.realtimeCapacityVehPerHour).not.toBe(first.upstreamPoint?.realtimeCapacityVehPerHour);
  });
});
