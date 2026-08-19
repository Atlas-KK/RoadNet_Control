// ============================================================
// 西安绕城高速模拟 GIS 几何。
// 坐标用于产品原型，不作为导航、测绘或生产调度依据；桩号为产品运行逻辑值。
// ============================================================

import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { RoadId } from '../data/network';

export type LngLat = [longitude: number, latitude: number];

interface SimulatedRoadGeometry {
  road: RoadId;
  name: string;
  fromKp: number;
  toKp: number;
  primary: boolean;
  coordinates: LngLat[];
}

/**
 * 以西安市区周边的实际空间形态为参考绘制的原型几何。
 * G65 在本运行版中承载西安绕城主环；G56、S204 作为事件推理所需的连接通道。
 */
export const SIMULATED_ROADS: Record<RoadId, SimulatedRoadGeometry> = {
  G65: {
    road: 'G65',
    name: '西安绕城高速（模拟 K1130–K1210）',
    fromKp: 1130,
    toKp: 1210,
    primary: true,
    coordinates: [
      [108.835, 34.373],
      [108.902, 34.397],
      [108.981, 34.398],
      [109.056, 34.376],
      [109.102, 34.329],
      [109.118, 34.266],
      [109.104, 34.202],
      [109.058, 34.155],
      [108.988, 34.131],
      [108.906, 34.132],
      [108.831, 34.158],
      [108.783, 34.205],
      [108.766, 34.268],
      [108.781, 34.327],
      [108.835, 34.373],
    ],
  },
  G65S: {
    road: 'G65S',
    name: 'G65 包茂高速 · 西安—柞水段（模拟 K1210–K1290）',
    fromKp: 1210,
    toKp: 1290,
    primary: true,
    coordinates: [
      [108.988, 34.131],
      [108.968, 34.050],
      [108.945, 33.960],
      [108.985, 33.862],
      [109.024, 33.800],
      [109.080, 33.720],
    ],
  },
  G56: {
    road: 'G56',
    name: '福银高速连接线（模拟）',
    fromKp: 0,
    toKp: 60,
    primary: false,
    coordinates: [
      [109.092, 34.185],
      [109.145, 34.151],
      [109.207, 34.105],
      [109.278, 34.061],
      [109.354, 34.021],
      [109.438, 33.982],
    ],
  },
  S204: {
    road: 'S204',
    name: 'S204 应急分流通道（模拟）',
    fromKp: 0,
    toKp: 40,
    primary: false,
    coordinates: [
      [108.784, 34.205],
      [108.726, 34.182],
      [108.667, 34.151],
      [108.608, 34.116],
      [108.548, 34.081],
    ],
  },
};

/** 使用球面距离近似计算两点距离，单位 km。 */
function distanceKm(a: LngLat, b: LngLat): number {
  const rad = Math.PI / 180;
  const lat1 = a[1] * rad;
  const lat2 = b[1] * rad;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * 将模拟桩号插值到道路折线上的经纬度。
 * 桩号超出道路范围时钳制到端点，避免场景数据错误导致标记落到地图外。
 */
export function chainageToLngLat(road: RoadId, kp: number): LngLat {
  const geometry = SIMULATED_ROADS[road];
  const clamped = Math.min(geometry.toKp, Math.max(geometry.fromKp, kp));
  const progress = (clamped - geometry.fromKp) / (geometry.toKp - geometry.fromKp || 1);
  const segmentLengths = geometry.coordinates.slice(1).map((point, index) => distanceKm(geometry.coordinates[index], point));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  const targetDistance = progress * totalLength;

  let traversed = 0;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (traversed + segmentLength >= targetDistance || index === segmentLengths.length - 1) {
      const ratio = segmentLength > 0 ? (targetDistance - traversed) / segmentLength : 0;
      const from = geometry.coordinates[index];
      const to = geometry.coordinates[index + 1];
      return [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio];
    }
    traversed += segmentLength;
  }
  return geometry.coordinates[geometry.coordinates.length - 1];
}

/** 生成两个桩号之间的连续折线，用于拥堵、分流路径和资源轨迹。 */
export function roadCoordinatesBetween(road: RoadId, fromKp: number, toKp: number, stepKm = 0.5): LngLat[] {
  const direction = toKp >= fromKp ? 1 : -1;
  const distance = Math.abs(toKp - fromKp);
  const steps = Math.max(1, Math.ceil(distance / stepKm));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const kp = fromKp + direction * Math.min(distance, index * (distance / steps));
    return chainageToLngLat(road, kp);
  });
}

/** 高德地图覆盖物初始化时使用的静态路网 GeoJSON。 */
export function buildRoadFeatureCollection(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = Object.values(SIMULATED_ROADS).map((road) => ({
    type: 'Feature',
    properties: {
      road: road.road,
      name: road.name,
      primary: road.primary ? 1 : 0,
    },
    geometry: {
      type: 'LineString',
      coordinates: road.coordinates,
    },
  }));
  return { type: 'FeatureCollection', features };
}

/** 西安绕城常用互通的标签位置。 */
export const RING_LANDMARKS = [
  { id: 'LM-01', name: '未央互通', kp: 1138 },
  { id: 'LM-02', name: '谢王互通', kp: 1151 },
  { id: 'LM-03', name: '曲江互通', kp: 1168 },
  { id: 'LM-04', name: '河池寨互通', kp: 1189 },
  { id: 'LM-05', name: '六村堡互通', kp: 1202 },
] as const;

/** G65 南段常用互通与隧道口标签。 */
export const SOUTH_LANDMARKS = [
  { id: 'LM-S1', name: '太乙宫互通', road: 'G65S' as const, kp: 1232 },
  { id: 'LM-S2', name: '终南山隧道北口', road: 'G65S' as const, kp: 1255 },
  { id: 'LM-S3', name: '终南山隧道南口', road: 'G65S' as const, kp: 1273 },
  { id: 'LM-S4', name: '营盘互通', road: 'G65S' as const, kp: 1278 },
] as const;

export const XI_AN_RING_BOUNDS: [LngLat, LngLat] = [
  [108.73, 34.1],
  [109.15, 34.43],
];

export const NETWORK_BOUNDS: [LngLat, LngLat] = [
  [108.60, 33.68],
  [109.20, 34.43],
];
