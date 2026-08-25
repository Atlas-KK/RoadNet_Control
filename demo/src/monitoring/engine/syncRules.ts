import type { ControlEventUpdate } from '../../domain/handoff';
import type { MonitoringEvent } from '../../domain/monitoring';

export type ControlUpdateDecisionCode =
  | 'APPLIED'
  | 'STALE_ENTITY_VERSION'
  | 'RELATION_MISMATCH'
  | 'CLOSURE_DECISION_REQUIRED'
  | 'INVALID_CLOSURE_DECISION';

export interface ControlUpdateDecision {
  code: ControlUpdateDecisionCode;
  event: MonitoringEvent;
  lifecycleChanged: boolean;
  reason: string;
}

function validClosureDecision(update: ControlEventUpdate): boolean {
  const decision = update.closureDecision;
  return Boolean(
    decision
    && decision.decisionId.trim()
    && decision.decidedBy.trim()
    && decision.reason.trim()
    && Number.isFinite(Date.parse(decision.decidedAt)),
  );
}

function requiresClosureDecision(status: ControlEventUpdate['eventLifecycleStatus']): boolean {
  return status === 'resolved' || status === 'closed' || status === 'false_positive_confirmed';
}

/** 只由显式事件级状态决定生命周期；planState始终只是次级摘要。 */
export function applyControlEventUpdateRule(event: MonitoringEvent, update: ControlEventUpdate): ControlUpdateDecision {
  if (event.controlEventId !== update.controlEventId || event.handoffId !== update.handoffId) {
    return { code: 'RELATION_MISMATCH', event, lifecycleChanged: false, reason: '管控事件或接管编号与监测事件不匹配' };
  }
  const previousControlVersion = event.controlSummary?.controlEventVersion ?? 0;
  if (update.controlEventVersion <= previousControlVersion) {
    return { code: 'STALE_ENTITY_VERSION', event, lifecycleChanged: false, reason: `管控事件版本${update.controlEventVersion}不高于当前版本${previousControlVersion}` };
  }
  if (requiresClosureDecision(update.eventLifecycleStatus) && !update.closureDecision) {
    return { code: 'CLOSURE_DECISION_REQUIRED', event, lifecycleChanged: false, reason: '解除、关闭或确认误报必须携带事件级closureDecision' };
  }
  if (update.closureDecision && !validClosureDecision(update)) {
    return { code: 'INVALID_CLOSURE_DECISION', event, lifecycleChanged: false, reason: 'closureDecision字段不完整或时间无效' };
  }

  let lifecycleStatus = event.lifecycleStatus;
  let verificationStatus = event.verificationStatus;
  let resolvedAt = event.resolvedAt;
  let closedAt = event.closedAt;
  let falsePositiveAt = event.falsePositiveAt;
  if (update.eventLifecycleStatus === 'resolved') {
    lifecycleStatus = 'resolved'; resolvedAt = update.closureDecision!.decidedAt;
  } else if (update.eventLifecycleStatus === 'closed') {
    lifecycleStatus = 'closed'; closedAt = update.closureDecision!.decidedAt;
  } else if (update.eventLifecycleStatus === 'false_positive_confirmed') {
    lifecycleStatus = 'closed'; verificationStatus = 'false_positive';
    falsePositiveAt = update.closureDecision!.decidedAt; closedAt = update.closureDecision!.decidedAt;
  }
  const lifecycleChanged = lifecycleStatus !== event.lifecycleStatus || verificationStatus !== event.verificationStatus;
  return {
    code: 'APPLIED', lifecycleChanged, reason: lifecycleChanged ? '已应用事件级生命周期决定' : '已更新管控处置次级摘要',
    event: {
      ...event,
      version: event.version + 1,
      lifecycleStatus,
      verificationStatus,
      resolvedAt,
      closedAt,
      falsePositiveAt,
      updatedAt: update.occurredAt,
      controlSummary: {
        eventLifecycleStatus: update.eventLifecycleStatus,
        controlPhase: update.controlPhase,
        controlEventVersion: update.controlEventVersion,
        planVersion: update.planVersion,
        planState: update.planState,
        pendingMeasureCount: update.pendingMeasureCount,
        executionProgress: update.executionProgress,
        closureDecision: update.closureDecision,
        lastMessageId: update.messageId,
        lastStreamSequence: update.streamSequence,
        updatedAt: update.occurredAt,
      },
    },
  };
}
