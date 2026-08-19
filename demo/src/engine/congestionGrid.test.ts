import { describe, expect, it } from 'vitest';
import { buildCongestionGrid } from './congestionGrid';

const EVENT = {
  accidentKp: 1195,
  startSimSec: 0,
  congested: true,
  w: 6,
  lanesClosed: 2,
  lanesTotal: 3,
};

describe('congestion grid', () => {
  it('expands upstream congestion cells as simulated time advances', () => {
    const early = buildCongestionGrid(EVENT, 0);
    const later = buildCongestionGrid(EVENT, 30 * 60);

    expect(early.cells.find((cell) => cell.offsetKm === -3)?.level).toBe('free');
    expect(later.cells.find((cell) => cell.offsetKm === -3)?.level).toBe('congested');
    expect(later.queueLengthKm).toBe(3);
    expect(later.queueTailKp).toBe(1192);
  });

  it('marks the incident and downstream influence independently', () => {
    const grid = buildCongestionGrid(EVENT, 0);
    expect(grid.cells.find((cell) => cell.offsetKm === 0)?.level).toBe('incident');
    expect(grid.cells.find((cell) => cell.offsetKm === 1)?.level).toBe('slow');
    expect(grid.cells.find((cell) => cell.offsetKm === 3)?.level).toBe('free');
  });
});
