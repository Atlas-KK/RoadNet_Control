import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../domain/event';
import { buildTriageRows, sortTriage } from './triage';

const NOW = 1_000_000;
function event(id: string, startSimSec = 0, congested = true): SimEvent {
  return { id, road: 'G65', accidentKp: 1180, lanesTotal: 3, lanesClosed: 2, q: 4300, typeNodeId: 'E_追尾', label: id, startSimSec, congested, w: 8, severity: '一般' };
}

describe('triage', () => {
  it('升级事件优先于待确认更多的事件', () => {
    const rows = buildTriageRows([
      { event: event('EV-A'), pendingShownAtMs: [NOW - 360_000], simSec: 600 },
      { event: event('EV-B'), pendingShownAtMs: [NOW - 1, NOW - 2, NOW - 3], simSec: 600 },
    ], NOW);
    expect(sortTriage(rows).map((row) => row.eventId)).toEqual(['EV-A', 'EV-B']);
  });

  it('超时优先于更长的排队', () => {
    const rows = buildTriageRows([
      { event: event('EV-A'), pendingShownAtMs: [NOW - 180_000], simSec: 600 },
      { event: { ...event('EV-B'), w: 30 }, pendingShownAtMs: [], simSec: 600 },
    ], NOW);
    expect(sortTriage(rows)[0].eventId).toBe('EV-A');
  });

  it('其余条件相同时新事件在前', () => {
    const rows = buildTriageRows([
      { event: event('EV-A', 10, false), pendingShownAtMs: [], simSec: 100 },
      { event: event('EV-B', 20, false), pendingShownAtMs: [], simSec: 100 },
    ], NOW);
    expect(sortTriage(rows)[0].eventId).toBe('EV-B');
  });

  it('空输入返回空数组', () => expect(buildTriageRows([], NOW)).toEqual([]));

  it('特别重大未超时优先于一般已升级', () => {
    const rows = buildTriageRows([
      { event: { ...event('EV-A'), severity: '一般' }, pendingShownAtMs: [NOW - 360_000], simSec: 600 },
      { event: { ...event('EV-B'), severity: '特别重大' }, pendingShownAtMs: [], simSec: 600 },
    ], NOW);
    expect(sortTriage(rows).map((row) => row.eventId)).toEqual(['EV-B', 'EV-A']);
  });
});
