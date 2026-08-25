import { describe, expect, it, vi } from 'vitest';
import type { AMapApi } from '../../gis/amapLoader';
import { buildMonitoringAmapOverlays } from './monitoringAmapOverlays';
import type { MonitoringGisCluster } from './monitoringGisModel';

class FakeOverlay {
  static options: Record<string, unknown>[] = [];
  private handler?: () => void;
  constructor(options: Record<string, unknown>) { FakeOverlay.options.push(options); }
  on(_event: string, handler: () => void) { this.handler = handler; }
  click() { this.handler?.(); }
}

describe('FR-EM-008 高德监测覆盖物', () => {
  it('复用配置路网并渲染带等级、聚合数和模拟标识的事件点', () => {
    FakeOverlay.options = [];
    const clicked = vi.fn();
    const cluster: MonitoringGisCluster = {
      clusterId: 'C1', coordinate: [108.9, 34.2], eventIds: ['ME-1', 'ME-2'], count: 2,
      highestLevel: 'L4', simulationCount: 2, selected: true,
    };
    const overlays = buildMonitoringAmapOverlays({
      Map: class {} as never,
      Polyline: FakeOverlay,
      Marker: FakeOverlay,
      InfoWindow: class {} as never,
    } as unknown as AMapApi, { clusters: [cluster], onClusterClick: clicked });
    expect(overlays.length).toBeGreaterThan(1);
    const markerOptions = FakeOverlay.options.at(-1);
    expect(markerOptions?.content).toContain('2');
    expect(markerOptions?.content).toContain('模拟');
    (overlays.at(-1) as FakeOverlay).click();
    expect(clicked).toHaveBeenCalledWith(cluster);
  });
});
