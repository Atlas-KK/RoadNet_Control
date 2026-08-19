import { describe, expect, it } from 'vitest';
import { CONFIRM_TARGET_SEC, ESCALATE_SEC, confirmElapsedSec, confirmRemainingSec, confirmStatus } from './confirmTiming';

describe('确认时效', () => {
  const t0 = 1_000_000;
  it('目标内为 ontime', () => {
    expect(confirmStatus(t0, t0 + 60_000)).toBe('ontime');
    expect(confirmRemainingSec(t0, t0 + 60_000)).toBe(CONFIRM_TARGET_SEC - 60);
  });
  it('超 3min 为 overdue', () => {
    expect(confirmStatus(t0, t0 + (CONFIRM_TARGET_SEC + 5) * 1000)).toBe('overdue');
  });
  it('超 6min 为 escalated', () => {
    expect(confirmStatus(t0, t0 + (ESCALATE_SEC + 1) * 1000)).toBe('escalated');
  });
  it('经过秒数非负', () => {
    expect(confirmElapsedSec(t0, t0 - 5000)).toBe(0);
  });
});
