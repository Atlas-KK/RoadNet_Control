import type { Plan } from '../domain/plan';
import type { SimEvent } from '../domain/event';
import { GANTRIES, type GantrySpec } from '../data/gantries';
import { FLOW_PARAMS } from './flowModel';
import { resolveTrafficMonitorReading } from './trafficMonitor';
import { resolveTrafficResponse } from './trafficResponse';
import type { ActiveDemoTwin } from '../gis/demoTwinScenario';

export const GANTRY_SEARCH_RADIUS_KM = 10;
export const GANTRY_EXPANDED_RADIUS_KM = 20;

export type GantryPosition = 'upstream' | 'downstream';
export type CongestionLevel = '畅通' | '轻度拥堵' | '中度拥堵' | '重度拥堵';

export interface GantrySelection {
  gantry: GantrySpec;
  position: GantryPosition;
  searchRadiusKm: number;
}

export interface GantryTrafficPoint {
  gantryId: string;
  normalCapacityVehPerHour: number;
  realtimeCapacityVehPerHour: number;
  retentionRate: number;
  lossRate: number;
}

export interface GantryTrafficReading {
  upstream: GantrySelection | null;
  downstream: GantrySelection | null;
  upstreamPoint: GantryTrafficPoint | null;
  downstreamPoint: GantryTrafficPoint | null;
  congestionLevel: CongestionLevel | null;
  minRetentionRate: number | null;
  responseStage: ReturnType<typeof resolveTrafficResponse>['stage'];
}

interface DemoGantryProfile {
  normalBaseVehPerHour: number;
  normalPeakVehPerHour: number;
  phase: number;
}

