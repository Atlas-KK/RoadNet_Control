import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../domain/event';
import { demoCaseById } from '../data/demoCases';
import { resolveTrafficMonitorReading } from './trafficMonitor';

const EVENT: SimEvent = {
  id: 'EV-MONITOR', road: 'G65', accidentKp: 1180, lanesTotal: 3, lanesClosed: 2,
  q: 4300, vf: 110, typeNodeId: 'E_追尾', label: '监测事件', startSimSec: 0, congested: true, w: 7.27,
};

describe('traffic monitor readings', () => {
  it('uses the flow model as the baseline for a live accident-point sample', () => {
    const reading = resolveTrafficMonitorReading(EVENT, [], 30 * 60);
    expect(reading.capacityVehPerHour).toBe(1530);
    expect(reading.queueDensityVehPerKm).toBeGreaterThanOrEqual(reading.drivingDensityVehPerKm);
    expect(reading.spillbackSpeedKmh).toBeGreaterThan(0);
  });

  it('sets capacity and spillback to zero during a scripted full closure', () => {
    const script = demoCaseById('condition-jump').twinScript!;
    const event: SimEvent = { ...EVENT, id: 'event-0', accidentKp: 1177.2, lanesClosed: 3, q: 3600, startSimSec: 40 * 60 + 18 };
    const reading = resolveTrafficMonitorReading(event, [], 43 * 60, {
      eventId: 'event-0', eventIds: ['event-0'], script,
    });
    expect(reading.capacityVehPerHour).toBe(0);
    expect(reading.spillbackSpeedKmh).toBe(0);
  });

  it('raises capacity and lowers density after a scripted clearance', () => {
    const script = demoCaseById('self-reference').twinScript!;
    const event: SimEvent = { ...EVENT, id: 'event-0', accidentKp: 1165.8, q: 5200, startSimSec: 30 };
    const active = { eventId: 'event-0', eventIds: ['event-0'], script };
    const queued = resolveTrafficMonitorReading(event, [], 36 * 60, active);
    const recovered = resolveTrafficMonitorReading(event, [], 55 * 60, active);
    expect(recovered.capacityVehPerHour).toBeGreaterThan(queued.capacityVehPerHour);
    expect(recovered.drivingDensityVehPerKm).toBeLessThan(queued.drivingDensityVehPerKm);
  });
});
