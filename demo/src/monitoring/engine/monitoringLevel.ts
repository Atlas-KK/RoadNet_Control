// FR-EM-007：监测建议等级。与管控侧 engine/severity.ts 完全隔离。
import { HUBS, TUNNELS } from '../../data/network';
import type {
  MonitoringEvent,
  MonitoringEventType,
  MonitoringLevel,
} from '../../domain/monitoring';

export interface MonitoringKeyNodeConfig {
  id: string;
  roadCode: string;
  kilometer: number;
}

export interface MonitoringTrafficThresholds {
  laneCountL3: number;
  laneRatioL3: number;
  congestionDurationL3Min: number;
  queueLengthL3Km: number;
  keyNodeArrivalL3Min: number;
}

export interface MonitoringLevelConfig {
  keyNodes: readonly MonitoringKeyNodeConfig[];
  sensitiveFacilityIds: readonly string[];
  trafficThresholds?: MonitoringTrafficThresholds;
}

/** 数值来自PRD v0.3 §20.1；节点和设施只复用仓库现有配置。 */
export const MONITORING_LEVEL_CONFIG: MonitoringLevelConfig = Object.freeze({
  keyNodes: Object.freeze(HUBS.map((hub) => Object.freeze({
    id: hub.id,
    roadCode: hub.road,
    kilometer: hub.kp,
  }))),
  sensitiveFacilityIds: Object.freeze(TUNNELS.map((tunnel) => tunnel.id)),
  trafficThresholds: Object.freeze({
    laneCountL3: 2,
    laneRatioL3: 2 / 3,
    congestionDurationL3Min: 10,
    queueLengthL3Km: 3,
    keyNodeArrivalL3Min: 30,
  }),
});

export interface MonitoringLevelFacts {
  eventType: MonitoringEventType;
  facilityId?: string;
  casualties?: number;
  hazardousMaterialLeak?: boolean;
  highRiskHazardousMaterialSuspected?: boolean;
  fireConfirmed?: boolean;
  bridgeCollapse?: boolean;
  majorLandslideBlocking?: boolean;
  fullWidthClosure?: boolean;
  keyNodeFailureId?: string;
  lanesAffected?: number;
  lanesTotal?: number;
  eventConfirmed?: boolean;
  persistent?: boolean;
  congestionDurationMin?: number;
  queueLengthKm?: number;
  predictedKeyNodeId?: string;
  predictedKeyNodeArrivalMin?: number;
  secondaryRiskExpanding?: boolean;
  evidenceCount?: number;
  confidence?: number;
}

export type MonitoringLevelReasonCode =
  | 'CASUALTIES_KNOWN'
  | 'HAZMAT_LEAK_OR_HIGH_RISK_SUSPECTED'
  | 'TUNNEL_FIRE_CONFIRMED'
  | 'BRIDGE_COLLAPSE'
  | 'MAJOR_LANDSLIDE_BLOCKING'
  | 'FULL_WIDTH_CLOSURE'
  | 'CONFIGURED_KEY_NODE_FAILURE'
  | 'LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT'
  | 'LANE_RATIO_AT_LEAST_CONFIGURED_THRESHOLD'
  | 'DANGEROUS_DRIVING_BEHAVIOR_CONFIRMED'
  | 'SENSITIVE_FACILITY_EVENT_CONFIRMED'
  | 'CONGESTION_DURATION_AND_QUEUE_THRESHOLD_REACHED'
  | 'CONGESTION_APPROACHING_CONFIGURED_KEY_NODE'
  | 'SECONDARY_RISK_EXPANDING'
  | 'SINGLE_LANE_AFFECTED'
  | 'GENERAL_ACCIDENT_WITHOUT_CASUALTIES'
  | 'PERSISTENT_ABNORMAL_STOP_OR_DEBRIS'
  | 'CONGESTION_CONFIRMED_BELOW_L3'
  | 'INSUFFICIENT_INFORMATION_OR_NO_HIGHER_RULE';

