import { create } from 'zustand';
import { getBrowserSessionStorage, type SessionStorageLike } from '../appShellState';
import type { MonitoringEventType, MonitoringLevel, TravelDirection, VerificationStatus } from '../domain/monitoring';
import type { MonitoringMetricKey } from './engine/monitoringMetrics';

export type MonitoringView = 'video_monitoring' | 'gis_awareness';
export type MonitoringDrawerTab = 'video' | 'alarms' | 'event' | 'verification_history' | 'control';
export type MonitoringSort = 'default_priority' | 'detected_desc' | 'level_desc';
export type MonitoringDemoDatasetScope = 'default' | 'all';

export interface MonitoringFilters {
  quickMetric?: MonitoringMetricKey;
  eventTypes: MonitoringEventType[];
  verificationStatuses: VerificationStatus[];
  levels: MonitoringLevel[];
  roadCodes: string[];
  directions: TravelDirection[];
  deviceIds: string[];
  minimumConfidence?: number;
  detectedFrom?: string;
  detectedTo?: string;
  keyword: string;
}

export interface MonitoringMapViewport {
  center: [number, number];
  zoom: number;
}

export interface MonitoringUiSnapshot {
  version: 1;
  activeView: MonitoringView;
  filters: MonitoringFilters;
  sort: MonitoringSort;
  selectedMonitoringEventId?: string;
  gridScrollOffset: number;
  mapViewport?: MonitoringMapViewport;
  drawerTab: MonitoringDrawerTab;
  demoDatasetScope: MonitoringDemoDatasetScope;
}

export interface MonitoringUiState extends MonitoringUiSnapshot {
  setActiveView: (view: MonitoringView) => void;
  setFilters: (filters: Partial<MonitoringFilters>) => void;
  resetFilters: () => void;
  setSort: (sort: MonitoringSort) => void;
  setSelectedMonitoringEventId: (eventId?: string) => void;
  setGridScrollOffset: (offset: number) => void;
  setMapViewport: (viewport?: MonitoringMapViewport) => void;
  setDrawerTab: (tab: MonitoringDrawerTab) => void;
  setDemoDatasetScope: (scope: MonitoringDemoDatasetScope) => void;
  restore: () => void;
}

export const DEFAULT_MONITORING_VIEW: MonitoringView = 'video_monitoring';
export const MONITORING_VIEW_SESSION_KEY = 'roadgov-mvp:monitoring-view';
export const MONITORING_UI_SESSION_KEY = 'roadgov-mvp:monitoring-ui:v1';

export const DEFAULT_MONITORING_FILTERS: MonitoringFilters = Object.freeze({
  eventTypes: [],
  verificationStatuses: [],
  levels: [],
  roadCodes: [],
  directions: [],
  deviceIds: [],
  keyword: '',
});

export const DEFAULT_MONITORING_UI_SNAPSHOT: MonitoringUiSnapshot = Object.freeze({
  version: 1,
  activeView: DEFAULT_MONITORING_VIEW,
  filters: DEFAULT_MONITORING_FILTERS,
  sort: 'default_priority',
  selectedMonitoringEventId: undefined,
  gridScrollOffset: 0,
  mapViewport: undefined,
  drawerTab: 'video',
  // 默认必须展示全部数据；只有开发环境成功补齐标准案例后，App 才切到 default。
  // 这样生产构建或默认数据加载失败时不会把真实监测事件误判为“非默认案例”而隐藏。
  demoDatasetScope: 'all',
});

export function parseMonitoringView(value: unknown): MonitoringView {
  return value === 'video_monitoring' || value === 'gis_awareness' ? value : DEFAULT_MONITORING_VIEW;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string') ? [...value] : [];
}

function parseQuickMetric(value: unknown): MonitoringMetricKey | undefined {
  return value === 'today_detected' || value === 'current_pending' || value === 'current_verifying'
    || value === 'today_confirmed' || value === 'today_false_positive' || value === 'current_overdue'
    || value === 'today_taken_over' || value === 'current_control_handling'
    ? value : undefined;
}

function parseFilters(value: unknown): MonitoringFilters {
  if (!isRecord(value)) return { ...DEFAULT_MONITORING_FILTERS };
  return {
    quickMetric: parseQuickMetric(value.quickMetric),
    eventTypes: stringArray(value.eventTypes) as MonitoringEventType[],
    verificationStatuses: stringArray(value.verificationStatuses) as VerificationStatus[],
    levels: stringArray(value.levels) as MonitoringLevel[],
    roadCodes: stringArray(value.roadCodes),
    directions: stringArray(value.directions) as TravelDirection[],
    deviceIds: stringArray(value.deviceIds),
    minimumConfidence: typeof value.minimumConfidence === 'number' ? value.minimumConfidence : undefined,
    detectedFrom: typeof value.detectedFrom === 'string' ? value.detectedFrom : undefined,
    detectedTo: typeof value.detectedTo === 'string' ? value.detectedTo : undefined,
    keyword: typeof value.keyword === 'string' ? value.keyword : '',
  };
}

