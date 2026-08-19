// ============================================================
// 事故点位交通流监测口径。
// 将流模型、已下发管控和案例孪生时间片收敛为可按固定频率采样的四项指标。
// ============================================================

import type { Plan } from '../domain/plan';
import type { SimEvent } from '../domain/event';
import { resolveDemoTwin, type ActiveDemoTwin } from '../gis/demoTwinScenario';
import { FLOW_PARAMS, computeFlow } from './flowModel';
import { resolveTrafficResponse } from './trafficResponse';

export interface TrafficMonitorReading {
  capacityVehPerHour: number;
  drivingDensityVehPerKm: number;
  queueDensityVehPerKm: number;
  spillbackSpeedKmh: number;
  responseStage: ReturnType<typeof resolveTrafficResponse>['stage'];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 返回事故点当前的模型监测读数。结构能力来自流模型；密度和回溯速度会根据
 * 已下发管控及案例时间片的封控、受控流和队列状态更新，供 30 秒采样曲线使用。
 */
export function resolveTrafficMonitorReading(
  event: SimEvent,
  plans: Plan[],
  simSec: number,
  activeDemoTwin?: ActiveDemoTwin,
): TrafficMonitorReading {
  const flow = computeFlow({
    eventId: event.id,
    accidentKp: event.accidentKp,
    lanesTotal: event.lanesTotal,
    lanesClosed: event.lanesClosed,
    q: event.q,
    vf: event.vf,
  });
  const response = resolveTrafficResponse(event, plans, simSec);
  const twin = resolveDemoTwin(activeDemoTwin, simSec, event.id);
  const phaseTraffic = twin?.phase.traffic;
  const queueLengthKm = phaseTraffic
    ? Math.abs(event.accidentKp - phaseTraffic.queueTailKp)
    : response.queueLengthKm;
  const queueRatio = clamp(queueLengthKm / 10, 0, 1);
  const observedSpeed = phaseTraffic?.controlledFlow?.speedKmh
    ?? (phaseTraffic?.closureActive ? Math.max(phaseTraffic.queueSpeedKmh, 5) : undefined);
  const drivingDensity = observedSpeed
    ? clamp(event.q / Math.max(observedSpeed, 5), flow.k_a, flow.k_q)
    : flow.k_a + (flow.k_q - flow.k_a) * queueRatio;
  const scriptedQueueRatio = phaseTraffic
    ? clamp(phaseTraffic.queuedVehicleCount / Math.max(1, event.lanesTotal * 18), 0, 1)
    : queueRatio;
  const queueDensity = Math.max(
    drivingDensity,
    flow.k_a + (flow.k_q - flow.k_a) * Math.max(queueRatio, scriptedQueueRatio),
  );
  const availableLanes = phaseTraffic?.availableLanes ?? Math.max(0, event.lanesTotal - event.lanesClosed);
  const capacityFactor = phaseTraffic?.capacityFactor ?? FLOW_PARAMS.ALPHA;
  const capacity = phaseTraffic?.closureActive ? 0 : availableLanes * FLOW_PARAMS.C_LANE * capacityFactor;
  const spillbackSpeed = phaseTraffic?.closureActive || response.stage === 'stabilizing' || response.stage === 'recovered'
    ? 0
    : response.stage === 'dissipating'
      ? -flow.w * 1.35
      : flow.w;

  return {
    capacityVehPerHour: Math.round(capacity),
    drivingDensityVehPerKm: Number(drivingDensity.toFixed(1)),
    queueDensityVehPerKm: Number(queueDensity.toFixed(1)),
    spillbackSpeedKmh: Number(spillbackSpeed.toFixed(1)),
    responseStage: response.stage,
  };
}