export type MonitoringLevelInsufficiencyCode =
  | 'KEY_NODE_CONFIG_MISSING'
  | 'SENSITIVE_FACILITY_CONFIG_MISSING'
  | 'SENSITIVE_FACILITY_REFERENCE_UNKNOWN'
  | 'TRAFFIC_THRESHOLD_CONFIG_MISSING'
  | 'LANE_TOTAL_MISSING_FOR_RATIO'
  | 'KEY_NODE_REFERENCE_UNKNOWN';

export interface MonitoringLevelAssessment {
  level: MonitoringLevel;
  reasonCodes: readonly MonitoringLevelReasonCode[];
  insufficiencyCodes: readonly MonitoringLevelInsufficiencyCode[];
}

function result(
  level: MonitoringLevel,
  reasonCodes: MonitoringLevelReasonCode[],
  insufficiencyCodes: MonitoringLevelInsufficiencyCode[],
): MonitoringLevelAssessment {
  return { level, reasonCodes: Object.freeze(reasonCodes), insufficiencyCodes: Object.freeze([...new Set(insufficiencyCodes)]) };
}

function isSensitiveFacility(facts: MonitoringLevelFacts, config: MonitoringLevelConfig, insufficiencies: MonitoringLevelInsufficiencyCode[]): boolean {
  if (!facts.facilityId) return false;
  if (!config.sensitiveFacilityIds.length) {
    insufficiencies.push('SENSITIVE_FACILITY_CONFIG_MISSING');
    return false;
  }
  const matched = config.sensitiveFacilityIds.includes(facts.facilityId);
  if (!matched) insufficiencies.push('SENSITIVE_FACILITY_REFERENCE_UNKNOWN');
  return matched;
}

function isConfiguredKeyNode(id: string | undefined, config: MonitoringLevelConfig, insufficiencies: MonitoringLevelInsufficiencyCode[]): boolean {
  if (!id) return false;
  if (!config.keyNodes.length) {
    insufficiencies.push('KEY_NODE_CONFIG_MISSING');
    return false;
  }
  const matched = config.keyNodes.some((node) => node.id === id);
  if (!matched) insufficiencies.push('KEY_NODE_REFERENCE_UNKNOWN');
  return matched;
}

