import { describe, expect, it } from 'vitest';
import { etaMinTo, resourceById } from './resources';

describe('resource dispatch data', () => {
  it('keeps the cross-jurisdiction wrecker ETA and contact details deterministic', () => {
    const wex = resourceById('W-EX');
    expect(wex).toBeDefined();
    expect(etaMinTo(wex!, 1210)).toBe(48);
    expect(wex?.station).toBe('邻区联合清障站');
    expect(wex?.contact).toBeTruthy();
    expect(wex?.phone).toBeTruthy();
  });

  it('uses the K1160/G56 connector instead of subtracting unrelated road chainages', () => {
    const w01 = resourceById('W-01');
    expect(w01).toBeDefined();
    expect(etaMinTo(w01!, 30, undefined, 'G56')).toBeCloseTo((13 / 75) * 60, 5);
  });
});
