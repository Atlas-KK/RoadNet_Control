// ============================================================
// 候选方案对比：在同一事件快照与预测窗口下比较效果、置信度与执行风险。
// A/B/C 为同一版本内的策略选项，不能替代预案版本状态机。
// ============================================================

import type { SimEvent } from '../domain/event';
import type { PlanCandidate, PlanConfidence, PlanEffectForecast, PlanMeasure } from '../domain/plan';
import { computeFlow } from './flowModel';
import { tplEarlyDiversion } from '../data/measureTemplates';

const HORIZON_MIN = 30;

function cloneMeasures(measures: PlanMeasure[]): PlanMeasure[] {
  return measures.map((measure) => ({ ...measure, params: { ...measure.params }, supports: [...measure.supports], facts: measure.facts ? [...measure.facts] : undefined }));
}

function has(measures: PlanMeasure[], ...ids: string[]) {
  return ids.some((id) => measures.some((measure) => measure.measureId === id));
}

function effectFor(event: SimEvent, measures: PlanMeasure[]): PlanEffectForecast {
  const flow = computeFlow({
    eventId: event.id,
    accidentKp: event.accidentKp,
    lanesTotal: event.lanesTotal,
    lanesClosed: event.lanesClosed,
    q: event.q,
    vf: event.vf,
  });
  const hasEarlyDiversion = has(measures, 'M_提前分流');
  const hasDiversion = has(measures, 'M_预置分流', 'M_提前分流');
  const hasSpeedControl = has(measures, 'M_限速', 'M_拥堵预警');
  const hasIncidentControl = has(measures, 'M_封车道', 'M_全封', 'M_调清障');
  const relief = (hasEarlyDiversion ? 0.42 : hasDiversion ? 0.35 : 0) + (hasSpeedControl ? 0.18 : 0) + (hasIncidentControl ? 0.12 : 0);
  const resourceEta = measures.filter((measure) => measure.resource).reduce((max, measure) => Math.max(max, measure.resource!.etaMin), 0);
  // 预测延迟含指挥确认/指令触达；资源调派只影响现场恢复，不把 ETA 虚构成即时效果。
  const actionDelayMin = hasEarlyDiversion ? 2.5 : hasDiversion ? 3 : hasSpeedControl ? 5 : 8;
  const queueBeforeActionKm = flow.congested ? (flow.w * actionDelayMin) / 60 : 0;
  const dissipationSpeed = flow.w * (1.15 + relief);
  const queueDissipateMin = flow.congested && dissipationSpeed > 0
    ? actionDelayMin + (queueBeforeActionKm / dissipationSpeed) * 60
    : 0;
  const capacityIncreasePct = Math.round(Math.min(45, relief * 100));
  return {
    horizonMin: HORIZON_MIN,
    maxQueueKm: Number(queueBeforeActionKm.toFixed(2)),
    queueDissipateMin: Number((queueDissipateMin + Math.min(resourceEta, 20) * 0.15).toFixed(1)),
    capacityVehPerHour: Math.round(flow.C_b * (1 + capacityIncreasePct / 100)),
    capacityIncreasePct,
    basisRefs: ['流模型：瓶颈通行能力、排队回溯速度', '规则：分流/限速响应系数', ...(resourceEta ? ['资源链：调派 ETA'] : [])],
  };
}

function confidenceFor(event: SimEvent, measures: PlanMeasure[], risks: string[]): PlanConfidence {
  const eventData = Math.min(95, 74 + (event.sourceKind ? 5 : 0) + Math.min(10, (event.mergedFrom?.length ?? 0) * 5) + (event.direction ? 3 : 0));
  const modelStability = event.congested ? 88 : 78;
  const resourceEtas = measures.filter((measure) => measure.resource).map((measure) => measure.resource!.etaMin);
  const maxEta = Math.max(0, ...resourceEtas);
  const executability = resourceEtas.length === 0 ? 86 : maxEta <= 20 ? 84 : maxEta <= 40 ? 68 : 52;
  const score = Math.max(35, Math.min(95, Math.round(eventData * 0.35 + modelStability * 0.35 + executability * 0.3 - risks.length * 2)));
  return {
    score,
    level: score >= 75 ? '高' : score >= 55 ? '中' : '低',
    eventData,
    modelStability,
    executability,
    note: `事件信息 ${eventData} / 模型稳定性 ${modelStability} / 执行可达性 ${executability}`,
  };
}

function candidate(id: string, label: string, summary: string, measures: PlanMeasure[], event: SimEvent, risks: string[], recommended = false): PlanCandidate {
  return {
    id,
    label,
    summary,
    recommended,
    measures: cloneMeasures(measures),
    effect: effectFor(event, measures),
    confidence: confidenceFor(event, measures, risks),
    risks,
  };
}

/** 为当前事实快照生成可行策略候选；不生成无法与主方案区分的伪备选。 */
export function buildPlanCandidates(event: SimEvent, measures: PlanMeasure[]): PlanCandidate[] {
  const recommendedRisks = [
    ...(has(measures, 'M_预置分流', 'M_提前分流') ? ['分流承接线需持续核验'] : []),
    ...measures.filter((measure) => (measure.resource?.etaMin ?? 0) > 30).map((measure) => `${measure.resource!.id} ETA ${measure.resource!.etaMin} min，需关注到位时效`),
  ];
  const candidates = [candidate('A', 'A 推荐：综合管控', '保留当前推演命中的全部可行措施，兼顾现场安全、清障与上游疏导。', measures, event, recommendedRisks, true)];

  const withoutDiversion = measures.filter((measure) => !['M_预置分流', 'M_提前分流'].includes(measure.measureId));
  if (withoutDiversion.length !== measures.length) {
    candidates.push(candidate('B', 'B 备选：现场稳控优先', '保留现场控制与清障，暂不启用分流，降低对承接线的依赖。', withoutDiversion, event, ['未采取分流，排队增长与二次事故风险较高']));
  }

  const diversionIndex = measures.findIndex((measure) => ['M_预置分流', 'M_提前分流'].includes(measure.measureId));
  if (diversionIndex >= 0 && measures[diversionIndex].measureId !== 'M_提前分流') {
    const early = tplEarlyDiversion({ accidentKp: event.accidentKp, lanesTotal: event.lanesTotal, lanesClosed: event.lanesClosed });
    const earlyMeasures = measures.map((measure, index) => index === diversionIndex
      ? { ...measure, measureId: 'M_提前分流', title: early.title, summary: early.summary, params: early.params }
      : measure);
    candidates.push(candidate('C', 'C 备选：提前分流', '将预置分流前移至上游互通，优先压低排队回溯风险。', earlyMeasures, event, ['绕行代价约 +12 min，需提前发布诱导信息']));
  }
  return candidates;
}
