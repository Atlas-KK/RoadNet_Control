// ============================================================
// 运行模式事件接入管道（开发规格 MVP · FR-A1/A3 + B1/B2/B3/B4）
// 对一份手工录入或模拟源事件：① 归并判定 → ② 命中则并入既有事件；
// ③ 否则五步推理 + 构建首版管控预案 + 条件求值 + 分流冲突校验（自动裁剪预置分流）。
// 纯函数：输入当前世界快照 + 报告，输出世界增量，由 store 应用并留痕。
// ============================================================

import { HUBS, tunnelAt, type RoadId } from '../data/network';
import { DEVICES } from '../data/devices';
import type { SimEvent } from '../domain/event';
import type { Plan, PlanMeasure } from '../domain/plan';
import type { CalcRecord, TraceStep } from './trace';
import { computeFlow } from './flowModel';
import { runReasoning } from './reasoner';
import { buildPlanV1 } from './planBuilder';
import { scoreMerge, type EventReport, type MergeDecision, type TravelDirection } from './merge';
import { evaluateConditions, type EnvironmentState } from './conditions';
import { checkDiversionConflict, type ActiveEventLite, type ConflictResult } from './conflictCheck';
import { traverseUpstreamHubs, type TraversalResult } from './traversal';
import { waitReleaseEta } from './resourceChain';
import { assessSeverity } from './severity';
import { tplEarlyDiversion } from '../data/measureTemplates';
import { buildPlanCandidates } from './planComparison';

/** 运行模式事件录入。 */
export interface RuntimeEventInput {
  sourceKind: string;
  road: RoadId;
  accidentKp: number;
  typeNodeId: string;
  label: string;
  lanesTotal: number;
  lanesClosed: number;
  q: number;
  vf?: number;
  casualties?: number;
  hazmat?: boolean;
  vehicles?: number;
  direction?: TravelDirection;
  /** 现场阶段文字，仅用于演示资源链读取占用方进度。 */
  stage?: string;
  /** 隧道现场风向与风速，供危化品通风措施参数计算。 */
  wind?: { dir: 'forward' | 'reverse'; speed: number };
  /** 演示场景中由货单/现场检测确认的泄漏物密度属性。 */
  spillLighterThanAir?: boolean;
  /** 仅供ControlBridge使用；人工应急直报不需要提供。 */
  monitoringHandoff?: {
    monitoringEventId: string;
    handoffId: string;
    idempotencyKey: string;
  };
}

export interface IngestContext {
  events: SimEvent[];
  resourceOccupancy: Record<string, string>;
  environment: EnvironmentState;
  simSec: number;
  sceneBaseSec: number;
  newEventId: string;
}

export type IngestResult =
  | {
      kind: 'merged';
      targetId: string;
      decision: MergeDecision;
      patch: Partial<SimEvent>;
    }
  | {
      kind: 'created';
      event: SimEvent;
      trace: TraceStep[];
      calcs: CalcRecord[];
      plan: Plan;
      decision?: MergeDecision;
      caseLinkGroup?: string;
      conditions: string[];
      conflict?: ConflictResult;
      selfReference?: TraversalResult;
    };

// 预置分流的承接路径几何（运行版样例常量）。
const DIVERSION_PATH = { connectorRoad: 'G56' as RoadId, mergeKp: 27, pathDistanceKm: 21, suggestedSpeedKmh: 70 };

function toReport(ev: SimEvent): EventReport {
  return {
    sourceLabel: ev.id,
    road: ev.road,
    kp: ev.accidentKp,
    typeNodeId: ev.typeNodeId,
    direction: ev.direction ?? 'unknown',
    reportedAtSimSec: ev.startSimSec,
    casualties: ev.casualties,
    vehicles: ev.vehicles,
    hazmat: ev.hazmat,
  };
}

function inputToReport(input: RuntimeEventInput, simSec: number): EventReport {
  return {
    sourceLabel: input.sourceKind,
    road: input.road,
    kp: input.accidentKp,
    typeNodeId: input.typeNodeId,
    direction: input.direction ?? 'unknown',
    reportedAtSimSec: simSec,
    casualties: input.casualties,
    vehicles: input.vehicles,
    hazmat: input.hazmat,
  };
}

/**
 * 接入一份报告并给出世界增量。
 * 归并：与全部活跃事件评分取最高——auto 并入既有事件；caseLink 新建但打并案组标记；
 * separate 独立新建。新建事件走五步推理 + 预案 + 条件 + 冲突校验。
 */
