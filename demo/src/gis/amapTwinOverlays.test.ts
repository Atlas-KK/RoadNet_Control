import { describe, expect, it, vi } from 'vitest';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { buildAmapTwinOverlays } from './amapTwinOverlays';
import type { AMapApi } from './amapLoader';

class FakeOverlay {
  handlers: Record<string, () => void> = {};
  options: Record<string, unknown>;
  constructor(options: Record<string, unknown>) { this.options = options; }
  on(event: string, handler: () => void) { this.handlers[event] = handler; }
}

const points = (properties: Record<string, unknown>): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties, geometry: { type: 'Point', coordinates: [108.94, 34.265] } }],
});
const lines = (properties: Record<string, unknown>): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: [[108.94, 34.265], [108.95, 34.27]] } }],
});
const emptyPoints: FeatureCollection<Point> = { type: 'FeatureCollection', features: [] };
const emptyLines: FeatureCollection<LineString> = { type: 'FeatureCollection', features: [] };

describe('Amap twin overlays', () => {
  it('renders route, facility, resource and event as native AMap overlays', () => {
    const created: FakeOverlay[] = [];
    class FakePolyline extends FakeOverlay { constructor(options: Record<string, unknown>) { super(options); created.push(this); } }
    class FakeMarker extends FakeOverlay { constructor(options: Record<string, unknown>) { super(options); created.push(this); } }
    const onMarkerClick = vi.fn();
    const AMap = { Polyline: FakePolyline, Marker: FakeMarker } as unknown as AMapApi;
    const result = buildAmapTwinOverlays(AMap, {
      roads: lines({ primary: 1 }), landmarks: points({ label: '曲江互通', kp: 1168 }), incidents: points({ id: 'EV-1' }), congestion: lines({ color: '#ef7f3b' }), devices: points({ id: 'CAM-1', label: 'CAM-1', camera: 1, online: 1, color: '#2f7df6' }), resources: points({ id: 'W-01', label: 'W-01', color: '#00a870', occupied: 0 }), overlayLines: emptyLines, overlayPoints: emptyPoints, queueTail: emptyPoints, prediction: emptyPoints, radarCoverage: emptyLines, radarLanes: emptyLines, radarTrails: emptyLines, radarBodies: emptyLines, radarVehicles: emptyPoints, onMarkerClick,
    });

    expect(result).toHaveLength(7);
    expect(created.filter((item) => 'path' in item.options)).toHaveLength(3);
    const camera = created.find((item) => String(item.options.content).includes('CAM-1'))!;
    camera.handlers.click();
    expect(onMarkerClick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'camera', properties: expect.objectContaining({ id: 'CAM-1' }) }));
  });

  it('reports non-camera infrastructure marker clicks for grid-map linkage', () => {
    const created: FakeOverlay[] = [];
    class FakePolyline extends FakeOverlay { constructor(options: Record<string, unknown>) { super(options); created.push(this); } }
    class FakeMarker extends FakeOverlay { constructor(options: Record<string, unknown>) { super(options); created.push(this); } }
    const onMarkerClick = vi.fn();
    const AMap = { Polyline: FakePolyline, Marker: FakeMarker } as unknown as AMapApi;
    buildAmapTwinOverlays(AMap, {
      roads: emptyLines, landmarks: emptyPoints, incidents: emptyPoints, congestion: emptyLines, devices: points({ id: 'VMS-01', label: 'VMS-01', camera: 0, online: 1, color: '#f2b84b' }), resources: emptyPoints, overlayLines: emptyLines, overlayPoints: emptyPoints, queueTail: emptyPoints, prediction: emptyPoints, radarCoverage: emptyLines, radarLanes: emptyLines, radarTrails: emptyLines, radarBodies: emptyLines, radarVehicles: emptyPoints, onMarkerClick,
    });
    created[0].handlers.click();
    expect(onMarkerClick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'device', properties: expect.objectContaining({ id: 'VMS-01' }) }));
  });
});