export function parseMonitoringUiSnapshot(value: unknown): MonitoringUiSnapshot {
  if (!isRecord(value) || value.version !== 1) return structuredClone(DEFAULT_MONITORING_UI_SNAPSHOT);
  const mapViewport = isRecord(value.mapViewport)
    && Array.isArray(value.mapViewport.center)
    && value.mapViewport.center.length === 2
    && value.mapViewport.center.every((item) => typeof item === 'number')
    && typeof value.mapViewport.zoom === 'number'
    ? { center: [value.mapViewport.center[0], value.mapViewport.center[1]] as [number, number], zoom: value.mapViewport.zoom }
    : undefined;
  return {
    version: 1,
    activeView: parseMonitoringView(value.activeView),
    filters: parseFilters(value.filters),
    sort: value.sort === 'detected_desc' || value.sort === 'level_desc' ? value.sort : 'default_priority',
    selectedMonitoringEventId: typeof value.selectedMonitoringEventId === 'string' ? value.selectedMonitoringEventId : undefined,
    gridScrollOffset: typeof value.gridScrollOffset === 'number' && value.gridScrollOffset >= 0 ? value.gridScrollOffset : 0,
    mapViewport,
    drawerTab: value.drawerTab === 'alarms' || value.drawerTab === 'event' || value.drawerTab === 'verification_history' || value.drawerTab === 'control'
      ? value.drawerTab
      : 'video',
    demoDatasetScope: value.demoDatasetScope === 'default' ? 'default' : 'all',
  };
}

export function readMonitoringUiState(storage?: SessionStorageLike): MonitoringUiSnapshot {
  if (!storage) return structuredClone(DEFAULT_MONITORING_UI_SNAPSHOT);
  try {
    const raw = storage.getItem(MONITORING_UI_SESSION_KEY);
    if (raw) return parseMonitoringUiSnapshot(JSON.parse(raw));
    return { ...structuredClone(DEFAULT_MONITORING_UI_SNAPSHOT), activeView: parseMonitoringView(storage.getItem(MONITORING_VIEW_SESSION_KEY)) };
  } catch {
    return structuredClone(DEFAULT_MONITORING_UI_SNAPSHOT);
  }
}

export function persistMonitoringUiState(storage: SessionStorageLike | undefined, snapshot: MonitoringUiSnapshot): boolean {
  if (!storage) return false;
  try {
    storage.setItem(MONITORING_UI_SESSION_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function readMonitoringView(storage?: SessionStorageLike): MonitoringView {
  return readMonitoringUiState(storage).activeView;
}

export function persistMonitoringView(storage: SessionStorageLike | undefined, view: MonitoringView): boolean {
  const current = readMonitoringUiState(storage);
  return persistMonitoringUiState(storage, { ...current, activeView: view });
}

function snapshotOf(state: MonitoringUiState): MonitoringUiSnapshot {
  return {
    version: 1,
    activeView: state.activeView,
    filters: state.filters,
    sort: state.sort,
    selectedMonitoringEventId: state.selectedMonitoringEventId,
    gridScrollOffset: state.gridScrollOffset,
    mapViewport: state.mapViewport,
    drawerTab: state.drawerTab,
    demoDatasetScope: state.demoDatasetScope,
  };
}

export function createMonitoringUiStore(storage: SessionStorageLike | undefined = getBrowserSessionStorage()) {
  const initial = readMonitoringUiState(storage);
  return create<MonitoringUiState>((set, get) => {
    const commit = (patch: Partial<MonitoringUiSnapshot>) => {
      set(patch);
      persistMonitoringUiState(storage, snapshotOf(get()));
    };
    return {
      ...initial,
      setActiveView: (activeView) => commit({ activeView }),
      setFilters: (filters) => commit({ filters: { ...get().filters, ...filters } }),
      resetFilters: () => commit({ filters: structuredClone(DEFAULT_MONITORING_FILTERS) }),
      setSort: (sort) => commit({ sort }),
      setSelectedMonitoringEventId: (selectedMonitoringEventId) => commit({ selectedMonitoringEventId }),
      setGridScrollOffset: (gridScrollOffset) => commit({ gridScrollOffset: Math.max(0, gridScrollOffset) }),
      setMapViewport: (mapViewport) => commit({ mapViewport }),
      setDrawerTab: (drawerTab) => commit({ drawerTab }),
      setDemoDatasetScope: (demoDatasetScope) => commit({ demoDatasetScope }),
      restore: () => set(readMonitoringUiState(storage)),
    };
  });
}

export const useMonitoringUiStore = createMonitoringUiStore();
