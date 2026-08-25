import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PanelFrame from '../../components/PanelFrame';
import { usePanelFullscreen } from '../../components/FullscreenPanel';
import { toAmapCoordinate } from '../../gis/amapTwinOverlays';
import { loadAmap, type AMapApi, type AMapMapInstance, type AMapOverlay } from '../../gis/amapLoader';
import { NETWORK_BOUNDS, type LngLat } from '../../gis/xiAnRing';
import type { MonitoringEventType } from '../../domain/monitoring';
import { buildMonitoringAmapOverlays } from '../gis/monitoringAmapOverlays';
import {
  buildMonitoringGisModel,
  monitoringEventViewport,
  type MonitoringGisCluster,
} from '../gis/monitoringGisModel';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  type MonitoringListItem,
} from '../selectors';
import type { MonitoringFilters, MonitoringSort } from '../uiState';
import { useMonitoringUiStore } from '../uiState';
import MonitoringFilterBar from './MonitoringFilterBar';
import '../monitoringGis.css';

interface MonitoringGisViewProps {
  items: readonly MonitoringListItem[];
  filters: MonitoringFilters;
  sort: MonitoringSort;
  roadCodes: readonly string[];
  deviceIds: readonly string[];
  selectedEventId?: string;
  onFiltersChange: (filters: Partial<MonitoringFilters>) => void;
  onSortChange: (sort: MonitoringSort) => void;
  onResetFilters: () => void;
  onSelectEvent: (eventId: string) => void;
  forceUnavailableReason?: string;
}

interface InteractiveMap extends AMapMapInstance {
  on?(event: string, handler: () => void): void;
  getZoom?(): number;
  getCenter?(): { getLng(): number; getLat(): number };
}

const DEFAULT_CENTER: LngLat = [108.94, 34.265];
const LEVEL_COLOR = { L1: '#165dff', L2: '#00b42a', L3: '#ff7d00', L4: '#f53f3f' } as const;

function projectCoordinate([longitude, latitude]: LngLat): { left: string; top: string } {
  const [[minLng, minLat], [maxLng, maxLat]] = NETWORK_BOUNDS;
  const x = Math.max(0, Math.min(1, (longitude - minLng) / (maxLng - minLng)));
  const y = Math.max(0, Math.min(1, (maxLat - latitude) / (maxLat - minLat)));
  return { left: `${x * 100}%`, top: `${y * 100}%` };
}

function SchematicMap({ clusters, error, onClusterClick }: {
  clusters: readonly MonitoringGisCluster[];
  error: string | null;
  onClusterClick: (cluster: MonitoringGisCluster) => void;
}) {
  return (
    <div className="monitoring-gis-fallback" data-testid="monitoring-gis-fallback">
      <div className="monitoring-gis-fallback-grid" aria-hidden="true" />
      <div className="monitoring-gis-fallback-road road-ring" aria-hidden="true" />
      <div className="monitoring-gis-fallback-road road-south" aria-hidden="true" />
      <span className="monitoring-gis-fallback-label">模拟路网降级视图</span>
      <span className="monitoring-gis-fallback-message">{error ?? '正在加载高德GIS底图，事件点可继续查看'}</span>
      {clusters.map((cluster) => (
        <button
          key={cluster.clusterId}
          type="button"
          className={`monitoring-gis-schematic-marker ${cluster.selected ? 'is-selected' : ''}`}
          style={{ ...projectCoordinate(cluster.coordinate), backgroundColor: LEVEL_COLOR[cluster.highestLevel] }}
          aria-label={cluster.count > 1 ? `${cluster.count}起聚合事件` : `定位事件${cluster.eventIds[0]}`}
          onClick={() => onClusterClick(cluster)}
        >
          {cluster.count > 1 ? cluster.count : cluster.highestLevel}
          {cluster.simulationCount ? <small>模拟</small> : undefined}
        </button>
      ))}
    </div>
  );
}

