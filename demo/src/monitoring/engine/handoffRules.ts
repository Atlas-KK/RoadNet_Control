import type { HandoffRequest } from '../../domain/handoff';
import type { ConfirmedEventFacts, MonitoringAuditEntry, MonitoringEvent } from '../../domain/monitoring';
import { MONITORING_LEVEL_CONFIG } from './monitoringLevel';
import type { SimulatedUser } from '../permissions';

export interface HandoffDecision {
  eligible: boolean;
  mode?: 'user' | 'rule';
  level?: 'L3' | 'L4';
  reasonCodes: readonly string[];
  reasons: readonly string[];
  blockingReasons: readonly string[];
}

const REASON_LABELS: Readonly<Record<string, string>> = {
  CASUALTIES_KNOWN: '已确认存在人员伤亡',
  HAZMAT_LEAK_OR_HIGH_RISK_SUSPECTED: '已确认危化品泄漏或高风险疑似',
  TUNNEL_FIRE_CONFIRMED: '已确认敏感隧道内发生火灾',
  BRIDGE_COLLAPSE: '已确认桥梁垮塌',
  MAJOR_LANDSLIDE_BLOCKING: '已确认重大滑坡阻断道路',
  FULL_WIDTH_CLOSURE: '已确认道路全幅封闭',
  CONFIGURED_KEY_NODE_FAILURE: '已确认配置内关键节点失效',
  LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT: '受影响车道数达到配置阈值',
  LANE_RATIO_AT_LEAST_CONFIGURED_THRESHOLD: '受影响车道比例达到配置阈值',
  DANGEROUS_DRIVING_BEHAVIOR_CONFIRMED: '已确认行人闯入、逆行或倒车等危险行为',
  SENSITIVE_FACILITY_EVENT_CONFIRMED: '已确认敏感设施内事故、火情或异常停车',
  CONGESTION_DURATION_AND_QUEUE_THRESHOLD_REACHED: '拥堵持续时间和队列长度同时达到阈值',
  CONGESTION_APPROACHING_CONFIGURED_KEY_NODE: '拥堵预计在阈值时间内到达配置关键节点',
  SECONDARY_RISK_EXPANDING: '已确认次生风险扩大',
};

function latestCorrections(eventId: string, auditEntries: readonly MonitoringAuditEntry[]): Partial<ConfirmedEventFacts> {
  const entry = [...auditEntries].reverse().find((item) =>
    item.entityId === eventId && item.kind === 'verification_confirmed' && item.payload?.correction,
  );
  const correction = entry?.payload?.correction;
  if (!correction || typeof correction !== 'object') return {};
  const after = (correction as { after?: unknown }).after;
  return after && typeof after === 'object' ? after as Partial<ConfirmedEventFacts> : {};
}

export function deriveConfirmedEventFacts(event: MonitoringEvent, auditEntries: readonly MonitoringAuditEntry[]): ConfirmedEventFacts {
  const corrections = latestCorrections(event.monitoringEventId, auditEntries);
  return {
    ...corrections,
    eventType: corrections.eventType ?? event.eventType,
    location: { ...event.location, ...(corrections.location ?? {}) },
  };
}

export function evaluateHandoffDecision(event: MonitoringEvent): HandoffDecision {
  if (event.verificationStatus !== 'confirmed' || !event.confirmedLevel) {
    return { eligible: false, reasonCodes: [], reasons: [], blockingReasons: ['事件尚未完成人工核实，AI建议等级不能直接触发接管'] };
  }
  if (event.lifecycleStatus === 'taken_over') {
    return { eligible: false, reasonCodes: [], reasons: [], blockingReasons: ['事件已经接管，无需重复发起'] };
  }
  if (event.confirmedLevel === 'L1' || event.confirmedLevel === 'L2') {
    return { eligible: false, reasonCodes: [], reasons: [], blockingReasons: [`${event.confirmedLevel}事件默认不进入智能管控`] };
  }
  const reasonCodes = [...(event.suggestedLevelReasonCodes ?? [])].filter((code) => code in REASON_LABELS);
  const reasons = reasonCodes.map((code) => REASON_LABELS[code]);
  if (event.confirmedLevel === 'L4') {
    return {
      eligible: true, mode: 'rule', level: 'L4',
      reasonCodes: reasonCodes.length ? reasonCodes : ['HUMAN_CONFIRMED_L4'],
      reasons: reasons.length ? reasons : ['监控员已人工确认事件为L4严重事件'], blockingReasons: [],
    };
  }
  if (!reasonCodes.length) {
    return { eligible: false, level: 'L3', reasonCodes: [], reasons: [], blockingReasons: ['已确认L3，但当前快照没有可追溯的复合条件命中依据'] };
  }
  return { eligible: true, mode: 'user', level: 'L3', reasonCodes, reasons, blockingReasons: [] };
}

export function buildHandoffRequest(input: {
  event: MonitoringEvent;
  facts: ConfirmedEventFacts;
  decision: HandoffDecision;
  actor: SimulatedUser;
  requestedAt: string;
  existingIdempotencyKey?: string;
  existingHandoffId?: string;
}): HandoffRequest {
  const { event, facts, decision, actor, requestedAt } = input;
  if (!decision.eligible || !decision.mode || !decision.level) throw new Error('当前事件不满足接管条件');
  const versionSeed = `${event.monitoringEventId}-V${event.version}`;
  const handoffId = input.existingHandoffId ?? `HO-${versionSeed}`;
  const facilityId = facts.location.facilityId;
  const nearestKeyNode = MONITORING_LEVEL_CONFIG.keyNodes.find((node) =>
    node.roadCode === facts.location.roadCode && facts.location.kilometer !== undefined
      && Math.abs(node.kilometer - facts.location.kilometer) < 0.01,
  );
  return {
    messageId: `MSG-${handoffId}`, correlationId: handoffId, handoffId,
    idempotencyKey: input.existingIdempotencyKey ?? `monitoring-handoff:${versionSeed}`,
    monitoringEventId: event.monitoringEventId, monitoringEventVersion: event.version, requestedAt,
    requestedBy: { mode: decision.mode, userId: decision.mode === 'user' ? actor.userId : undefined, ruleIds: [...decision.reasonCodes] },
    confirmedFacts: facts,
    context: {
      roadCode: facts.location.roadCode, direction: facts.location.direction,
      facilityId, facilityType: facts.location.facilityType,
      configuredSensitiveFacility: Boolean(facilityId && MONITORING_LEVEL_CONFIG.sensitiveFacilityIds.includes(facilityId)),
      configuredCriticalNode: Boolean(nearestKeyNode),
      trafficSnapshot: facts.queueLengthKm === undefined ? undefined : { queueLengthKm: facts.queueLengthKm },
    },
    evidence: [], conflicts: [...event.conflicts],
    rationale: { level: decision.level, reasons: [...decision.reasons], reviewerId: actor.userId },
    simulation: event.simulation,
  };
}
