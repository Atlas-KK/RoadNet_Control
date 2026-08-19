import type { FeatureCollection, LineString, Point } from 'geojson';
import type { AMapApi, AMapOverlay } from './amapLoader';

type LngLat = [number, number];

/** WGS84 转 GCJ-02，与高德底图使用同一坐标系。 */
export function toAmapCoordinate([longitude, latitude]: LngLat): LngLat {
  if (longitude < 72.004 || longitude > 137.8347 || latitude < 0.8293 || latitude > 55.8271) return [longitude, latitude];
  const pi = Math.PI;
  const a = 6378245.0;
  const ee = 0.006693421622965943;
  const transformLat = -100 + 2 * longitude + 3 * latitude + 0.2 * latitude ** 2 + 0.1 * longitude * latitude + 0.2 * Math.sqrt(Math.abs(longitude))
    + (20 * Math.sin(6 * longitude * pi) + 20 * Math.sin(2 * longitude * pi)) * 2 / 3
    + (20 * Math.sin(latitude * pi) + 40 * Math.sin(latitude / 3 * pi)) * 2 / 3
    + (160 * Math.sin(latitude / 12 * pi) + 320 * Math.sin(latitude * pi / 30)) * 2 / 3;
  const transformLng = 300 + longitude + 2 * latitude + 0.1 * longitude ** 2 + 0.1 * longitude * latitude + 0.1 * Math.sqrt(Math.abs(longitude))
    + (20 * Math.sin(6 * longitude * pi) + 20 * Math.sin(2 * longitude * pi)) * 2 / 3
    + (20 * Math.sin(longitude * pi) + 40 * Math.sin(longitude / 3 * pi)) * 2 / 3
    + (150 * Math.sin(longitude / 12 * pi) + 300 * Math.sin(longitude / 30 * pi)) * 2 / 3;
  const radLat = latitude / 180 * pi;
  const magic = 1 - ee * Math.sin(radLat) ** 2;
  const sqrtMagic = Math.sqrt(magic);
  const dLat = transformLat * 180 / ((a * (1 - ee)) / (magic * sqrtMagic) * pi);
  const dLng = transformLng * 180 / (a / sqrtMagic * Math.cos(radLat) * pi);
  return [longitude + dLng, latitude + dLat];
}

