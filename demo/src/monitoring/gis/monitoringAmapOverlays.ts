import { toAmapCoordinate } from '../../gis/amapTwinOverlays';
import type { AMapApi, AMapOverlay } from '../../gis/amapLoader';
import { buildRoadFeatureCollection } from '../../gis/xiAnRing';
import type { MonitoringGisCluster } from './monitoringGisModel';

const LEVEL_COLOR = { L1: '#165dff', L2: '#00b42a', L3: '#ff7d00', L4: '#f53f3f' } as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export interface MonitoringAmapOverlayInput {
  clusters: readonly MonitoringGisCluster[];
  onClusterClick: (cluster: MonitoringGisCluster) => void;
}

export function buildMonitoringAmapOverlays(AMap: AMapApi, input: MonitoringAmapOverlayInput): AMapOverlay[] {
  const overlays: AMapOverlay[] = [];
  for (const road of buildRoadFeatureCollection().features) {
    overlays.push(new AMap.Polyline({
      path: road.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as [number, number])),
      strokeColor: road.properties?.primary === 1 ? '#236bff' : '#6b8db4',
      strokeWeight: road.properties?.primary === 1 ? 6 : 3,
      strokeOpacity: 0.82,
      lineJoin: 'round',
      zIndex: 20,
    }));
  }
  for (const cluster of input.clusters) {
    const color = LEVEL_COLOR[cluster.highestLevel];
    const label = cluster.count > 1 ? String(cluster.count) : cluster.highestLevel;
    const simulation = cluster.simulationCount > 0 ? '<small style="margin-left:3px">模拟</small>' : '';
    const marker = new AMap.Marker({
      position: toAmapCoordinate(cluster.coordinate),
      anchor: 'center',
      content: `<button type="button" aria-label="${escapeHtml(cluster.count > 1 ? `${cluster.count}起聚合事件` : `事件${cluster.eventIds[0] ?? ''}`)}" style="display:flex;align-items:center;border:${cluster.selected ? '3px' : '2px'} solid #fff;border-radius:18px;padding:0 8px;min-width:34px;height:34px;background:${color};color:#fff;box-shadow:0 3px 12px rgba(0,0,0,.35);font:700 11px 'Microsoft YaHei',sans-serif;cursor:pointer">${escapeHtml(label)}${simulation}</button>`,
      zIndex: cluster.selected ? 190 : 150,
    });
    marker.on?.('click', () => input.onClusterClick(cluster));
    overlays.push(marker);
  }
  return overlays;
}
