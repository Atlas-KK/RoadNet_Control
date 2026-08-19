import type { RoadId } from '../data/network';
import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import { FLOW_PARAMS, queueLength } from '../engine/flowModel';
import { resolveTrafficResponse } from '../engine/trafficResponse';
import type { ActiveDemoTwin, DemoTwinPhase, TwinChainageDirection } from './demoTwinScenario';
import { resolveDemoTwin } from './demoTwinScenario';
import { chainageToLngLat, SIMULATED_ROADS, type LngLat } from './xiAnRing';

export type RadarVehicleStatus = 'normal' | 'slow' | 'queued' | 'incident' | 'opposite';
export type RadarVehicleKind = '小客车' | '大货车' | '大客车' | '小货车';
/** 以桩号递增/递减描述真实行驶方向，避免“朝事故/反向”的语义歧义。 */
export type RadarTravelDirection = TwinChainageDirection;

export interface RadarVehicleTarget {
  id: string;
  eventId: string;
  road: RoadId;
  kp: number;
  coordinate: LngLat;
  body: LngLat[];
  trail: LngLat[];
  lane: number;
  direction: RadarTravelDirection;
  kind: RadarVehicleKind;
  speedKmh: number;
  status: RadarVehicleStatus;
  color: string;
}

export interface RadarCoverageLine {
  id: string;
  eventId: string;
  label: string;
  coordinates: LngLat[];
}

export interface RadarLaneStream {
  id: string;
  eventId: string;
  lane: number;
  direction: RadarTravelDirection;
  color: string;
  coordinates: LngLat[];
}

export interface RadarFusionTraffic {
  vehicles: RadarVehicleTarget[];
  coverage: RadarCoverageLine[];
  lanes: RadarLaneStream[];
}

const VEHICLE_KINDS: RadarVehicleKind[] = ['小客车', '大货车', '大客车', '小货车'];

const STATUS_COLOR: Record<RadarVehicleStatus, string> = {
  normal: '#86b6ef',
  slow: '#f5c84c',
  queued: '#ef7f3b',
  incident: '#ff4d4f',
  opposite: '#d8e4f2',
};

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function fract(n: number): number {
  return n - Math.floor(n);
}

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function eventTravelDirection(event: SimEvent): RadarTravelDirection {
  return event.direction === 'up' ? 'decreasing' : 'increasing';
}

function coordinateWithLaneOffset(road: RoadId, kp: number, lane: number, lanesTotal: number, direction: RadarTravelDirection): LngLat {
  const base = chainageToLngLat(road, kp);
  const before = chainageToLngLat(road, kp - 0.08);
  const after = chainageToLngLat(road, kp + 0.08);
  const dxMeters = (after[0] - before[0]) * 111320 * Math.cos(base[1] * Math.PI / 180);
  const dyMeters = (after[1] - before[1]) * 111320;
  const length = Math.hypot(dxMeters, dyMeters) || 1;
  const normalX = -dyMeters / length;
  const normalY = dxMeters / length;
  const carriagewayOffset = direction === 'increasing' ? -15 : 15;
  const laneOffset = (lane - (lanesTotal + 1) / 2) * 6.5;
  const meters = carriagewayOffset + laneOffset;
  return [
    base[0] + (normalX * meters) / (111320 * Math.cos(base[1] * Math.PI / 180)),
    base[1] + (normalY * meters) / 111320,
  ];
}

function isBetween(value: number, a: number, b: number): boolean {
  return value >= Math.min(a, b) && value <= Math.max(a, b);
}

function statusFor(event: SimEvent, kp: number, lane: number, tailKp: number, direction: RadarTravelDirection): RadarVehicleStatus {
  if (lane <= event.lanesClosed && Math.abs(kp - event.accidentKp) <= 0.35) return 'incident';
  if (event.congested && isBetween(kp, tailKp, event.accidentKp)) return 'queued';
  const slowEnd = direction === 'increasing' ? tailKp - 1.2 : tailKp + 1.2;
  if (event.congested && isBetween(kp, tailKp, slowEnd)) return 'slow';
  return 'normal';
}