function html(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

export interface AmapOverlayClick {
  kind: 'camera' | 'device' | 'incident' | 'radar';
  coordinate: LngLat;
  properties: Record<string, unknown>;
}

function pointMarker(AMap: AMapApi, coordinate: LngLat, label: string, color: string, symbol: string, emphasis = false, click?: AmapOverlayClick): AMapOverlay {
  const safeLabel = html(label);
  const marker = new AMap.Marker({
    position: toAmapCoordinate(coordinate),
    anchor: 'bottom-center',
    content: `<div style="display:flex;align-items:center;gap:4px;transform:translateY(-1px);white-space:nowrap;font:600 11px/1.2 'Microsoft YaHei',sans-serif;color:#25354a;text-shadow:0 1px 2px #fff,1px 0 2px #fff,-1px 0 2px #fff,0 -1px 2px #fff;"><span style="display:grid;place-items:center;width:${emphasis ? 24 : 18}px;height:${emphasis ? 24 : 18}px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 5px rgba(15,23,42,.45);color:#fff;font-size:${emphasis ? 13 : 10}px;">${symbol}</span><span>${safeLabel}</span></div>`,
    zIndex: emphasis ? 180 : 130,
  });
  if (click) marker.on?.('click', () => click);
  return marker;
}

function property(feature: { properties?: Record<string, unknown> | null }, key: string): string {
  const value = feature.properties?.[key];
  return value == null ? '' : String(value);
}

export interface AmapTwinOverlayData {
  roads: FeatureCollection<LineString>;
  landmarks: FeatureCollection<Point>;
  incidents: FeatureCollection<Point>;
  congestion: FeatureCollection<LineString>;
  devices: FeatureCollection<Point>;
  resources: FeatureCollection<Point>;
  overlayLines: FeatureCollection<LineString>;
  overlayPoints: FeatureCollection<Point>;
  queueTail: FeatureCollection<Point>;
  prediction: FeatureCollection<Point>;
  radarCoverage: FeatureCollection<LineString>;
  radarLanes: FeatureCollection<LineString>;
  radarTrails: FeatureCollection<LineString>;
  radarBodies: FeatureCollection<LineString>;
  radarVehicles: FeatureCollection<Point>;
  onMarkerClick?: (detail: AmapOverlayClick) => void;
}

/** 将数字孪生的核心要素转为高德原生覆盖物，运行期由调用方整体替换。 */
export function buildAmapTwinOverlays(AMap: AMapApi, data: AmapTwinOverlayData): AMapOverlay[] {
  const overlays: AMapOverlay[] = [];
  for (const feature of data.roads.features) {
    const primary = property(feature, 'primary') === '1';
    const path = feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat));
    overlays.push(new AMap.Polyline({ path, strokeColor: '#173E8F', strokeWeight: primary ? 11 : 7, strokeOpacity: 0.5, lineJoin: 'round', lineCap: 'round', zIndex: 20 }));
    overlays.push(new AMap.Polyline({ path, strokeColor: primary ? '#236BFF' : '#4D79A8', strokeWeight: primary ? 6 : 3.5, strokeOpacity: 0.95, lineJoin: 'round', lineCap: 'round', zIndex: 21 }));
  }
  for (const feature of data.overlayLines.features) {
    overlays.push(new AMap.Polyline({ path: feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat)), strokeColor: property(feature, 'color') || '#37D67A', strokeWeight: Number(property(feature, 'width')) || 4, strokeOpacity: Number(property(feature, 'opacity')) || 0.82, lineJoin: 'round', lineCap: 'round', zIndex: 45 }));
  }
  for (const feature of data.congestion.features) {
    overlays.push(new AMap.Polyline({ path: feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat)), strokeColor: property(feature, 'color') || '#EF7F3B', strokeWeight: 8, strokeOpacity: 0.92, lineJoin: 'round', lineCap: 'round', zIndex: 70 }));
  }
  for (const feature of data.radarCoverage.features) {
    overlays.push(new AMap.Polyline({ path: feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat)), strokeColor: '#4FD1C5', strokeWeight: 18, strokeOpacity: 0.16, zIndex: 78 }));
  }
  for (const feature of data.radarLanes.features) {
    overlays.push(new AMap.Polyline({ path: feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat)), strokeColor: property(feature, 'color') || '#4FD1C5', strokeWeight: 2.2, strokeOpacity: 0.5, strokeStyle: 'dashed', zIndex: 80 }));
  }
  for (const feature of data.radarTrails.features) {
    overlays.push(new AMap.Polyline({ path: feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat)), strokeColor: property(feature, 'color') || '#86B6EF', strokeWeight: 2.4, strokeOpacity: 0.38, zIndex: 82 }));
  }
  for (const feature of data.radarBodies.features) {
    overlays.push(new AMap.Polyline({ path: feature.geometry.coordinates.map((coordinate) => toAmapCoordinate(coordinate as LngLat)), strokeColor: property(feature, 'color') || '#86B6EF', strokeWeight: Number(property(feature, 'width')) || 5, strokeOpacity: 0.94, zIndex: 84 }));
  }
  for (const feature of data.landmarks.features) {
    overlays.push(pointMarker(AMap, feature.geometry.coordinates as LngLat, `${property(feature, 'label')} · K${property(feature, 'kp')}`, '#60758E', '⌖'));
  }
  for (const feature of data.devices.features) {
    const camera = property(feature, 'camera') === '1';
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const marker = pointMarker(AMap, feature.geometry.coordinates as LngLat, property(feature, 'label'), property(feature, 'online') === '1' ? (property(feature, 'color') || '#236BFF') : '#8A95A5', camera ? '◉' : '◆', camera || property(feature, 'synchronized') === '1');
    marker.on?.('click', () => data.onMarkerClick?.({ kind: camera ? 'camera' : 'device', coordinate: feature.geometry.coordinates as LngLat, properties: props }));
    overlays.push(marker);
  }
  for (const feature of data.resources.features) {
    overlays.push(pointMarker(AMap, feature.geometry.coordinates as LngLat, property(feature, 'label'), property(feature, 'color') || '#00A870', '✚', property(feature, 'occupied') === '1'));
  }
  for (const feature of data.overlayPoints.features) {
    overlays.push(pointMarker(AMap, feature.geometry.coordinates as LngLat, property(feature, 'label'), property(feature, 'color') || '#EF7F3B', '◆', true));
  }
  for (const feature of data.incidents.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const marker = pointMarker(AMap, feature.geometry.coordinates as LngLat, `${property(feature, 'id')} · 事件`, '#E63B3B', '▲', true);
    marker.on?.('click', () => data.onMarkerClick?.({ kind: 'incident', coordinate: feature.geometry.coordinates as LngLat, properties: props }));
    overlays.push(marker);
  }
  for (const feature of data.queueTail.features) {
    overlays.push(pointMarker(AMap, feature.geometry.coordinates as LngLat, property(feature, 'label'), property(feature, 'color') || '#EF7F3B', '↟', true));
  }
  for (const feature of data.prediction.features) {
    overlays.push(pointMarker(AMap, feature.geometry.coordinates as LngLat, `⚡ ${property(feature, 'label')}`, '#F2B84B', '◆', true));
  }
  for (const feature of data.radarVehicles.features) {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const incident = property(feature, 'status') === 'incident';
    const marker = pointMarker(AMap, feature.geometry.coordinates as LngLat, property(feature, 'label'), property(feature, 'color') || '#86B6EF', incident ? '▲' : '•', incident);
    marker.on?.('click', () => data.onMarkerClick?.({ kind: 'radar', coordinate: feature.geometry.coordinates as LngLat, properties: props }));
    overlays.push(marker);
  }
  return overlays;
}
