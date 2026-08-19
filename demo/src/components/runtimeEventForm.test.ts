import { describe, expect, it } from 'vitest';
import { normalizeRuntimeEventInput, type RuntimeEventDraft } from './runtimeEventForm';

const BASE_DRAFT: RuntimeEventDraft = {
  sourceKind: 'manual',
  road: 'G65',
  kp: '1190',
  typeNodeId: 'E_TEST',
  typeLabel: 'test event',
  lanesTotal: 3,
  lanesClosed: 2,
  q: '4300',
  casualties: '',
  hazmat: false,
  direction: 'up',
};

describe('runtime event form normalization', () => {
  it('accepts a valid manual event', () => {
    const result = normalizeRuntimeEventInput(BASE_DRAFT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.input.accidentKp).toBe(1190);
      expect(result.input.casualties).toBeUndefined();
    }
  });

  it('rejects zero total lanes before the flow engine runs', () => {
    expect(normalizeRuntimeEventInput({ ...BASE_DRAFT, lanesTotal: 0 }).ok).toBe(false);
  });

  it('rejects fractional closed lanes', () => {
    expect(normalizeRuntimeEventInput({ ...BASE_DRAFT, lanesClosed: 1.5 }).ok).toBe(false);
  });

  it('rejects non-numeric casualties', () => {
    expect(normalizeRuntimeEventInput({ ...BASE_DRAFT, casualties: 'unknown' }).ok).toBe(false);
  });

  it('rejects negative flow', () => {
    expect(normalizeRuntimeEventInput({ ...BASE_DRAFT, q: '-1' }).ok).toBe(false);
  });
});
