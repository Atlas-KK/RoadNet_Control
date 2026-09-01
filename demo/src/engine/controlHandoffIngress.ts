import type { HandoffRequest } from '../domain/handoff';
import type { PlanningGap, Plan, PlanMeasure } from '../domain/plan';
import { ROAD_IDS, type RoadId } from '../data/network';
import type { RuntimeEventInput } from './ingest';

export const SUPPORTED_CONTROL_ROADS = new Set<RoadId>(ROAD_IDS);

export const MONITORING_TYPE_NODE: Readonly<Record<string, string>> = {
  traffic_congestion: 'E_拥堵',
  traffic_accident: 'E_追尾',
  pedestrian_intrusion: 'E_行人',
  wrong_way_driving: 'E_逆行',
  reversing: 'E_倒车',
  abnormal_stop: 'E_抛锚',
  fire: 'E_火灾',
  road_debris: 'E_抛洒物',
};

export const MONITORING_TYPE_LABEL: Readonly<Record<string, string>> = {
  traffic_congestion: '交通拥堵', traffic_accident: '交通事故', pedestrian_intrusion: '行人闯入',
  wrong_way_driving: '车辆逆行', reversing: '车辆倒车', abnormal_stop: '异常停车',
  fire: '火灾', road_debris: '道路抛洒物',
};

export type ControlHandoffPreparation =
  | { kind: 'ready'; input: RuntimeEventInput }
  | { kind: 'planning_gap'; gap: PlanningGap };

export function prepareControlHandoff(request: HandoffRequest, createdAt: string): ControlHandoffPreparation {
  const facts = request.confirmedFacts;
  const missingFacts: string[] = [];
  if (!SUPPORTED_CONTROL_ROADS.has(request.context.roadCode as RoadId)) missingFacts.push('受支持的道路编码');
  if (facts.location.kilometer === undefined) missingFacts.push('桩号');
  if (facts.lanesTotal === undefined || facts.lanesTotal <= 0) missingFacts.push('总车道数');
  if (facts.lanesAffected === undefined || facts.lanesAffected < 0) missingFacts.push('受影响车道数');
  if (request.context.trafficSnapshot?.flowVehPerHour === undefined) missingFacts.push('交通流量');

  if (missingFacts.length) {
    const controlEventId = `CTRL-GAP-${request.monitoringEventId}-V${request.monitoringEventVersion}`;
    return {
      kind: 'planning_gap',
      gap: {
        gapId: `GAP-${request.handoffId}`, controlEventId,
        monitoringEventId: request.monitoringEventId, handoffId: request.handoffId,
        idempotencyKey: request.idempotencyKey, createdAt,
        reason: '已接收监测事件，但关键事实不足，禁止生成空参数可执行措施',
        missingFacts, status: 'open', simulation: request.simulation,
      },
    };
  }

  return {
    kind: 'ready',
    input: {
      sourceKind: '事件监测接管', road: request.context.roadCode as RoadId,
      accidentKp: facts.location.kilometer!, typeNodeId: MONITORING_TYPE_NODE[facts.eventType],
      label: MONITORING_TYPE_LABEL[facts.eventType], lanesTotal: facts.lanesTotal!, lanesClosed: facts.lanesAffected!,
      q: request.context.trafficSnapshot!.flowVehPerHour!, vf: request.context.trafficSnapshot?.speedKmh,
      casualties: facts.casualties, hazmat: facts.hazardousMaterials || facts.hazardousMaterialLeak,
      vehicles: facts.vehicleCount, direction: request.context.direction,
      monitoringHandoff: {
        monitoringEventId: request.monitoringEventId, handoffId: request.handoffId,
        idempotencyKey: request.idempotencyKey,
      },
    },
  };
}

function safeMeasure(measure: PlanMeasure): PlanMeasure | undefined {
  if (Object.keys(measure.params).length === 0) return undefined;
  return { ...measure, runState: measure.runState === '自动执行' ? '待确认' : measure.runState };
}

/** 接管生成的所有控制措施必须继续等待人工确认，且空参数措施不得进入计划。 */
export function sanitizeHandoffPlan(plan: Plan): { plan: Plan; removedMeasureIds: string[] } {
  const removed = new Set<string>();
  const measures = plan.measures.flatMap((measure) => {
    const safe = safeMeasure(measure);
    if (!safe) { removed.add(measure.measureId); return []; }
    return [safe];
  });
  const candidates = plan.candidates?.map((candidate) => ({
    ...candidate,
    measures: candidate.measures.flatMap((measure) => {
      const safe = safeMeasure(measure);
      if (!safe) { removed.add(measure.measureId); return []; }
      return [safe];
    }),
  }));
  return { plan: { ...plan, measures, candidates }, removedMeasureIds: [...removed] };
}

