import { describe, expect, it } from 'vitest';
import type { SessionStorageLike } from '../appShellState';
import { MONITORING_UI_SESSION_KEY, createMonitoringUiStore, readMonitoringUiState } from './uiState';

function storage() {
  const values = new Map<string, string>();
  const target: SessionStorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return { target, values };
}

describe('FR-EM-001 指标快捷筛选会话恢复', () => {
  it('保存并恢复有效快捷指标', () => {
    const { target, values } = storage();
    const store = createMonitoringUiStore(target);
    store.getState().setFilters({ quickMetric: 'current_overdue' });
    expect(readMonitoringUiState(target).filters.quickMetric).toBe('current_overdue');
    expect(values.get(MONITORING_UI_SESSION_KEY)).toContain('current_overdue');
  });

  it('损坏或未知指标值不进入筛选状态', () => {
    const { target, values } = storage();
    values.set(MONITORING_UI_SESSION_KEY, JSON.stringify({
      version: 1, activeView: 'video_monitoring', filters: { quickMetric: 'accuracy' }, sort: 'default_priority',
      gridScrollOffset: 0, drawerTab: 'video',
    }));
    expect(readMonitoringUiState(target).filters.quickMetric).toBeUndefined();
  });
});