export function ingestReport(input: RuntimeEventInput, ctx: IngestContext): IngestResult {
  const report = inputToReport(input, ctx.simSec);
  const active = ctx.events.filter((e) => !e.finalized && !e.falsePositive);

  let best: { ev: SimEvent; decision: MergeDecision } | undefined;
  for (const ev of active) {
    const decision = scoreMerge(report, toReport(ev));
    if (!best || decision.total > best.decision.total) best = { ev, decision };
  }

  // 高置信自动归并：把新报告的补充字段并入既有事件，不新建预案。
  if (best && best.decision.tier === 'auto') {
    const patch: Partial<SimEvent> = {
      mergedFrom: [...(best.ev.mergedFrom ?? []), input.sourceKind],
      monitoringHandoffs: input.monitoringHandoff
        ? [...(best.ev.monitoringHandoffs ?? []), input.monitoringHandoff]
        : best.ev.monitoringHandoffs,
    };
    if (input.casualties != null && best.ev.casualties == null) patch.casualties = input.casualties;
    if (input.hazmat != null && best.ev.hazmat == null) patch.hazmat = input.hazmat;
    if (input.vehicles != null && best.ev.vehicles == null) patch.vehicles = input.vehicles;
    return { kind: 'merged', targetId: best.ev.id, decision: best.decision, patch };
  }

  // 新建事件（含中置信并案标记）。
  const caseLinkGroup = best && best.decision.tier === 'caseLink' ? `GRP-${best.ev.id}` : undefined;
  const flow = computeFlow({ ...input, eventId: ctx.newEventId });
  const severity = assessSeverity({
    lanesTotal: input.lanesTotal,
    lanesClosed: input.lanesClosed,
    casualties: input.casualties,
    hazmat: input.hazmat,
    inTunnel: tunnelAt(input.road, input.accidentKp) != null,
    congested: flow.congested,
  });
  const ev: SimEvent = {
    id: ctx.newEventId,
    road: input.road,
    accidentKp: input.accidentKp,
    lanesTotal: input.lanesTotal,
    lanesClosed: input.lanesClosed,
    q: input.q,
    vf: input.vf,
    typeNodeId: input.typeNodeId,
    label: input.label,
    startSimSec: ctx.simSec,
    congested: flow.congested,
    w: flow.w,
    sourceKind: input.sourceKind,
    casualties: input.casualties,
    hazmat: input.hazmat,
    severity: severity.level,
    vehicles: input.vehicles,
    caseLinkGroup,
    stage: input.stage,
    wind: input.wind,
    spillLighterThanAir: input.spillLighterThanAir,
    direction: input.direction,
    monitoringHandoffs: input.monitoringHandoff ? [input.monitoringHandoff] : undefined,
  };

  // 隧道段与团雾邻域从静态路网/运行期环境现算，供危化品措施（全幅封道/通风）参数模板使用；
  // 可执行落点取同路在线情报板，供封道点就近吸附（tplFullClosure）。
  const tunnelSpec = tunnelAt(input.road, input.accidentKp);
  const nearbyFogBand = ctx.environment.fogBands.find(
    (band) => band.road === input.road && band.toKp >= input.accidentKp - 10 && band.fromKp <= input.accidentKp + 2,
  );
  const executablePoints = DEVICES.filter((d) => d.kind === 'vms' && d.road === input.road && d.online).map((d) => ({ id: d.id, kp: d.kp }));
  const reason = runReasoning(
    {
      ...input,
      eventId: ev.id,
      eventLabel: input.label,
      tunnel: tunnelSpec ? { fromKp: tunnelSpec.fromKp, toKp: tunnelSpec.toKp } : undefined,
      fogBand: nearbyFogBand ? { fromKp: nearbyFogBand.fromKp, toKp: nearbyFogBand.toKp } : undefined,
      wind: input.wind,
      spillLighterThanAir: input.spillLighterThanAir,
      executablePoints,
    },
    `${Math.floor((ctx.sceneBaseSec + ctx.simSec) / 3600) % 24}:${String(Math.floor(((ctx.sceneBaseSec + ctx.simSec) % 3600) / 60)).padStart(2, '0')}`,
  );

  // 清障车若被占用，用资源链推理算 ETA。
  const occupiedBy = ctx.resourceOccupancy['W-01'];
  const occupiedEvent = occupiedBy ? ctx.events.find((e) => e.id === occupiedBy) : undefined;
  const wreckerEtaMin = occupiedEvent
    ? waitReleaseEta({ id: 'W-01', kind: 'wrecker', label: '', road: 'G65', homeKp: 1150, status: 'idle', driveSpeed: 75, station: '', contact: '', phone: '' }, ev.accidentKp, { ...occupiedEvent, road: occupiedEvent.road }, 45, ev.road).etaMin
    : undefined;

  let plan = buildPlanV1(ev, reason.measures, wreckerEtaMin);
  const trace = [...reason.steps];
  const calcs = [...reason.calcs];

  // 条件求值（团雾/隧道/危化品/夜间/设备离线）。
  const conditions = evaluateConditions({
    road: ev.road,
    accidentKp: ev.accidentKp,
    hazmat: ev.hazmat,
    simSecOfDay: ctx.sceneBaseSec + ctx.simSec,
    env: ctx.environment,
  }).active.map((c) => c.nodeId);

  // 分流冲突校验：预案若含预置分流，校验承接路径，重叠则自动裁剪改提前分流。
  let conflict: ConflictResult | undefined;
  const presetIdx = plan.measures.findIndex((m) => m.measureId === 'M_预置分流');
  if (presetIdx >= 0) {
    const others: ActiveEventLite[] = ctx.events
      .filter((e) => !e.finalized && !e.falsePositive)
      .map((e) => ({ id: e.id, road: e.road, accidentKp: e.accidentKp, w: e.w, congested: e.congested }));
    conflict = checkDiversionConflict(DIVERSION_PATH, others);
    if (conflict.status === 'conflict') {
      const early = tplEarlyDiversion({ accidentKp: ev.accidentKp, lanesTotal: ev.lanesTotal, lanesClosed: ev.lanesClosed });
      const swapped: PlanMeasure = {
        ...plan.measures[presetIdx],
        measureId: 'M_提前分流',
        title: '提前分流 K1140→S204',
        summary: `预置分流被裁剪（${conflict.reason}）→ 改提前分流`,
        params: early.params,
      };
      const measures = plan.measures.map((m, i) => (i === presetIdx ? swapped : m));
      plan = { ...plan, measures };
      trace.push({
        id: `T-${ev.id}-CONFLICT`,
        eventId: ev.id,
        phase: '裁剪匹配',
        title: `跨事件冲突校验：预置分流承接路径与 ${conflict.conflictEventId} 时间窗重叠 → 裁剪，改提前分流`,
        dataSources: ['快照·增量补取', '流模型', '规则'],
        mapRefs: ['diversion'],
        conclusion: conflict.reason,
        specRef: '附录A·案例一 / §5.4',
      });
    }
  }

  // 自引用检测（附录A·案例五）：预案若仍含预置分流（未被上一步冲突校验裁剪），
  // 检测其排队回溯是否会在到达上游枢纽后，掐断该枢纽下游交叉线——而那条交叉线
  // 正是本方案自己的分流承接线。命中则改为更上游的提前分流，避免执行中方案被
  // 事故自身的拥堵追上。重新 findIndex 是因为上一步冲突校验可能已把该措施换名。
  let selfReference: TraversalResult | undefined;
  const presetIdxAfterConflict = plan.measures.findIndex((m) => m.measureId === 'M_预置分流');
  if (presetIdxAfterConflict >= 0) {
    const traversal = traverseUpstreamHubs({
      event: { road: ev.road, accidentKp: ev.accidentKp, w: flow.w },
      hubsUpstream: HUBS,
      currentDiversionConnector: 'G56',
      maxDepth: 2,
    });
    if (traversal.selfReference) {
      selfReference = traversal;
      const early = tplEarlyDiversion({ accidentKp: ev.accidentKp, lanesTotal: ev.lanesTotal, lanesClosed: ev.lanesClosed });
      const swapped: PlanMeasure = {
        ...plan.measures[presetIdxAfterConflict],
        measureId: 'M_提前分流',
        title: '提前分流 K1140→S204',
        summary: `预置分流自引用冲突（${traversal.selfReference.reason}）→ 改提前分流`,
        params: early.params,
      };
      const measures = plan.measures.map((m, i) => (i === presetIdxAfterConflict ? swapped : m));
      plan = { ...plan, measures };
      trace.push({
        id: `T-${ev.id}-SELFREF`,
        eventId: ev.id,
        phase: '推演',
        title: `变长枢纽遍历：命中自引用——${traversal.selfReference.reason}`,
        dataSources: ['缓存拓扑', '流模型', '规则'],
        mapRefs: ['diversion'],
        conclusion: traversal.recommendation,
        specRef: '附录A·案例五',
      });
    }
  }

  // 冲突/自引用裁剪完成后，基于同一事实快照生成可比较的策略候选。
  // 候选 A/B/C 与 V1/V2 版本独立：前者用于指挥决策，后者用于事实修正留痕。
  plan = { ...plan, candidates: buildPlanCandidates(ev, plan.measures), selectedCandidateId: 'A' };

  return {
    kind: 'created',
    event: ev,
    trace,
    calcs,
    plan,
    decision: best?.decision,
    caseLinkGroup,
    conditions,
    conflict,
    selfReference,
  };
}