/** L4→L3→L2→L1短路；高等级命中后绝不再由低等级规则覆盖。 */
export function evaluateMonitoringLevel(
  facts: MonitoringLevelFacts,
  config: MonitoringLevelConfig = MONITORING_LEVEL_CONFIG,
): MonitoringLevelAssessment {
  const insufficiencies: MonitoringLevelInsufficiencyCode[] = [];
  const l4: MonitoringLevelReasonCode[] = [];
  if ((facts.casualties ?? 0) > 0) l4.push('CASUALTIES_KNOWN');
  if (facts.hazardousMaterialLeak || facts.highRiskHazardousMaterialSuspected) l4.push('HAZMAT_LEAK_OR_HIGH_RISK_SUSPECTED');
  if (facts.eventType === 'fire' && facts.fireConfirmed && isSensitiveFacility(facts, config, insufficiencies)) l4.push('TUNNEL_FIRE_CONFIRMED');
  if (facts.bridgeCollapse) l4.push('BRIDGE_COLLAPSE');
  if (facts.majorLandslideBlocking) l4.push('MAJOR_LANDSLIDE_BLOCKING');
  if (facts.fullWidthClosure) l4.push('FULL_WIDTH_CLOSURE');
  if (facts.keyNodeFailureId && isConfiguredKeyNode(facts.keyNodeFailureId, config, insufficiencies)) l4.push('CONFIGURED_KEY_NODE_FAILURE');
  if (l4.length) return result('L4', l4, insufficiencies);

  const l3: MonitoringLevelReasonCode[] = [];
  const thresholds = config.trafficThresholds;
  if (!thresholds) insufficiencies.push('TRAFFIC_THRESHOLD_CONFIG_MISSING');
  if (thresholds && (facts.lanesAffected ?? 0) >= thresholds.laneCountL3) l3.push('LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT');
  if (facts.lanesAffected !== undefined && facts.lanesTotal === undefined) insufficiencies.push('LANE_TOTAL_MISSING_FOR_RATIO');
  if (thresholds && facts.lanesAffected !== undefined && facts.lanesTotal !== undefined && facts.lanesTotal > 0
    && facts.lanesAffected / facts.lanesTotal >= thresholds.laneRatioL3) l3.push('LANE_RATIO_AT_LEAST_CONFIGURED_THRESHOLD');
  if (facts.eventConfirmed && ['pedestrian_intrusion', 'wrong_way_driving', 'reversing'].includes(facts.eventType)) {
    l3.push('DANGEROUS_DRIVING_BEHAVIOR_CONFIRMED');
  }
  if (facts.eventConfirmed && ['traffic_accident', 'fire', 'abnormal_stop'].includes(facts.eventType)
    && isSensitiveFacility(facts, config, insufficiencies)) l3.push('SENSITIVE_FACILITY_EVENT_CONFIRMED');
  if (thresholds && facts.eventType === 'traffic_congestion'
    && (facts.congestionDurationMin ?? -1) >= thresholds.congestionDurationL3Min
    && (facts.queueLengthKm ?? -1) >= thresholds.queueLengthL3Km) {
    l3.push('CONGESTION_DURATION_AND_QUEUE_THRESHOLD_REACHED');
  }
  if (facts.predictedKeyNodeId && isConfiguredKeyNode(facts.predictedKeyNodeId, config, insufficiencies)
    && thresholds && (facts.predictedKeyNodeArrivalMin ?? Number.POSITIVE_INFINITY) <= thresholds.keyNodeArrivalL3Min) {
    l3.push('CONGESTION_APPROACHING_CONFIGURED_KEY_NODE');
  }
  if (facts.secondaryRiskExpanding) l3.push('SECONDARY_RISK_EXPANDING');
  if (l3.length) return result('L3', l3, insufficiencies);

  const l2: MonitoringLevelReasonCode[] = [];
  if (facts.lanesAffected === 1) l2.push('SINGLE_LANE_AFFECTED');
  if (facts.eventType === 'traffic_accident' && facts.eventConfirmed && (facts.casualties ?? 0) === 0) {
    l2.push('GENERAL_ACCIDENT_WITHOUT_CASUALTIES');
  }
  if (facts.persistent && (facts.eventType === 'abnormal_stop' || facts.eventType === 'road_debris')) {
    l2.push('PERSISTENT_ABNORMAL_STOP_OR_DEBRIS');
  }
  if (facts.eventType === 'traffic_congestion' && facts.eventConfirmed) l2.push('CONGESTION_CONFIRMED_BELOW_L3');
  if (l2.length) return result('L2', l2, insufficiencies);

  return result('L1', ['INSUFFICIENT_INFORMATION_OR_NO_HIGHER_RULE'], insufficiencies);
}

/** 只更新AI/规则建议等级，人工confirmedLevel保持原值。 */
export function applySuggestedLevelAssessment(
  event: MonitoringEvent,
  assessment: MonitoringLevelAssessment,
  assessedAt: string,
): MonitoringEvent {
  if (!Number.isFinite(Date.parse(assessedAt))) throw new Error('assessedAt必须是有效时间');
  return {
    ...event,
    version: event.version + 1,
    suggestedLevel: assessment.level,
    suggestedLevelReasonCodes: [...assessment.reasonCodes],
    suggestedLevelInsufficiencyCodes: [...assessment.insufficiencyCodes],
    suggestedLevelAssessedAt: assessedAt,
    updatedAt: assessedAt,
  };
}
