// ============================================================
// 双 GIS 引擎共享的动态地图模型。
// 业务状态先在此转换为与渲染器无关的“事故/拥堵/资源位置”，
// 地图引擎只负责绘制，避免业务规则与空间渲染实现耦合。
// ============================================================

import type { RoadId } from '../data/network';
import type { Resource } from '../data/resources';
import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import { resolveTrafficResponse } from '../engine/trafficResponse';
import { resolveDemoTwin, routeForResource, type ActiveDemoTwin } from './demoTwinScenario';
import { roadCoordinatesBetween, type LngLat } from './xiAnRing';

export const RESOURCE_COLORS: Record<Resource['kind'], string> = {
  wrecker: '#2f7df6',
  ambulance: '#ff675f',
  patrol: '#f2b84b',
  fire: '#ef4e50',
};

export interface ResourcePosition {
  resource: Resource;
  currentKp: number;
  occupied: boolean;
  statusLabel?: string;
}

export interface CongestionSegment {
  eventId: string;
  road: RoadId;
  lengthKm: number;
  color: string;
  coordinates: LngLat[];
  /** 事故点桩号，用于地图上标注排队起点。 */
  accidentKp: number;
  /** 当前排队尾部桩号 = 事故点桩号 − 排队长度，随模拟时钟向上游推进。 */
  tailKp: number;
  /** 排队尾部经纬度（coordinates 的上游端点），供地图绘制“队尾”标记。 */
  tailCoordinate: LngLat;
}

/** 排队长度到视觉等级的统一映射，保证两套地图颜色语义一致。 */
export function congestionColor(lengthKm: number): string {
  if (lengthKm >= 5) return '#ef4e50';
  if (lengthKm >= 2) return '#ef7f3b';
  return '#e4b13f';
}

/** 根据活动事件和模拟时钟生成向上游延伸的拥堵线段。 */
export function buildCongestionSegments(
  events: SimEvent[],
  simSec: number,
  plans: Plan[] = [],
  activeDemoTwin?: ActiveDemoTwin,
): CongestionSegment[] {
  return events.flatMap((event) => {
    if (event.finalized || !event.congested) return [];
    const scenario = resolveDemoTwin(activeDemoTwin, simSec, event.id);
    const scenarioTraffic = scenario?.eventId === event.id ? scenario.phase.traffic : undefined;
    const elapsedMin = Math.max(0, (simSec - event.startSimSec) / 60);
    const response = plans.length > 0
      ? resolveTrafficResponse(event, plans, simSec)
      : undefined;
    const lengthKm = scenarioTraffic
      ? Math.abs(event.accidentKp - scenarioTraffic.queueTailKp)
      : response?.queueLengthKm ?? (event.w * elapsedMin) / 60;
    if (lengthKm <= 0) return [];
    const tailKp = scenarioTraffic?.queueTailKp ?? (event.direction === 'up' ? event.accidentKp + lengthKm : event.accidentKp - lengthKm);
    const coordinates = roadCoordinatesBetween(event.road, tailKp, event.accidentKp);
    return [{
      eventId: event.id,
      road: event.road,
      lengthKm,
      color: congestionColor(lengthKm),
      coordinates,
      accidentKp: event.accidentKp,
      tailKp,
      // roadCoordinatesBetween 从上游端点（队尾）向事故点采样，故首点即当前队尾位置。
      tailCoordinate: coordinates[0],
    }];
  });
}

/**
 * 计算处置资源在当前模拟时刻的位置。
 *
 * 已被事件占用的资源优先停留在占用事件点；已下发且仍在途的资源按 ETA
 * 在线性桩号上插值。该函数保持纯函数，便于地图之外复用和单元测试。
 */
export function resolveResourcePositions(
  resources: Resource[],
  events: SimEvent[],
  plans: Plan[],
  resourceOccupancy: Record<string, string>,
  simSec: number,
  activeDemoTwin?: ActiveDemoTwin,
): ResourcePosition[] {
  return resources.map((resource) => {
    let currentKp = resource.currentKp ?? resource.homeKp;
    let statusLabel: string | undefined;
    const scriptedRoute = routeForResource(activeDemoTwin, resource.id, simSec);
    if (scriptedRoute) {
      const duration = Math.max(1, scriptedRoute.arriveSimSec - scriptedRoute.departSimSec);
      const progress = Math.min(1, Math.max(0, (simSec - scriptedRoute.departSimSec) / duration));
      const originKp = scriptedRoute.fromKp ?? resource.homeKp;
      currentKp = originKp + (scriptedRoute.targetKp - originKp) * progress;
      statusLabel = simSec < scriptedRoute.departSimSec
        ? '待命'
        : simSec < scriptedRoute.arriveSimSec
          ? `在途 · ${scriptedRoute.label}`
          : `到位 · ${scriptedRoute.label}`;
    }
    const occupiedEventId = resourceOccupancy[resource.id];
    const occupiedEvent = occupiedEventId
      ? events.find((event) => event.id === occupiedEventId)
      : undefined;
    if (occupiedEvent && !scriptedRoute) currentKp = occupiedEvent.accidentKp;

    for (const plan of plans) {
      if (plan.state === '已被替换' || plan.state === '已作废') continue;
      const measure = plan.measures.find(
        (item) => item.resource?.id === resource.id && item.runState === '已下发',
      );
      const targetEvent = events.find((event) => `PLAN-${event.id}` === plan.id);
      if (!measure?.resource || measure.confirmSimSec == null || !targetEvent) continue;
      const durationSec = Math.max(1, measure.resource.etaMin * 60);
      const progress = Math.min(1, Math.max(0, (simSec - measure.confirmSimSec) / durationSec));
      if (!scriptedRoute) currentKp = resource.homeKp + (targetEvent.accidentKp - resource.homeKp) * progress;
    }

    return { resource, currentKp, occupied: Boolean(occupiedEventId), statusLabel };
  });
}
