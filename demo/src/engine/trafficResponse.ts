// ============================================================
// 管控后交通响应模型。
// 将预案措施的执行状态接入拥堵投影，统一供网格、地图线和事件孪生车流使用。
// ============================================================

import type { Plan } from '../domain/plan';
import { queueLength } from './flowModel';

const ISSUED_STATES = new Set(['已下发', '自动执行']);
const RESPONSE_MEASURES = new Set([
  'M_全封',
  'M_预置分流',
  'M_提前分流',
  'M_限速',
  'M_拥堵预警',
  'M_封车道',
  'M_调清障',
]);

export type TrafficResponseStage = 'growing' | 'stabilizing' | 'dissipating' | 'recovered';

export interface TrafficResponse {
  queueLengthKm: number;
  queueTailKp: number;
  stage: TrafficResponseStage;
  controlStartSimSec?: number;
  issuedMeasureIds: string[];
}

export interface TrafficResponseEvent {
  id?: string;
  accidentKp: number;
  startSimSec: number;
  congested: boolean;
  w: number;
  finalized?: boolean;
}

function latestActivePlan(eventId: string | undefined, plans: Plan[]): Plan | undefined {
  if (!eventId) return undefined;
  return plans
    .filter((plan) => plan.id === `PLAN-${eventId}` && !['已被替换', '已作废'].includes(plan.state))
    .sort((a, b) => b.version - a.version)[0];
}

/**
 * 根据当前有效预案计算队列的增长、稳定和消散阶段。
 * 未传入预案时保留旧的纯增长模型，兼容历史算法单测和非运行态调用。
 */
export function resolveTrafficResponse(
  event: TrafficResponseEvent,
  plans: Plan[] = [],
  simSec: number,
  visibleRadiusKm = 10,
): TrafficResponse {
  const baseElapsedMin = Math.max(0, (simSec - event.startSimSec) / 60);
  const baseQueueKm = event.congested && !event.finalized ? queueLength(event.w, baseElapsedMin) : 0;
  const plan = latestActivePlan(event.id, plans);
  const issuedMeasures = plan?.measures.filter((measure) => ISSUED_STATES.has(measure.runState) && RESPONSE_MEASURES.has(measure.measureId)) ?? [];
  const issuedMeasureIds = issuedMeasures.map((measure) => measure.measureId);

  if (!event.congested || event.finalized) {
    return { queueLengthKm: 0, queueTailKp: event.accidentKp, stage: 'recovered', issuedMeasureIds };
  }

  const hasDiversion = issuedMeasureIds.includes('M_预置分流') || issuedMeasureIds.includes('M_提前分流');
  const hasSpeedControl = issuedMeasureIds.includes('M_限速') || issuedMeasureIds.includes('M_拥堵预警');
  const hasIncidentControl = issuedMeasureIds.includes('M_封车道') || issuedMeasureIds.includes('M_全封') || issuedMeasureIds.includes('M_调清障');
  const responseEnabled = hasDiversion || hasSpeedControl || issuedMeasureIds.includes('M_全封');

  if (!responseEnabled || issuedMeasures.length === 0) {
    const queueKm = Math.min(visibleRadiusKm, Math.max(0, baseQueueKm));
    return {
      queueLengthKm: queueKm,
      queueTailKp: event.accidentKp - queueKm,
      stage: 'growing',
      issuedMeasureIds,
    };
  }

  const controlStartSimSec = Math.max(
    event.startSimSec,
    ...issuedMeasures.map((measure) => measure.confirmSimSec ?? event.startSimSec),
  );
  const queueAtControlKm = Math.min(
    visibleRadiusKm,
    Math.max(0, queueLength(event.w, Math.max(0, (controlStartSimSec - event.startSimSec) / 60))),
  );
  const responseElapsedMin = Math.max(0, (simSec - controlStartSimSec) / 60);

  // 分流和限速降低持续入流；清障/封道保证现场控制继续生效。按 MVP 的 w_d=2w
  // 口径给出可观察的消散速度，避免“措施已下发”只停留在预案卡片状态。
  const relief = (hasDiversion ? 0.35 : 0) + (hasSpeedControl ? 0.18 : 0) + (hasIncidentControl ? 0.12 : 0);
  const dissipationSpeed = event.w * (1.15 + relief);
  const queueKm = Math.max(0, queueAtControlKm - (dissipationSpeed * responseElapsedMin) / 60);
  const stage: TrafficResponseStage = queueKm <= 0.05
    ? 'recovered'
    : responseElapsedMin <= 0
      ? 'stabilizing'
      : 'dissipating';

  return {
    queueLengthKm: queueKm,
    queueTailKp: event.accidentKp - queueKm,
    stage,
    controlStartSimSec,
    issuedMeasureIds,
  };
}