/** 演示历史基线参数：用固定周期曲线模拟“同门架正常历史时段 P90”。 */
const DEMO_GANTRY_PROFILES: Record<string, DemoGantryProfile> = {
  'G65-GT-1140': { normalBaseVehPerHour: 4100, normalPeakVehPerHour: 520, phase: 0.2 },
  'G65-GT-1162': { normalBaseVehPerHour: 4300, normalPeakVehPerHour: 580, phase: 0.7 },
  'G65-GT-1195': { normalBaseVehPerHour: 4480, normalPeakVehPerHour: 620, phase: 1.3 },
  'G65-GT-1205': { normalBaseVehPerHour: 4380, normalPeakVehPerHour: 560, phase: 1.8 },
  'G65S-GT-1230': { normalBaseVehPerHour: 4200, normalPeakVehPerHour: 520, phase: 0.4 },
  'G65S-GT-1248': { normalBaseVehPerHour: 4050, normalPeakVehPerHour: 480, phase: 1.1 },
  'G65S-GT-1278': { normalBaseVehPerHour: 3900, normalPeakVehPerHour: 440, phase: 1.7 },
  'G56-GT-20': { normalBaseVehPerHour: 2700, normalPeakVehPerHour: 360, phase: 0.3 },
  'G56-GT-35': { normalBaseVehPerHour: 2850, normalPeakVehPerHour: 420, phase: 1.0 },
  'G56-GT-50': { normalBaseVehPerHour: 2650, normalPeakVehPerHour: 340, phase: 1.6 },
  'S204-GT-10': { normalBaseVehPerHour: 1900, normalPeakVehPerHour: 260, phase: 0.2 },
  'S204-GT-30': { normalBaseVehPerHour: 2050, normalPeakVehPerHour: 300, phase: 1.0 },
  'S204-GT-50': { normalBaseVehPerHour: 1800, normalPeakVehPerHour: 240, phase: 1.8 },
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function travelDirection(event: SimEvent): 'increasing' | 'decreasing' {
  return event.direction === 'up' ? 'decreasing' : 'increasing';
}

function selectNearest(
  event: SimEvent,
  position: GantryPosition,
  radiusKm: number,
): GantrySpec | null {
  const direction = travelDirection(event);
  const candidates = GANTRIES
    .filter((gantry) => gantry.road === event.road)
    .filter((gantry) => gantry.kp !== event.accidentKp)
    .filter((gantry) => position === 'upstream'
      ? direction === 'increasing' ? gantry.kp < event.accidentKp : gantry.kp > event.accidentKp
      : direction === 'increasing' ? gantry.kp > event.accidentKp : gantry.kp < event.accidentKp)
    .filter((gantry) => Math.abs(gantry.kp - event.accidentKp) <= radiusKm)
    .sort((a, b) => Math.abs(a.kp - event.accidentKp) - Math.abs(b.kp - event.accidentKp));
  return candidates[0] ?? null;
}

/** 先查 10km，未命中时扩大到 20km；始终只取同一干线最近点位。 */
export function selectNearbyGantry(event: SimEvent, position: GantryPosition): GantrySelection | null {
  const first = selectNearest(event, position, GANTRY_SEARCH_RADIUS_KM);
  if (first) return { gantry: first, position, searchRadiusKm: GANTRY_SEARCH_RADIUS_KM };
  const expanded = selectNearest(event, position, GANTRY_EXPANDED_RADIUS_KM);
  return expanded ? { gantry: expanded, position, searchRadiusKm: GANTRY_EXPANDED_RADIUS_KM } : null;
}

export function selectGantryPair(event: SimEvent): { upstream: GantrySelection | null; downstream: GantrySelection | null } {
  return {
    upstream: selectNearbyGantry(event, 'upstream'),
    downstream: selectNearbyGantry(event, 'downstream'),
  };
}

function normalCapacity(gantry: GantrySpec, simSec: number): number {
  const profile = DEMO_GANTRY_PROFILES[gantry.id] ?? {
    normalBaseVehPerHour: gantry.laneCount * 1450,
    normalPeakVehPerHour: gantry.laneCount * 180,
    phase: 0,
  };
  const wave = Math.sin((simSec / 3600) * Math.PI / 6 + profile.phase);
  const physicalCeiling = gantry.laneCount * FLOW_PARAMS.C_LANE * 0.95;
  return Math.round(Math.min(physicalCeiling, profile.normalBaseVehPerHour + profile.normalPeakVehPerHour * (0.5 + 0.5 * wave)));
}

function realtimeCapacity(
  event: SimEvent,
  gantry: GantrySpec,
  position: GantryPosition,
  simSec: number,
  plans: Plan[],
  activeDemoTwin?: ActiveDemoTwin,
): number {
  const reading = resolveTrafficMonitorReading(event, plans, simSec, activeDemoTwin);
  const response = resolveTrafficResponse(event, plans, simSec);
  const nominalIncidentCapacity = Math.max(1, event.lanesTotal * FLOW_PARAMS.C_LANE * 0.95);
  const incidentRetention = clamp(reading.capacityVehPerHour / nominalIncidentCapacity, 0.12, 1);
  const queueRatio = clamp(response.queueLengthKm / 10, 0, 1);
  const directionImpact = position === 'upstream' ? 0.78 : 0.42;
  const recovery = response.stage === 'recovered' ? 0.16 : response.stage === 'dissipating' ? 0.08 : 0;
  const deterministicVariation = 1 + 0.025 * Math.sin(simSec / 13 + gantry.kp / 19);
  const impactFactor = clamp(1 - (1 - incidentRetention) * directionImpact - queueRatio * directionImpact * 0.48 + recovery, 0.12, 1);
  const physicalCeiling = gantry.laneCount * FLOW_PARAMS.C_LANE * 0.95;
  return Math.round(Math.min(physicalCeiling, normalCapacity(gantry, simSec) * impactFactor * deterministicVariation));
}

function buildPoint(event: SimEvent, selection: GantrySelection | null, simSec: number, plans: Plan[], activeDemoTwin?: ActiveDemoTwin): GantryTrafficPoint | null {
  if (!selection) return null;
  const normal = normalCapacity(selection.gantry, simSec);
  const realtime = realtimeCapacity(event, selection.gantry, selection.position, simSec, plans, activeDemoTwin);
  const retentionRate = normal > 0 ? clamp(realtime / normal, 0, 1) : 0;
  return {
    gantryId: selection.gantry.id,
    normalCapacityVehPerHour: normal,
    realtimeCapacityVehPerHour: realtime,
    retentionRate: Number(retentionRate.toFixed(3)),
    lossRate: Number((1 - retentionRate).toFixed(3)),
  };
}

export function congestionLevel(retentionRate: number): CongestionLevel {
  if (retentionRate >= 0.85) return '畅通';
  if (retentionRate >= 0.7) return '轻度拥堵';
  if (retentionRate >= 0.5) return '中度拥堵';
  return '重度拥堵';
}

/** 返回当前时刻两侧门架的正常/实时能力；实时值为动态演示门架流量。 */
export function resolveGantryTrafficReading(
  event: SimEvent,
  plans: Plan[],
  simSec: number,
  activeDemoTwin?: ActiveDemoTwin,
): GantryTrafficReading {
  const { upstream, downstream } = selectGantryPair(event);
  const upstreamPoint = buildPoint(event, upstream, simSec, plans, activeDemoTwin);
  const downstreamPoint = buildPoint(event, downstream, simSec, plans, activeDemoTwin);
  const retentions = [upstreamPoint?.retentionRate, downstreamPoint?.retentionRate].filter((value): value is number => value != null);
  const minRetentionRate = retentions.length ? Math.min(...retentions) : null;
  const responseStage = resolveTrafficResponse(event, plans, simSec).stage;
  return {
    upstream,
    downstream,
    upstreamPoint,
    downstreamPoint,
    congestionLevel: minRetentionRate == null ? null : congestionLevel(minRetentionRate),
    minRetentionRate,
    responseStage,
  };
}