function speedFor(event: SimEvent, status: RadarVehicleStatus, seed: number): number {
  const vf = event.vf ?? FLOW_PARAMS.V_F;
  const jitter = (seed % 9) - 4;
  if (status === 'incident') return 0;
  if (status === 'queued') return clamp(5 + jitter * 0.6, 2, 12);
  if (status === 'slow') return clamp(vf * 0.32 + jitter, 18, 45);
  if (status === 'opposite') return clamp(vf * 0.82 + jitter, 70, vf);
  return clamp(vf * 0.78 + jitter, 68, vf);
}

function movingKp(startKp: number, endKp: number, seed: number, simSec: number, speedKmh: number): number {
  const lengthKm = Math.max(0.5, Math.abs(endKp - startKp));
  const base = fract(seed * 0.000013);
  const step = (simSec * Math.max(2, speedKmh)) / 3600 / lengthKm;
  const progress = fract(base + step);
  return startKp + (endKp - startKp) * progress;
}

interface VehicleOptions {
  status?: RadarVehicleStatus;
  speedKmh?: number;
  fixedKp?: number;
}

function buildVehicle(
  event: SimEvent,
  index: number,
  simSec: number,
  direction: RadarTravelDirection,
  startKp: number,
  endKp: number,
  tailKp: number,
  options: VehicleOptions = {},
): RadarVehicleTarget {
  const lanesTotal = Math.max(1, event.lanesTotal);
  const seed = hashSeed(`${event.id}:${direction}:${index}`);
  const lane = (index % lanesTotal) + 1;
  const kind = VEHICLE_KINDS[seed % VEHICLE_KINDS.length];
  const draftKp = movingKp(startKp, endKp, seed, simSec, event.vf ?? FLOW_PARAMS.V_F);
  const status = options.status ?? statusFor(event, draftKp, lane, tailKp, direction);
  const speedKmh = options.speedKmh ?? speedFor(event, status, seed);
  const kp = options.fixedKp ?? (status === 'incident'
    ? event.accidentKp + (direction === 'increasing' ? -1 : 1) * 0.05 * Math.min(lane, event.lanesClosed)
    : movingKp(startKp, endKp, seed, simSec, speedKmh));
  const vehicleLengthKm = kind === '大货车' || kind === '大客车' ? 0.11 : 0.075;
  const rearShift = direction === 'increasing' ? -vehicleLengthKm : vehicleLengthKm;
  const trailShift = direction === 'increasing'
    ? -clamp(speedKmh / 120, 0.16, 0.46)
    : clamp(speedKmh / 120, 0.16, 0.46);
  return {
    id: `RV-${event.id}-${String(index + 1).padStart(3, '0')}`,
    eventId: event.id,
    road: event.road,
    kp,
    coordinate: coordinateWithLaneOffset(event.road, kp, lane, lanesTotal, direction),
    body: [
      coordinateWithLaneOffset(event.road, kp + rearShift, lane, lanesTotal, direction),
      coordinateWithLaneOffset(event.road, kp, lane, lanesTotal, direction),
    ],
    trail: [
      coordinateWithLaneOffset(event.road, kp + trailShift, lane, lanesTotal, direction),
      coordinateWithLaneOffset(event.road, kp, lane, lanesTotal, direction),
    ],
    lane,
    direction,
    kind,
    speedKmh,
    status,
    color: STATUS_COLOR[status],
  };
}

