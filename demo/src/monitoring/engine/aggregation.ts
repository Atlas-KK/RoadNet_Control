// FR-EM-003：事件监测专用七维聚合、冲突、拆分和综合可信度。
// 与现有智能管控src/engine/merge.ts完全隔离。
import type { Alarm, ConfirmedEventFacts, EventLocation, FactConflict } from '../../domain/monitoring';

export const MONITORING_AGGREGATION_CONFIG = Object.freeze({
  weights: Object.freeze({
    spaceFacility: 0.25,
    time: 0.20,
    typeCompatibility: 0.20,
    direction: 0.10,
    deviceCoverage: 0.10,
    laneTarget: 0.10,
    sourceIndependence: 0.05,
  }),
  autoMergeThreshold: 0.75,
  manualReviewThreshold: 0.45,
  nearDistanceKm: 1,
  mediumDistanceKm: 3,
  divergenceDistanceKm: 1,
  minEvolutionObservations: 2,
});

export type AggregationDecisionTier = 'auto_merge' | 'manual_review' | 'separate';
export type TypeRelation = 'same' | 'compatible' | 'incompatible';
export type DeviceCoverageRelation = 'same' | 'adjacent' | 'unrelated' | 'unknown';
export type TargetRelation = 'same_target' | 'different_target' | 'unknown';
export type SourceRelation = 'independent' | 'same_source_distinct_detection' | 'same_delivery';

export interface AggregationSignal {
  alarm: Alarm;
  facts?: Partial<ConfirmedEventFacts>;
  targetTrackId?: string;
}

export interface AggregationPairContext {
  typeRelation?: TypeRelation;
  deviceCoverageRelation?: DeviceCoverageRelation;
  targetRelation?: TargetRelation;
  sourceRelation?: SourceRelation;
}

export interface AggregationScoreRow {
  dimension: keyof typeof MONITORING_AGGREGATION_CONFIG.weights;
  label: string;
  weight: number;
  score: number;
  weightedScore: number;
  reason: string;
}

export interface AggregationClassification {
  tier: AggregationDecisionTier;
  reason: string;
}

export interface AggregationCandidate {
  anchorAlarmId: string;
  candidateAlarmId: string;
  totalScore: number;
  tier: AggregationDecisionTier;
  decisionReason: string;
  scoreRows: readonly AggregationScoreRow[];
  automaticMergeBlocks: readonly string[];
  factConflicts: readonly FactConflict[];
}

function weightedRow(
  dimension: AggregationScoreRow['dimension'],
  label: string,
  score: number,
  reason: string,
): AggregationScoreRow {
  const weight = MONITORING_AGGREGATION_CONFIG.weights[dimension];
  return { dimension, label, weight, score, weightedScore: score * weight, reason };
}

