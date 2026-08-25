import { describe, expect, it } from 'vitest';
import { monitoringListItemFixture } from '../components/componentTestFixtures';
import {
  buildMonitoringGisModel,
  clusterMonitoringGisPoints,
  monitoringEventViewport,
  resolveMonitoringCoordinate,
  type MonitoringGisPoint,
} from './monitoringGisModel';

describe('FR-EM-008 GIS纯模型', () => {
  it('优先使用上报坐标，缺失时只使用已配置道路几何', () => {
    expect(resolveMonitoringCoordinate({ roadCode: 'UNKNOWN', direction: 'up', longitude: 109, latitude: 34 }))
      .toEqual({ coordinate: [109, 34], coordinateSource: 'reported_coordinate' });
    expect(resolveMonitoringCoordinate({ roadCode: 'G65', direction: 'up', kilometer: 1160 })?.coordinateSource)
      .toBe('configured_road_geometry');
    expect(resolveMonitoringCoordinate({ roadCode: 'UNKNOWN', direction: 'up', kilometer: 1 })).toBeUndefined();
  });

  it('无坐标事件明确进入未定位集合，不编造地图点', () => {
    const item = monitoringListItemFixture();
    const unlocated = { ...item, event: { ...item.event, location: { roadCode: 'UNKNOWN', direction: 'up' as const } } };
    const model = buildMonitoringGisModel([unlocated], undefined, 10);
    expect(model.points).toHaveLength(0);
    expect(model.unlocatedEventIds).toEqual([item.event.monitoringEventId]);
  });

  it('低缩放级别聚合相邻事件，高缩放级别恢复独立点', () => {
    const points: MonitoringGisPoint[] = [
      { eventId: 'A', coordinate: [108.9, 34.2], coordinateSource: 'reported_coordinate', level: 'L2', eventType: 'fire', verificationStatus: 'pending', roadCode: 'G65', simulation: true, selected: false },
      { eventId: 'B', coordinate: [108.901, 34.201], coordinateSource: 'reported_coordinate', level: 'L4', eventType: 'fire', verificationStatus: 'pending', roadCode: 'G65', simulation: true, selected: true },
    ];
    const clustered = clusterMonitoringGisPoints(points, 10);
    expect(clustered).toHaveLength(1);
    expect(clustered[0]).toMatchObject({ count: 2, highestLevel: 'L4', simulationCount: 2, selected: true });
    expect(clusterMonitoringGisPoints(points, 15)).toHaveLength(2);
  });

  it('卡片选中事件可解析为地图定位视角', () => {
    const item = monitoringListItemFixture();
    expect(monitoringEventViewport(item)).toMatchObject({ zoom: 14.5 });
  });

  it('1000点聚合保持全部事件ID且不丢模拟标识', () => {
    const points: MonitoringGisPoint[] = Array.from({ length: 1_000 }, (_, index) => ({
      eventId: `ME-${index}`,
      coordinate: [108.8 + (index % 20) * 0.001, 34.2 + Math.floor(index / 20) * 0.001],
      coordinateSource: 'reported_coordinate',
      level: index % 4 === 0 ? 'L4' : 'L2',
      eventType: 'traffic_congestion', verificationStatus: 'pending', roadCode: 'G65', simulation: true, selected: false,
    }));
    const clusters = clusterMonitoringGisPoints(points, 10);
    expect(clusters.flatMap((cluster) => cluster.eventIds)).toHaveLength(1_000);
    expect(clusters.reduce((sum, cluster) => sum + cluster.simulationCount, 0)).toBe(1_000);
  });
});