function scenarioTraffic(event: SimEvent, simSec: number, phase: DemoTwinPhase): RadarFusionTraffic {
  const direction = phase.traffic.travelDirection;
  const road = SIMULATED_ROADS[event.road];
  const queueStart = clamp(phase.traffic.queueTailKp, road.fromKp, road.toKp);
  const queueEnd = clamp(event.accidentKp + (direction === 'increasing' ? -0.08 : 0.08), road.fromKp, road.toKp);
  const queued = Array.from({ length: phase.traffic.queuedVehicleCount }, (_, index) => {
    const seed = hashSeed(`${event.id}:queue:${index}`);
    const kp = queueStart + (queueEnd - queueStart) * fract(seed * 0.000013);
    return buildVehicle(event, index, simSec, direction, queueStart, queueEnd, queueStart, {
      status: 'queued', speedKmh: phase.traffic.queueSpeedKmh, fixedKp: phase.traffic.closureActive ? kp : undefined,
    });
  });
  const incidentCount = Math.min(event.lanesClosed, event.lanesTotal);
  const incidents = Array.from({ length: incidentCount }, (_, index) => buildVehicle(
    event,
    phase.traffic.queuedVehicleCount + index,
    simSec,
    direction,
    queueStart,
    queueEnd,
    queueStart,
    { status: 'incident', speedKmh: 0 },
  ));
  const evacuation = phase.traffic.evacuation;
  const evacuationVehicles = evacuation
    ? Array.from({ length: evacuation.vehicleCount }, (_, index) => buildVehicle(
      event,
      phase.traffic.queuedVehicleCount + incidentCount + index,
      simSec,
      direction,
      evacuation.fromKp,
      evacuation.toKp,
      queueStart,
      { status: 'slow', speedKmh: evacuation.speedKmh },
    ))
    : [];
  const controlled = phase.traffic.controlledFlow;
  const controlledVehicles = controlled
    ? Array.from({ length: controlled.vehicleCount }, (_, index) => buildVehicle(
      event,
      phase.traffic.queuedVehicleCount + incidentCount + evacuationVehicles.length + index,
      simSec,
      direction,
      controlled.fromKp,
      controlled.toKp,
      queueStart,
      { status: 'slow', speedKmh: controlled.speedKmh },
    ))
    : [];
  const laneStart = phase.traffic.closureActive ? phase.traffic.closureKp : queueStart;
  const laneEnd = evacuation?.toKp ?? event.accidentKp;
  const lanes = Array.from({ length: event.lanesTotal }, (_, index): RadarLaneStream => ({
    id: `RL-${event.id}-${index + 1}`,
    eventId: event.id,
    lane: index + 1,
    direction,
    color: index < event.lanesClosed ? '#ff4d4f' : '#4fd1c5',
    coordinates: [
      coordinateWithLaneOffset(event.road, laneStart, index + 1, event.lanesTotal, direction),
      coordinateWithLaneOffset(event.road, laneEnd, index + 1, event.lanesTotal, direction),
    ],
  }));
  const coverageStart = Math.min(phase.traffic.closureKp, queueStart);
  const coverageEnd = Math.max(event.accidentKp + 0.5, evacuation?.toKp ?? event.accidentKp);
  return {
    vehicles: [...queued, ...incidents, ...evacuationVehicles, ...controlledVehicles],
    lanes,
    coverage: [{
      id: `RC-${event.id}`,
      eventId: event.id,
      label: `事故孪生覆盖 K${coverageStart.toFixed(1)}–K${coverageEnd.toFixed(1)} · 能见度 ${phase.traffic.visibilityMeters}m`,
      coordinates: [
        coordinateWithLaneOffset(event.road, coverageStart, 1, event.lanesTotal, direction),
        coordinateWithLaneOffset(event.road, coverageEnd, event.lanesTotal, event.lanesTotal, direction),
      ],
    }],
  };
}

