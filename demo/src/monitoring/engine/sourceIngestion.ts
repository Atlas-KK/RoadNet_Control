// FR-EM-002 / FR-EM-003 / FR-EM-007：来源告警进入MonitoringEvent的纯映射。
import type {
  Alarm,
  ConfirmedEventFacts,
  FactConflict,
  MonitoringEvent,
  MonitoringLevel,
} from '../../domain/monitoring';
import { evaluateMonitoringLevel, type MonitoringLevelFacts } from './monitoringLevel';

const LEVEL_ORDER: Readonly<Record<MonitoringLevel, number>> = { L1: 1, L2: 2, L3: 3, L4: 4 };

function idToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

export function monitoringEventIdForCorrelation(correlationId: string, suffix?: string): string {
  return `ME-${idToken(correlationId)}${suffix ? `-${idToken(suffix)}` : ''}`;
}

function levelFacts(
  alarm: Alarm,
  observedFacts: Partial<ConfirmedEventFacts>,
  alarmCount: number,
): MonitoringLevelFacts {
  const notes = observedFacts.notes ?? '';
  const lanesAffected = observedFacts.lanesAffected;
  const lanesTotal = observedFacts.lanesTotal;
  return {
    eventType: observedFacts.eventType ?? alarm.eventType,
    facilityId: observedFacts.location?.facilityId ?? alarm.location.facilityId,
    casualties: observedFacts.casualties,
    hazardousMaterialLeak: observedFacts.hazardousMaterialLeak,
    fireConfirmed: alarm.eventType === 'fire' && /明火|火焰|高温/.test(notes),
    fullWidthClosure: lanesAffected !== undefined && lanesTotal !== undefined && lanesTotal > 0 && lanesAffected >= lanesTotal,
    lanesAffected,
    lanesTotal,
    // 连续两次同源/多源检测仅代表规则侧“重复检测成立”，不等同于人工核实完成。
    eventConfirmed: alarmCount >= 2,
    persistent: alarmCount >= 2,
    congestionDurationMin: observedFacts.congestionDurationMin,
    queueLengthKm: observedFacts.queueLengthKm,
    secondaryRiskExpanding: /避让|扩大|蔓延|持续高温/.test(notes),
    evidenceCount: alarm.evidenceIds.length,
    confidence: alarm.confidence,
  };
}

function strongestLevel(left: MonitoringLevel, right: MonitoringLevel): MonitoringLevel {
  return LEVEL_ORDER[right] > LEVEL_ORDER[left] ? right : left;
}

function mergeConflicts(
  existing: readonly FactConflict[],
  incoming: readonly FactConflict[],
): readonly FactConflict[] {
  const byId = new Map(existing.map((item) => [item.conflictId, item]));
  for (const item of incoming) byId.set(item.conflictId, item);
  return [...byId.values()];
}

function mergeSourceFacts(
  existing: Partial<ConfirmedEventFacts> | undefined,
  incoming: Partial<ConfirmedEventFacts>,
): Partial<ConfirmedEventFacts> {
  return {
    ...existing,
    ...incoming,
    location: incoming.location
      ? { ...(existing?.location ?? {}), ...incoming.location } as ConfirmedEventFacts['location']
      : existing?.location,
  };
}

export interface SourceEventProjectionInput {
  correlationId: string;
  alarm: Alarm;
  observedFacts: Partial<ConfirmedEventFacts>;
  occurredAt: string;
  existingEvent?: MonitoringEvent;
  conflicts?: readonly FactConflict[];
  eventIdSuffix?: string;
}

/** 只更新规则建议等级，永不覆盖人工确认等级或核实/接管状态。 */
export function projectSourceAlarmToMonitoringEvent(input: SourceEventProjectionInput): MonitoringEvent {
  const { alarm, observedFacts, occurredAt, existingEvent } = input;
  const alarmIds = existingEvent
    ? [...new Set([...existingEvent.alarmIds, alarm.alarmId])]
    : [alarm.alarmId];
  const assessment = evaluateMonitoringLevel(levelFacts(alarm, observedFacts, alarmIds.length));
  if (!existingEvent) {
    return {
      monitoringEventId: monitoringEventIdForCorrelation(input.correlationId, input.eventIdSuffix),
      version: 1,
      alarmIds,
      eventType: alarm.eventType,
      location: { ...alarm.location },
      suggestedLevel: assessment.level,
      suggestedLevelReasonCodes: [...assessment.reasonCodes],
      suggestedLevelInsufficiencyCodes: [...assessment.insufficiencyCodes],
      suggestedLevelAssessedAt: occurredAt,
      verificationStatus: 'pending',
      lifecycleStatus: 'monitoring',
      observationCount: 0,
      conflicts: [...(input.conflicts ?? [])],
      sourceFacts: mergeSourceFacts(undefined, observedFacts),
      detectedAt: alarm.detectedAt,
      updatedAt: occurredAt,
      simulation: alarm.simulation,
    };
  }
  const nextLevel = strongestLevel(existingEvent.suggestedLevel, assessment.level);
  return {
    ...existingEvent,
    version: existingEvent.version + 1,
    alarmIds,
    suggestedLevel: nextLevel,
    suggestedLevelReasonCodes: nextLevel === assessment.level
      ? [...assessment.reasonCodes]
      : existingEvent.suggestedLevelReasonCodes,
    suggestedLevelInsufficiencyCodes: nextLevel === assessment.level
      ? [...assessment.insufficiencyCodes]
      : existingEvent.suggestedLevelInsufficiencyCodes,
    suggestedLevelAssessedAt: occurredAt,
    conflicts: mergeConflicts(existingEvent.conflicts, input.conflicts ?? []),
    sourceFacts: mergeSourceFacts(existingEvent.sourceFacts, observedFacts),
    updatedAt: occurredAt,
    simulation: existingEvent.simulation || alarm.simulation,
  };
}

