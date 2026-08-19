import { describe, expect, it } from 'vitest';
import {
  buildRoadFeatureCollection,
  chainageToLngLat,
  roadCoordinatesBetween,
  SIMULATED_ROADS,
} from './xiAnRing';

describe('西安绕城模拟 GIS 几何', () => {
  it('将主环起止桩号映射到闭合环线同一点', () => {
    expect(chainageToLngLat('G65', 1130)).toEqual(SIMULATED_ROADS.G65.coordinates[0]);
    expect(chainageToLngLat('G65', 1210)).toEqual(SIMULATED_ROADS.G65.coordinates.at(-1));
  });

  it('将超界桩号安全钳制到道路端点', () => {
    expect(chainageToLngLat('G56', -10)).toEqual(SIMULATED_ROADS.G56.coordinates[0]);
    expect(chainageToLngLat('G56', 80)).toEqual(SIMULATED_ROADS.G56.coordinates.at(-1));
  });

  it('生成包含精确首尾点的拥堵连续折线', () => {
    const coordinates = roadCoordinatesBetween('G65', 1186.5, 1195, 1);
    expect(coordinates.length).toBeGreaterThan(2);
    expect(coordinates[0]).toEqual(chainageToLngLat('G65', 1186.5));
    expect(coordinates.at(-1)).toEqual(chainageToLngLat('G65', 1195));
    expect(coordinates.flat().every(Number.isFinite)).toBe(true);
  });

  it('输出主环、南段延伸及两条连接通道的 GeoJSON', () => {
    const collection = buildRoadFeatureCollection();
    expect(collection.features).toHaveLength(4);
    expect(collection.features.map((feature) => feature.properties?.road)).toEqual(['G65', 'G65S', 'G56', 'S204']);
  });
});