function haversineKm(a: EventLocation, b: EventLocation): number | undefined {
  if (a.longitude === undefined || a.latitude === undefined || b.longitude === undefined || b.latitude === undefined) {
    return undefined;
  }
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const leftLatitude = radians(a.latitude);
  const rightLatitude = radians(b.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function locationDistanceKm(a: EventLocation, b: EventLocation): number | undefined {
  if (a.roadCode === b.roadCode && a.kilometer !== undefined && b.kilometer !== undefined) {
    return Math.abs(a.kilometer - b.kilometer);
  }
  return haversineKm(a, b);
}

function scoreSpaceFacility(a: Alarm, b: Alarm, blocks: string[]): AggregationScoreRow {
  const aFacility = a.location.facilityId;
  const bFacility = b.location.facilityId;
  if (aFacility && bFacility) {
    if (aFacility === bFacility) return weightedRow('spaceFacility', '空间/设施', 1, `同设施 ${aFacility}`);
    blocks.push(`设施ID不同：${aFacility}/${bFacility}`);
    return weightedRow('spaceFacility', '空间/设施', 0, `设施ID不同 ${aFacility}/${bFacility}`);
  }
  if (a.location.roadCode !== b.location.roadCode) {
    return weightedRow('spaceFacility', '空间/设施', 0, `道路不同 ${a.location.roadCode}/${b.location.roadCode}`);
  }
  const distance = locationDistanceKm(a.location, b.location);
  if (distance === undefined) return weightedRow('spaceFacility', '空间/设施', 0, '同路但缺少可比较空间锚点');
  if (distance <= MONITORING_AGGREGATION_CONFIG.nearDistanceKm) {
    return weightedRow('spaceFacility', '空间/设施', 1, `同路距离${distance.toFixed(2)}km`);
  }
  if (distance <= MONITORING_AGGREGATION_CONFIG.mediumDistanceKm) {
    return weightedRow('spaceFacility', '空间/设施', 0.6, `同路距离${distance.toFixed(2)}km，保留初次候选`);
  }
  return weightedRow('spaceFacility', '空间/设施', 0, `同路距离${distance.toFixed(2)}km`);
}

function scoreTime(a: Alarm, b: Alarm): AggregationScoreRow {
  const differenceMinutes = Math.abs(Date.parse(a.detectedAt) - Date.parse(b.detectedAt)) / 60_000;
  if (differenceMinutes <= 1) return weightedRow('time', '时间', 1, `时差${differenceMinutes.toFixed(1)}分钟`);
  if (differenceMinutes <= 5) return weightedRow('time', '时间', 0.7, `时差${differenceMinutes.toFixed(1)}分钟`);
  if (differenceMinutes <= 15) return weightedRow('time', '时间', 0.4, `时差${differenceMinutes.toFixed(1)}分钟`);
  return weightedRow('time', '时间', 0, `时差${differenceMinutes.toFixed(1)}分钟`);
}

function scoreType(a: Alarm, b: Alarm, context: AggregationPairContext, blocks: string[]): AggregationScoreRow {
  const relation = a.eventType === b.eventType ? 'same' : context.typeRelation ?? 'incompatible';
  if (relation === 'same') return weightedRow('typeCompatibility', '类型相容', 1, `同类 ${a.eventType}`);
  if (relation === 'compatible') {
    return weightedRow('typeCompatibility', '类型相容', 0.7, `${a.eventType}/${b.eventType}为已配置父子或相容类型`);
  }
  blocks.push(`事件类型不相容：${a.eventType}/${b.eventType}`);
  return weightedRow('typeCompatibility', '类型相容', 0, `${a.eventType}/${b.eventType}不相容`);
}

function scoreDirection(a: Alarm, b: Alarm, blocks: string[]): AggregationScoreRow {
  const left = a.location.direction;
  const right = b.location.direction;
  if (left === 'unknown' || right === 'unknown') return weightedRow('direction', '方向', 0.8, '至少一侧方向未知');
  if (left === right) return weightedRow('direction', '方向', 1, `同向 ${left}`);
  blocks.push(`行车方向相反：${left}/${right}`);
  return weightedRow('direction', '方向', 0, `方向相反 ${left}/${right}`);
}

function scoreDevice(a: Alarm, b: Alarm, context: AggregationPairContext): AggregationScoreRow {
  const relation = a.location.deviceId && a.location.deviceId === b.location.deviceId
    ? 'same' : context.deviceCoverageRelation ?? 'unknown';
  if (relation === 'same') return weightedRow('deviceCoverage', '设备覆盖', 1, '同一设备覆盖');
  if (relation === 'adjacent') return weightedRow('deviceCoverage', '设备覆盖', 0.7, '已配置相邻覆盖区');
  if (relation === 'unrelated') return weightedRow('deviceCoverage', '设备覆盖', 0, '设备覆盖区无关');
  return weightedRow('deviceCoverage', '设备覆盖', 0, '缺少设备覆盖关系');
}

function sharedLane(a: Alarm, b: Alarm): boolean | undefined {
  const left = a.location.laneIds;
  const right = b.location.laneIds;
  if (!left?.length || !right?.length) return undefined;
  return left.some((lane) => right.includes(lane));
}

function scoreLaneTarget(a: AggregationSignal, b: AggregationSignal, context: AggregationPairContext): AggregationScoreRow {
  const sameExplicitTarget = a.targetTrackId && b.targetTrackId && a.targetTrackId === b.targetTrackId;
  const relation = sameExplicitTarget ? 'same_target' : context.targetRelation ?? 'unknown';
  if (relation === 'same_target') return weightedRow('laneTarget', '车道/目标', 1, '同一目标轨迹');
  if (relation === 'different_target') return weightedRow('laneTarget', '车道/目标', 0, '目标轨迹不同');
  const lanesMatch = sharedLane(a.alarm, b.alarm);
  if (lanesMatch === true) return weightedRow('laneTarget', '车道/目标', 1, '存在相同车道');
  if (lanesMatch === false) return weightedRow('laneTarget', '车道/目标', 0, '已知车道不相交');
  return weightedRow('laneTarget', '车道/目标', 0, '缺少车道或目标关系');
}

function scoreSource(a: Alarm, b: Alarm, context: AggregationPairContext): AggregationScoreRow {
  const relation = context.sourceRelation
    ?? (a.sourceSystem !== b.sourceSystem
      ? 'independent'
      : a.sourceAlarmId !== b.sourceAlarmId ? 'same_source_distinct_detection' : 'same_delivery');
  if (relation === 'independent') return weightedRow('sourceIndependence', '来源独立性', 1, '独立来源佐证');
  if (relation === 'same_source_distinct_detection') {
    return weightedRow('sourceIndependence', '来源独立性', 0.5, '同源不同检测');
  }
  return weightedRow('sourceIndependence', '来源独立性', 0, '同一来源告警应先执行精确去重');
}

const CONFLICT_FIELDS: readonly [keyof ConfirmedEventFacts, string][] = [
  ['casualties', '伤亡数'],
  ['vehicleCount', '车辆数'],
  ['hazardousMaterials', '危化品标志'],
  ['hazardousMaterialLeak', '危化品泄漏标志'],
];

export function detectAggregationFactConflicts(a: AggregationSignal, b: AggregationSignal): readonly FactConflict[] {
  const conflicts: FactConflict[] = [];
  for (const [field, label] of CONFLICT_FIELDS) {
    const left = a.facts?.[field];
    const right = b.facts?.[field];
    if (left !== undefined && right !== undefined && left !== right) {
      const alarmIds = [a.alarm.alarmId, b.alarm.alarmId].sort();
      conflicts.push({
        conflictId: `CONFLICT-${String(field)}-${alarmIds.join('-')}`,
        field: String(field),
        alarmIds,
        values: [left, right],
        status: 'pending',
        resolution: `${label}来源值不一致，禁止静默覆盖`,
      });
    }
  }
  return conflicts;
}

export function classifyAggregationScore(
  totalScore: number,
  automaticMergeBlocks: readonly string[] = [],
  factConflicts: readonly FactConflict[] = [],
): AggregationClassification {
  if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > 1) throw new Error('聚合总分必须在0到1之间');
  if (automaticMergeBlocks.length > 0) {
    return { tier: 'manual_review', reason: `存在自动聚合阻断：${automaticMergeBlocks.join('；')}` };
  }
  if (factConflicts.length > 0) {
    return { tier: 'manual_review', reason: '关键事实冲突，进入人工比对' };
  }
  if (totalScore >= MONITORING_AGGREGATION_CONFIG.autoMergeThreshold) {
    return { tier: 'auto_merge', reason: '聚合得分达到自动聚合阈值' };
  }
  if (totalScore >= MONITORING_AGGREGATION_CONFIG.manualReviewThreshold) {
    return { tier: 'manual_review', reason: '聚合得分进入人工比对区间' };
  }
  return { tier: 'separate', reason: '聚合得分低于人工比对阈值，独立建事件' };
}

export function scoreAggregationCandidate(
  anchor: AggregationSignal,
  candidate: AggregationSignal,
  context: AggregationPairContext = {},
): AggregationCandidate {
  const automaticMergeBlocks: string[] = [];
  const scoreRows = [
    scoreSpaceFacility(anchor.alarm, candidate.alarm, automaticMergeBlocks),
    scoreTime(anchor.alarm, candidate.alarm),
    scoreType(anchor.alarm, candidate.alarm, context, automaticMergeBlocks),
    scoreDirection(anchor.alarm, candidate.alarm, automaticMergeBlocks),
    scoreDevice(anchor.alarm, candidate.alarm, context),
    scoreLaneTarget(anchor, candidate, context),
    scoreSource(anchor.alarm, candidate.alarm, context),
  ];
  const totalScore = scoreRows.reduce((total, row) => total + row.weightedScore, 0);
  const factConflicts = detectAggregationFactConflicts(anchor, candidate);
  const classification = classifyAggregationScore(totalScore, automaticMergeBlocks, factConflicts);
  return {
    anchorAlarmId: anchor.alarm.alarmId,
    candidateAlarmId: candidate.alarm.alarmId,
    totalScore,
    tier: classification.tier,
    decisionReason: classification.reason,
    scoreRows,
    automaticMergeBlocks,
    factConflicts,
  };
}

export interface EvolutionTrack {
  trackId: string;
  alarmIds: readonly string[];
  sourceSystems: readonly string[];
  locations: readonly EventLocation[];
  targetTrackIds?: readonly string[];
}

export interface SplitHistoryRelation {
  originalEventId: string;
  leftTrackId: string;
  rightTrackId: string;
  leftAlarmIds: readonly string[];
  rightAlarmIds: readonly string[];
  evaluatedAt: string;
  reasons: readonly string[];
}

export interface IndependentEvolutionDecision {
  shouldSplit: boolean;
  reasons: readonly string[];
  relation?: SplitHistoryRelation;
}

function minimumTrackDistance(left: EvolutionTrack, right: EvolutionTrack): number | undefined {
  const distances = left.locations.flatMap((a) => right.locations
    .map((b) => locationDistanceKm(a, b))
    .filter((distance): distance is number => distance !== undefined));
  return distances.length > 0 ? Math.min(...distances) : undefined;
}

export function evaluateIndependentEvolutionSplit(
  originalEventId: string,
  left: EvolutionTrack,
  right: EvolutionTrack,
  evaluatedAt: string,
): IndependentEvolutionDecision {
  if (!Number.isFinite(Date.parse(evaluatedAt))) throw new Error('evaluatedAt必须是有效时间');
  const reasons: string[] = [];
  const sustained = left.alarmIds.length >= MONITORING_AGGREGATION_CONFIG.minEvolutionObservations
    && right.alarmIds.length >= MONITORING_AGGREGATION_CONFIG.minEvolutionObservations;
  if (!sustained) reasons.push('两条演化轨迹尚未各自形成持续观测');

  const leftSources = new Set(left.sourceSystems);
  const rightSources = new Set(right.sourceSystems);
  const independentSources = leftSources.size > 0 && rightSources.size > 0
    && [...leftSources].every((source) => !rightSources.has(source));
  if (!independentSources) reasons.push('两条轨迹来源不独立');

  const distance = minimumTrackDistance(left, right);
  const positionDiverged = distance !== undefined && distance > MONITORING_AGGREGATION_CONFIG.divergenceDistanceKm;
  const leftTargets = new Set(left.targetTrackIds ?? []);
  const rightTargets = new Set(right.targetTrackIds ?? []);
  const targetDiverged = leftTargets.size > 0 && rightTargets.size > 0
    && [...leftTargets].every((target) => !rightTargets.has(target));
  if (!positionDiverged && !targetDiverged) reasons.push('位置或目标轨迹尚未独立演化');

  const shouldSplit = sustained && independentSources && (positionDiverged || targetDiverged);
  if (!shouldSplit) return { shouldSplit, reasons };
  const splitReasons = [
    positionDiverged ? `两轨迹最小距离${distance!.toFixed(2)}km，超过1km` : undefined,
    targetDiverged ? '目标轨迹持续分离' : undefined,
    '两轨迹均有持续观测且来源独立',
  ].filter((reason): reason is string => Boolean(reason));
  return {
    shouldSplit: true,
    reasons: splitReasons,
    relation: {
      originalEventId,
      leftTrackId: left.trackId,
      rightTrackId: right.trackId,
      leftAlarmIds: [...left.alarmIds],
      rightAlarmIds: [...right.alarmIds],
      evaluatedAt,
      reasons: splitReasons,
    },
  };
}

export interface EventConfidenceResult {
  confidence?: number;
  sourceScores: readonly { sourceSystem: string; confidence: number; alarmCount: number }[];
  alarmsWithConfidence: number;
  alarmsWithoutConfidence: number;
  method: 'equal_weight_source_average';
}

/** 每个来源先内部求均值，再对来源等权求均值，避免同源重复告警或单个最高值支配事件可信度。 */
export function computeEventConfidence(alarms: readonly Alarm[]): EventConfidenceResult {
  const grouped = new Map<string, number[]>();
  let alarmsWithoutConfidence = 0;
  for (const alarm of alarms) {
    if (alarm.confidence === undefined) {
      alarmsWithoutConfidence += 1;
      continue;
    }
    const values = grouped.get(alarm.sourceSystem) ?? [];
    values.push(alarm.confidence);
    grouped.set(alarm.sourceSystem, values);
  }
  const sourceScores = [...grouped.entries()].map(([sourceSystem, values]) => ({
    sourceSystem,
    confidence: values.reduce((sum, value) => sum + value, 0) / values.length,
    alarmCount: values.length,
  })).sort((a, b) => a.sourceSystem.localeCompare(b.sourceSystem));
  const confidence = sourceScores.length > 0
    ? sourceScores.reduce((sum, source) => sum + source.confidence, 0) / sourceScores.length
    : undefined;
  return {
    confidence,
    sourceScores,
    alarmsWithConfidence: alarms.length - alarmsWithoutConfidence,
    alarmsWithoutConfidence,
    method: 'equal_weight_source_average',
  };
}
