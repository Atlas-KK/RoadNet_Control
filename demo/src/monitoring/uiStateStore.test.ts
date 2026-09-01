import { describe, expect, it } from 'vitest';
import type { SessionStorageLike } from '../appShellState';
import {
  MONITORING_UI_SESSION_KEY,
  MONITORING_VIEW_SESSION_KEY,
  createMonitoringUiStore,
  readMonitoringUiState,
} from './uiState';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: SessionStorageLike = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  return { storage, values };
}

describe('FR-EM-001 / FR-EM-011 监测UI会话状态', () => {
  it('兼容阶段1保存的二级视图', () => {
    const { storage } = createStorage({ [MONITORING_VIEW_SESSION_KEY]: 'gis_awareness' });
    expect(readMonitoringUiState(storage).activeView).toBe('gis_awareness');
  });

  it('恢复筛选、滚动、选中事件、地图视角和抽屉页签', () => {
    const snapshot = {
      version: 1,
      activeView: 'video_monitoring',
      filters: { roadCodes: ['G65'], keyword: '隧道', overdueOnly: true },
      sort: 'level_desc',
      selectedMonitoringEventId: 'ME-001',
      gridScrollOffset: 320,
      mapViewport: { center: [108.9, 34.2], zoom: 10 },
      drawerTab: 'control',
    };
    const { storage } = createStorage({ [MONITORING_UI_SESSION_KEY]: JSON.stringify(snapshot) });
    const restored = readMonitoringUiState(storage);
    expect(restored.filters.roadCodes).toEqual(['G65']);
    expect(restored.filters.keyword).toBe('隧道');
    expect(restored.filters).not.toHaveProperty('overdueOnly');
    expect(restored.selectedMonitoringEventId).toBe('ME-001');
    expect(restored.gridScrollOffset).toBe(320);
    expect(restored.mapViewport).toEqual({ center: [108.9, 34.2], zoom: 10 });
    expect(restored.drawerTab).toBe('control');
    expect(restored.demoDatasetScope).toBe('all');
  });

  it('UI Store每次变更写入sessionStorage', () => {
    const { storage, values } = createStorage();
    const store = createMonitoringUiStore(storage);
    store.getState().setFilters({ roadCodes: ['G65'], keyword: '火灾' });
    store.getState().setGridScrollOffset(180);
    store.getState().setSelectedMonitoringEventId('ME-002');
    store.getState().setDemoDatasetScope('all');
    const persisted = JSON.parse(values.get(MONITORING_UI_SESSION_KEY) ?? '{}') as Record<string, unknown>;
    expect((persisted.filters as { keyword: string }).keyword).toBe('火灾');
    expect(persisted.gridScrollOffset).toBe(180);
    expect(persisted.selectedMonitoringEventId).toBe('ME-002');
    expect(persisted.demoDatasetScope).toBe('all');
  });

  it('损坏数据回退默认状态', () => {
    const { storage } = createStorage({ [MONITORING_UI_SESSION_KEY]: '{bad-json' });
    const restored = readMonitoringUiState(storage);
    expect(restored.activeView).toBe('video_monitoring');
    expect(restored.filters.keyword).toBe('');
    expect(restored.gridScrollOffset).toBe(0);
    expect(restored.demoDatasetScope).toBe('all');
  });
});
