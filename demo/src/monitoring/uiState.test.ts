import { describe, expect, it } from 'vitest';
import type { SessionStorageLike } from '../appShellState';
import {
  DEFAULT_MONITORING_VIEW,
  MONITORING_VIEW_SESSION_KEY,
  persistMonitoringView,
  readMonitoringView,
} from './uiState';

function createStorage(initial: Record<string, string> = {}): SessionStorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('FR-EM-001 监测二级视图会话恢复', () => {
  it('默认进入视频事件监测', () => {
    expect(readMonitoringView(createStorage())).toBe(DEFAULT_MONITORING_VIEW);
  });

  it('恢复GIS态势感知视图', () => {
    const storage = createStorage({ [MONITORING_VIEW_SESSION_KEY]: 'gis_awareness' });
    expect(readMonitoringView(storage)).toBe('gis_awareness');
  });

  it('保存视图后可再次读取', () => {
    const storage = createStorage();
    expect(persistMonitoringView(storage, 'gis_awareness')).toBe(true);
    expect(readMonitoringView(storage)).toBe('gis_awareness');
  });
});
