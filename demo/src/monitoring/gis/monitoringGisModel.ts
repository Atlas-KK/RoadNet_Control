// FR-EM-008：监测GIS纯模型。只消费经权限与筛选处理后的MonitoringListItem。
import type { EventLocation, MonitoringLevel } from '../../domain/monitoring';
import { chainageToLngLat, SIMULATED_ROADS, type LngLat } from '../../gis/xiAnRing';
import type { RoadId } from '../../data/network';
import type { MonitoringListItem } from '../selectors';

export interface MonitoringGisPoint {
  eventId: string;
  coordinate: LngLat;
  coordinateSource: 'reported_coordinate' | 'configured_road_geometry';
  level: MonitoringLevel;
  eventType: MonitoringListItem['event']['eventType'];
  verificationStatus: MonitoringListItem['event']['verificationStatus'];
  roadCode: string;
  kilometer?: number;
  simulation: boolean;
  selected: boolean;
}

export interface MonitoringGisCluster {
  clusterId: string;
  coordinate: LngLat;
  eventIds: readonly string[];
  count: number;
  highestLevel: MonitoringLevel;
  simulationCount: number;
  selected: boolean;
}

export interface MonitoringGisModel {
  points: readonly MonitoringGisPoint[];
  clusters: readonly MonitoringGisCluster[];
  unlocatedEventIds: readonly string[];
}

const LEVEL_RANK: Readonly<Record<MonitoringLevel, number>> = { L1: 1, L2: 2, L3: 3, L4: 4 };

function isConfiguredRoad(value: string): value is RoadId {
  return value in SIMULATED_ROADS;
}

function validCoordinate(longitude: number | undefined, latitude: number | undefined): longitude is number {
  return longitude !== undefined && latitude !== undefined
    && Number.isFinite(longitude) && Number.isFinite(latitude)
    && longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90;
}

export function resolveMonitoringCoordinate(location: EventLocation): Pick<MonitoringGisPoint, 'coordinate' | 'coordinateSource'> | undefined {
  if (validCoordinate(location.longitude, location.latitude)) {
    return { coordinate: [location.longitude, location.latitude!], coordinateSource: 'reported_coordinate' };
  }
  if (isConfiguredRoad(location.roadCode) && location.kilometer !== undefined && Number.isFinite(location.kilometer)) {
    return { coordinate: chainageToLngLat(location.roadCode, location.kilometer), coordinateSource: 'configured_road_geometry' };
  }
  return undefined;
}

function clusterCellDegrees(zoom: number): number {
  if (zoom >= 14) return 0;
  if (zoom >= 12) return 0.018;
  if (zoom >= 10) return 0.045;
  return 0.12;
}

function highestLevel(points: readonly MonitoringGisPoint[]): MonitoringLevel {
  return points.reduce((highest, point) => LEVEL_RANK[point.level] > LEVEL_RANK[highest] ? point.level : highest, 'L1' as MonitoringLevel);
}

export function clusterMonitoringGisPoints(points: readonly MonitoringGisPoint[], zoom: number): MonitoringGisCluster[] {
  const cell = clusterCellDegrees(zoom);
  if (cell === 0) {
    return points.map((point) => ({
      clusterId: `EVENT-${point.eventId}`,
      coordinate: point.coordinate,
      eventIds: [point.eventId],
      count: 1,
      highestLevel: point.level,
      simulationCount: point.simulation ? 1 : 0,
      selected: point.selected,
    }));
  }
  const buckets = new Map<string, MonitoringGisPoint[]>();
  for (const point of points) {
    const key = `${Math.floor(point.coordinate[0] / cell)}:${Math.floor(point.coordinate[1] / cell)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  return [...buckets.entries()].map(([key, bucket]) => ({
    clusterId: `CLUSTER-${key}`,
    coordinate: [
      bucket.reduce((sum, point) => sum + point.coordinate[0], 0) / bucket.length,
      bucket.reduce((sum, point) => sum + point.coordinate[1], 0) / bucket.length,
    ] as LngLat,
    eventIds: bucket.map((point) => point.eventId).sort(),
    count: bucket.length,
    highestLevel: highestLevel(bucket),
    simulationCount: bucket.filter((point) => point.simulation).length,
    selected: bucket.some((point) => point.selected),
  })).sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId));
}

export function buildMonitoringGisModel(
  items: readonly MonitoringListItem[],
  selectedEventId: string | undefined,
  zoom: number,
): MonitoringGisModel {
  const points: MonitoringGisPoint[] = [];
  const unlocatedEventIds: string[] = [];
  for (const item of items) {
    const resolved = resolveMonitoringCoordinate(item.event.location);
    if (!resolved) {
      unlocatedEventIds.push(item.event.monitoringEventId);
      continue;
    }
    points.push({
      eventId: item.event.monitoringEventId,
      ...resolved,
      level: item.displayLevel,
      eventType: item.event.eventType,
      verificationStatus: item.event.verificationStatus,
      roadCode: item.event.location.roadCode,
      kilometer: item.event.location.kilometer,
      simulation: item.event.simulation,
      selected: item.event.monitoringEventId === selectedEventId,
    });
  }
  return {
    points,
    clusters: clusterMonitoringGisPoints(points, zoom),
    unlocatedEventIds,
  };
}

export function monitoringEventViewport(item: MonitoringListItem): { center: LngLat; zoom: number } | undefined {
  const resolved = resolveMonitoringCoordinate(item.event.location);
  return resolved ? { center: resolved.coordinate, zoom: 14.5 } : undefined;
}
