import { describe, expect, it } from 'vitest';
import { SystemOperationalClock, operationalTimeIso } from './operationalClock';

describe('FR-EM-005 operationalTime', () => {
  it('以墙上时间定锚并只按单调时间推进', () => {
    let wall = Date.parse('2026-08-25T00:00:00.000Z');
    let monotonic = 100;
    const clock = new SystemOperationalClock({
      wallNowMs: () => wall,
      monotonicNowMs: () => monotonic,
    });

    wall -= 60_000;
    monotonic += 2_500;
    expect(clock.nowMs()).toBe(Date.parse('2026-08-25T00:00:02.500Z'));
    expect(operationalTimeIso(clock)).toBe('2026-08-25T00:00:02.500Z');
  });

  it('防止异常单调时间回拨导致SLA倒退', () => {
    let monotonic = 500;
    const clock = new SystemOperationalClock({
      wallNowMs: () => 1_000,
      monotonicNowMs: () => monotonic,
    });
    monotonic = 400;
    expect(clock.nowMs()).toBe(1_000);
  });
});