export default function MonitoringGisView(props: MonitoringGisViewProps) {
  const fullscreen = usePanelFullscreen('monitoring-gis-map', 'GIS事件态势');
  const mapViewport = useMonitoringUiStore((state) => state.mapViewport);
  const setMapViewport = useMonitoringUiStore((state) => state.setMapViewport);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<InteractiveMap | null>(null);
  const apiRef = useRef<AMapApi | null>(null);
  const overlaysRef = useRef<AMapOverlay[]>([]);
  const clickRef = useRef<(cluster: MonitoringGisCluster) => void>(() => undefined);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(mapViewport?.zoom ?? 10.4);
  const effectiveError = props.forceUnavailableReason ?? error;
  const effectiveReady = ready && !props.forceUnavailableReason;
  const model = useMemo(
    () => buildMonitoringGisModel(props.items, props.selectedEventId, zoom),
    [props.items, props.selectedEventId, zoom],
  );
  const selectedItem = props.items.find((item) => item.event.monitoringEventId === props.selectedEventId);

  const setView = useCallback((center: LngLat, nextZoom: number) => {
    const normalizedZoom = Math.max(8, Math.min(18, nextZoom));
    setZoom(normalizedZoom);
    const storedViewport = useMonitoringUiStore.getState().mapViewport;
    if (!storedViewport || storedViewport.zoom !== normalizedZoom
      || storedViewport.center[0] !== center[0] || storedViewport.center[1] !== center[1]) {
      setMapViewport({ center, zoom: normalizedZoom });
    }
    mapRef.current?.setZoomAndCenter(normalizedZoom, toAmapCoordinate(center));
  }, [setMapViewport]);

  const handleClusterClick = useCallback((cluster: MonitoringGisCluster) => {
    if (cluster.count === 1) {
      const eventId = cluster.eventIds[0];
      if (eventId) props.onSelectEvent(eventId);
      setView(cluster.coordinate, 14.5);
      return;
    }
    setView(cluster.coordinate, Math.min(15, zoom + 2));
  }, [props, setView, zoom]);
  clickRef.current = handleClusterClick;

  useEffect(() => {
    if (!containerRef.current) return;
    if (props.forceUnavailableReason) { setReady(false); setError(props.forceUnavailableReason); return; }
    let disposed = false;
    loadAmap().then((AMap) => {
      if (disposed || !containerRef.current) return;
      const initialCenter = mapViewport?.center ?? DEFAULT_CENTER;
      const map = new AMap.Map(containerRef.current, {
        viewMode: '2D', center: toAmapCoordinate(initialCenter), zoom,
        zooms: [8, 18], resizeEnable: true, mapStyle: 'amap://styles/normal',
      }) as InteractiveMap;
      map.on?.('zoomend', () => {
        const nextZoom = map.getZoom?.();
        const center = map.getCenter?.();
        if (nextZoom !== undefined) setZoom(nextZoom);
        if (nextZoom !== undefined && center) setMapViewport({ center: [center.getLng(), center.getLat()], zoom: nextZoom });
      });
      apiRef.current = AMap;
      mapRef.current = map;
      setReady(true);
      setError(null);
    }).catch((reason: unknown) => {
      if (!disposed) setError(reason instanceof Error ? reason.message : 'GIS底图加载失败');
    });
    return () => {
      disposed = true;
      mapRef.current?.destroy();
      mapRef.current = null;
      apiRef.current = null;
    };
  // 初始化只读取持久化视角；后续视角由独立effect同步。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.forceUnavailableReason]);

  useEffect(() => {
    const map = mapRef.current;
    const AMap = apiRef.current;
    if (!map || !AMap || !effectiveReady) return;
    const overlays = buildMonitoringAmapOverlays(AMap, {
      clusters: model.clusters,
      onClusterClick: (cluster) => clickRef.current(cluster),
    });
    map.remove(overlaysRef.current);
    map.add(overlays);
    overlaysRef.current = overlays;
    return () => {
      try { map.remove(overlays); } catch { /* 地图已销毁 */ }
      if (overlaysRef.current === overlays) overlaysRef.current = [];
    };
  }, [effectiveReady, model.clusters]);

  useEffect(() => {
    if (!selectedItem) return;
    const viewport = monitoringEventViewport(selectedItem);
    if (viewport) setView(viewport.center, viewport.zoom);
  }, [props.selectedEventId, selectedItem, setView]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => mapRef.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [fullscreen.isFullscreen]);

  const resetMap = () => {
    setZoom(10.4);
    setMapViewport({ center: DEFAULT_CENTER, zoom: 10.4 });
    mapRef.current?.setBounds(NETWORK_BOUNDS.map(toAmapCoordinate) as [LngLat, LngLat], { padding: [32, 32, 32, 32] });
  };

  return (
    <section className="monitoring-gis-view" data-testid="monitoring-gis-view">
      <MonitoringFilterBar
        filters={props.filters}
        sort={props.sort}
        roadCodes={props.roadCodes}
        deviceIds={props.deviceIds}
        resultCount={props.items.length}
        onFiltersChange={props.onFiltersChange}
        onSortChange={props.onSortChange}
        onReset={props.onResetFilters}
      />
      <div className="monitoring-gis-body">
        <aside className="monitoring-gis-event-index arco-card" aria-label="地图事件索引">
          <header><strong>空间事件</strong><span>{model.points.length} 个点 · {model.clusters.length} 个聚合</span></header>
          {props.items.length ? props.items.slice(0, 50).map((item) => (
            <button
              key={item.event.monitoringEventId}
              type="button"
              data-selected={item.event.monitoringEventId === props.selectedEventId}
              onClick={() => props.onSelectEvent(item.event.monitoringEventId)}
            >
              <span className={`monitoring-level-badge level-${item.displayLevel.toLowerCase()}`}>{MONITORING_LEVEL_LABELS[item.displayLevel]}</span>
              <strong>{MONITORING_EVENT_TYPE_LABELS[item.event.eventType as MonitoringEventType]}</strong>
              <small>{item.event.location.roadCode}{item.event.location.kilometer === undefined ? '' : ` K${item.event.location.kilometer.toFixed(1)}`}</small>
              {item.event.simulation ? <em>模拟</em> : undefined}
            </button>
          )) : <div className="monitoring-gis-empty">当前筛选条件下无事件</div>}
          {props.items.length > 50 ? <p>仅列出前50起，地图仍展示全部筛选结果。</p> : undefined}
          {model.unlocatedEventIds.length ? <p>{model.unlocatedEventIds.length} 起事件缺少坐标或已配置道路桩号，未绘制点位。</p> : undefined}
        </aside>

        <PanelFrame
          testId="monitoring-gis-map"
          fullscreen={fullscreen}
          mapMode="gis"
          rootClassName="monitoring-gis-panel"
          title={<span>GIS事件空间态势 <small>已按机构权限与当前筛选过滤</small></span>}
          headerActions={<><span className={`arco-tag ${effectiveError ? 'flag-warning' : ''}`}>{effectiveError ? 'GIS底图降级' : effectiveReady ? '高德GIS' : 'GIS加载中'}</span><span className="arco-tag">热力/排行/趋势：P1</span></>}
        >
          <div className="monitoring-gis-map-stack">
            <div ref={containerRef} className="monitoring-gis-amap" data-testid="monitoring-gis-amap" />
            {!effectiveReady ? <SchematicMap clusters={model.clusters} error={effectiveError} onClusterClick={handleClusterClick} /> : undefined}
            <div className="monitoring-gis-map-controls">
              <button type="button" className="arco-button arco-button-size-mini" onClick={() => setView(mapViewport?.center ?? DEFAULT_CENTER, zoom + 1)}>＋</button>
              <button type="button" className="arco-button arco-button-size-mini" onClick={() => setView(mapViewport?.center ?? DEFAULT_CENTER, zoom - 1)}>－</button>
              <button type="button" className="arco-button arco-button-size-mini" onClick={resetMap}>全路网</button>
            </div>
            <div className="monitoring-gis-legend">
              {(['L1', 'L2', 'L3', 'L4'] as const).map((level) => <span key={level}><i style={{ backgroundColor: LEVEL_COLOR[level] }} />{MONITORING_LEVEL_LABELS[level]}</span>)}
              <span><b>模拟</b> 点位均显式标识</span>
            </div>
          </div>
        </PanelFrame>
      </div>
    </section>
  );
}