export function buildRadarFusionTraffic(
  events: SimEvent[],
  simSec: number,
  focusedEventId: string | null,
  plans: Plan[] = [],
  activeDemoTwin?: ActiveDemoTwin,
): RadarFusionTraffic {
  const event = events.find((item) => item.id === focusedEventId && !item.finalized && !item.falsePositive);
  if (!event) return { vehicles: [], coverage: [], lanes: [] };
  const scenario = resolveDemoTwin(activeDemoTwin, simSec, event.id);
  if (scenario?.eventId === event.id) return scenarioTraffic(event, simSec, scenario.phase);

  const road = SIMULATED_ROADS[event.road];
  const direction = eventTravelDirection(event);
  const oppositeDirection: RadarTravelDirection = direction === 'increasing' ? 'decreasing' : 'increasing';
  const elapsedMin = Math.max(0, (simSec - event.startSimSec) / 60);
  const queueKm = plans.length > 0
    ? resolveTrafficResponse(event, plans, simSec).queueLengthKm
    : event.congested ? queueLength(event.w, elapsedMin) : 0;
  const tailKp = event.accidentKp + (direction === 'increasing' ? -queueKm : queueKm);
  const upstreamSpan = clamp(queueKm + 3.2, 4, 10);
  const downstreamSpan = 2.8;
  const startKp = clamp(event.accidentKp + (direction === 'increasing' ? -upstreamSpan : upstreamSpan), road.fromKp, road.toKp);
  const endKp = clamp(event.accidentKp + (direction === 'increasing' ? downstreamSpan : -downstreamSpan), road.fromKp, road.toKp);
  const affectedCount = clamp(Math.round(event.q / 95), event.lanesTotal * 12, event.lanesTotal * 26);
  const oppositeCount = clamp(Math.round(affectedCount * 0.48), event.lanesTotal * 6, event.lanesTotal * 12);
  const incidentCount = Math.min(event.lanesClosed, event.lanesTotal);
  const vehicles = [
    ...Array.from({ length: affectedCount }, (_, index) => buildVehicle(event, index, simSec, direction, startKp, endKp, tailKp)),
    ...Array.from({ length: oppositeCount }, (_, index) => buildVehicle(event, affectedCount + index, simSec, oppositeDirection, endKp, startKp, tailKp, { status: 'opposite' })),
    ...Array.from({ length: incidentCount }, (_, index) => buildVehicle(event, affectedCount + oppositeCount + index, simSec, direction, startKp, endKp, tailKp, { status: 'incident' })),
  ];
  const coverageStart = clamp(event.accidentKp - upstreamSpan - 0.8, road.fromKp, road.toKp);
  const coverageEnd = clamp(event.accidentKp + downstreamSpan + 0.8, road.fromKp, road.toKp);
  const lanes = [
    ...Array.from({ length: event.lanesTotal }, (_, index): RadarLaneStream => ({
      id: `RL-${event.id}-T-${index + 1}`, eventId: event.id, lane: index + 1, direction,
      color: index < event.lanesClosed ? '#ef7f3b' : '#4fd1c5',
      coordinates: [coordinateWithLaneOffset(event.road, coverageStart, index + 1, event.lanesTotal, direction), coordinateWithLaneOffset(event.road, coverageEnd, index + 1, event.lanesTotal, direction)],
    })),
    ...Array.from({ length: event.lanesTotal }, (_, index): RadarLaneStream => ({
      id: `RL-${event.id}-O-${index + 1}`, eventId: event.id, lane: index + 1, direction: oppositeDirection,
      color: '#86b6ef',
      coordinates: [coordinateWithLaneOffset(event.road, coverageEnd, index + 1, event.lanesTotal, oppositeDirection), coordinateWithLaneOffset(event.road, coverageStart, index + 1, event.lanesTotal, oppositeDirection)],
    })),
  ];
  return {
    vehicles,
    lanes,
    coverage: [{
      id: `RC-${event.id}`, eventId: event.id,
      label: `雷视融合覆盖 K${coverageStart.toFixed(1)}–K${coverageEnd.toFixed(1)}`,
      coordinates: [coordinateWithLaneOffset(event.road, coverageStart, 1, event.lanesTotal, direction), coordinateWithLaneOffset(event.road, coverageEnd, event.lanesTotal, event.lanesTotal, oppositeDirection)],
    }],
  };
}
