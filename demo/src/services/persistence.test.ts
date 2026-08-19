import { describe, expect, it } from 'vitest';
import { isRuntimeSnapshot, type RuntimeSnapshot } from './persistence';

const SNAPSHOT: RuntimeSnapshot = {
  version: 3,
  savedAtReal: 1,
  simSec: 10,
  sceneBaseSec: 12 * 3600,
  events: [],
  plans: [],
  trace: [],
  calcs: [],
  resourceOccupancy: {},
  environment: { fogBands: [], offlineDeviceIds: [] },
  mapTheme: 'dark',
  datasetRecords: [],
  timelineLog: [],
};

describe('runtime snapshot guard', () => {
  it('accepts a complete runtime snapshot', () => {
    expect(isRuntimeSnapshot(SNAPSHOT)).toBe(true);
  });

  it('rejects a version-only corrupted snapshot', () => {
    expect(isRuntimeSnapshot({ version: 3 })).toBe(false);
  });

  it('rejects the legacy runtime snapshot version', () => {
    expect(isRuntimeSnapshot({ ...SNAPSHOT, version: 2 })).toBe(false);
  });

  it('rejects polluted array fields', () => {
    expect(isRuntimeSnapshot({ ...SNAPSHOT, events: {} })).toBe(false);
  });

  it('rejects invalid environment structure', () => {
    expect(isRuntimeSnapshot({ ...SNAPSHOT, environment: { fogBands: [], offlineDeviceIds: 'CAM-1' } })).toBe(false);
  });

  it('rejects an invalid map theme', () => {
    expect(isRuntimeSnapshot({ ...SNAPSHOT, mapTheme: 'paper' })).toBe(false);
  });
});
