// FR-EM-006 / FR-EM-011 / FR-EM-012：核实状态、SLA和订正的唯一纯函数入口。

import type {
  AlarmAssessment,
  ConfirmedEventFacts,
  EventLocation,
  MonitoringAuditEntry,
  MonitoringEvent,
  MonitoringEventType,
  MonitoringLevel,
  VerificationTask,
} from '../../domain/monitoring';
import type { MonitoringPermission } from '../permissions';

const SLA_MINUTES: Readonly<Record<MonitoringLevel, number>> = Object.freeze({
  L4: 1,
  L3: 3,
  L2: 5,
  L1: 10,
});

const LEVEL_WEIGHT: Readonly<Record<MonitoringLevel, number>> = Object.freeze({
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
});

export type VerificationTransitionCode =
  | 'VERSION_CONFLICT'
  | 'EVENT_ALREADY_RESOLVED'
  | 'TASK_OCCUPIED'
  | 'TASK_NOT_OWNED'
  | 'INVALID_TRANSITION'
  | 'REASON_REQUIRED'
  | 'SUPERVISOR_APPROVAL_REQUIRED'
  | 'REVIEW_NOT_DUE';

export class VerificationTransitionError extends Error {
  readonly code: VerificationTransitionCode;
  readonly currentOwnerId?: string;

  constructor(code: VerificationTransitionCode, message: string, currentOwnerId?: string) {
    super(message);
    this.name = 'VerificationTransitionError';
    this.code = code;
    this.currentOwnerId = currentOwnerId;
  }
}

export interface SupervisorApproval {
  approvedBy: string;
  approvedAt: string;
  permission: Extract<
    MonitoringPermission,
    'review_l4_false_positive' | 'review_l4_downgrade' | 'approve_l4_observation'
  >;
}

export interface VerificationCorrections {
  eventType?: MonitoringEventType;
  location?: Partial<EventLocation>;
  confirmedLevel?: MonitoringLevel;
  lanesAffected?: number;
  lanesTotal?: number;
  vehicleCount?: number;
  casualties?: number;
  hazardousMaterials?: boolean;
  hazardousMaterialLeak?: boolean;
  queueLengthKm?: number;
  congestionDurationMin?: number;
  notes?: string;
}

interface BaseCommand {
  eventId: string;
  expectedVersion: number;
}

export type VerificationCommand =
  | (BaseCommand & { type: 'claim' })
  | (BaseCommand & { type: 'release'; reason?: string })
  | (BaseCommand & { type: 'force_transfer'; newOwnerId: string; reason: string })
  | (BaseCommand & {
      type: 'confirm';
      corrections: VerificationCorrections;
      reason?: string;
      supervisorApproval?: SupervisorApproval;
    })
  | (BaseCommand & { type: 'false_positive'; reason: string; supervisorApproval?: SupervisorApproval })
  | (BaseCommand & { type: 'observe'; reason: string; supervisorApproval?: SupervisorApproval })
  | (BaseCommand & { type: 'evidence_added'; evidenceId: string })
  | (BaseCommand & { type: 'review_due' });

export interface EventCorrectionVersion {
  correctionId: string;
  eventId: string;
  eventVersion: number;
  correctedBy: string;
  correctedAt: string;
  reason: string;
  before: Readonly<{
    eventType: MonitoringEventType;
    location: EventLocation;
    confirmedLevel?: MonitoringLevel;
  }>;
  after: Readonly<VerificationCorrections>;
}

export interface VerificationTransitionInput {
  event: MonitoringEvent;
  task?: VerificationTask;
  command: VerificationCommand;
  actorId: string;
  nowMs: number;
  idSeed: string;
}

export interface VerificationTransitionOutput {
  event: MonitoringEvent;
  task: VerificationTask;
  assessments: AlarmAssessment[];
  auditEntries: MonitoringAuditEntry[];
  correction?: EventCorrectionVersion;
  pinToTop: boolean;
  requiresSupervisorAttention: boolean;
}

export function verificationSlaMs(level: MonitoringLevel): number {
  return SLA_MINUTES[level] * 60_000;
}

export function verificationRemainingMs(deadline: string | undefined, nowMs: number): number | undefined {
  if (!deadline) return undefined;
  return Date.parse(deadline) - nowMs;
}

function effectiveLevel(event: MonitoringEvent): MonitoringLevel {
  return event.confirmedLevel ?? event.suggestedLevel;
}

function assertExpectedVersion(event: MonitoringEvent, command: VerificationCommand): void {
  if (command.eventId !== event.monitoringEventId || command.expectedVersion !== event.version) {
    throw new VerificationTransitionError(
      'VERSION_CONFLICT',
      `事件版本已变化：期望 ${command.expectedVersion}，当前 ${event.version}`,
      event.verificationOwnerId,
    );
  }
}

function assertEventOpen(event: MonitoringEvent): void {
  if (event.verificationStatus === 'confirmed' || event.verificationStatus === 'false_positive') {
    throw new VerificationTransitionError('EVENT_ALREADY_RESOLVED', '该事件已完成核实，不能重复提交');
  }
}

function assertOwner(task: VerificationTask | undefined, actorId: string): asserts task is VerificationTask {
  if (!task || task.status !== 'claimed' || task.ownerId !== actorId) {
    throw new VerificationTransitionError(
      'TASK_NOT_OWNED',
      task?.ownerId ? `核实任务当前由 ${task.ownerId} 占用` : '请先开始核实并认领任务',
      task?.ownerId,
    );
  }
}

function requireText(value: string | undefined, message: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new VerificationTransitionError('REASON_REQUIRED', message);
  return normalized;
}

function requireApproval(
  approval: SupervisorApproval | undefined,
  permission: SupervisorApproval['permission'],
  message: string,
): SupervisorApproval {
  if (!approval || approval.permission !== permission) {
    throw new VerificationTransitionError('SUPERVISOR_APPROVAL_REQUIRED', message);
  }
  return approval;
}

function taskFor(event: MonitoringEvent, task: VerificationTask | undefined, now: string): VerificationTask {
  return task ?? {
    taskId: `VT-${event.monitoringEventId}`,
    eventId: event.monitoringEventId,
    expectedEventVersion: event.version,
    status: 'available',
    updatedAt: now,
  };
}

function audit(
  event: MonitoringEvent,
  now: string,
  actorId: string,
  kind: string,
  summary: string,
  payload?: Record<string, unknown>,
): MonitoringAuditEntry {
  return {
    entityId: event.monitoringEventId,
    entityType: 'event',
    occurredAt: now,
    kind,
    actorId,
    summary,
    payload,
    simulation: event.simulation,
  };
}

function advance(
  event: MonitoringEvent,
  task: VerificationTask,
  now: string,
  eventPatch: Partial<MonitoringEvent>,
  taskPatch: Partial<VerificationTask>,
): { event: MonitoringEvent; task: VerificationTask } {
  const nextVersion = event.version + 1;
  return {
    event: { ...event, ...eventPatch, version: nextVersion, updatedAt: now },
    task: { ...task, ...taskPatch, expectedEventVersion: nextVersion, updatedAt: now },
  };
}

function assessmentRecords(
  event: MonitoringEvent,
  actorId: string,
  now: string,
  idSeed: string,
  result: AlarmAssessment['result'],
  reason: string,
): AlarmAssessment[] {
  return event.alarmIds.map((alarmId, index) => ({
    assessmentId: `ASM-${idSeed}-${index + 1}`,
    alarmId,
    result,
    reason,
    assessedBy: actorId,
    assessedAt: now,
  }));
}

function baseOutput(
  next: { event: MonitoringEvent; task: VerificationTask },
  auditEntries: MonitoringAuditEntry[],
  overrides: Partial<VerificationTransitionOutput> = {},
): VerificationTransitionOutput {
  return {
    ...next,
    assessments: [],
    auditEntries,
    pinToTop: false,
    requiresSupervisorAttention: false,
    ...overrides,
  };
}

/**
 * 所有核实业务状态变化必须经由此函数。该函数不读写仓储、不读取系统时间、
 * 不生成随机数；调用方负责注入操作时钟和可追踪ID种子。
 */
export function transitionVerification(input: VerificationTransitionInput): VerificationTransitionOutput {
  const { event, command, actorId, nowMs, idSeed } = input;
  const now = new Date(nowMs).toISOString();
  assertExpectedVersion(event, command);
  const currentTask = taskFor(event, input.task, now);

  if (command.type === 'claim') {
    assertEventOpen(event);
    if (currentTask.status === 'claimed' && currentTask.ownerId !== actorId) {
      throw new VerificationTransitionError(
        'TASK_OCCUPIED',
        `核实任务当前由 ${currentTask.ownerId} 占用`,
        currentTask.ownerId,
      );
    }
    const deadline = currentTask.nextReviewAt ?? new Date(nowMs + verificationSlaMs(effectiveLevel(event))).toISOString();
    const next = advance(event, currentTask, now, {
      verificationStatus: 'verifying',
      verificationMode: 'manual_review',
      verificationOwnerId: actorId,
      nextReviewAt: deadline,
      reviewPriorityAt: undefined,
    }, {
      status: 'claimed',
      ownerId: actorId,
      claimedAt: currentTask.claimedAt ?? now,
      nextReviewAt: deadline,
    });
    return baseOutput(next, [audit(event, now, actorId, 'verification_claimed', '开始核实并独占任务', { deadline })]);
  }

  if (command.type === 'force_transfer') {
    assertEventOpen(event);
    const reason = requireText(command.reason, '强制转交必须填写原因');
    if (currentTask.status !== 'claimed') {
      throw new VerificationTransitionError('INVALID_TRANSITION', '仅已占用任务可以强制转交');
    }
    const previousOwnerId = currentTask.ownerId;
    const next = advance(event, currentTask, now, {
      verificationStatus: 'verifying',
      verificationMode: 'manual_review',
      verificationOwnerId: command.newOwnerId,
    }, {
      status: 'claimed',
      ownerId: command.newOwnerId,
      claimedAt: now,
    });
    return baseOutput(next, [audit(event, now, actorId, 'verification_force_transferred', '班长强制转交核实任务', {
      previousOwnerId,
      newOwnerId: command.newOwnerId,
      reason,
    })]);
  }

  if (command.type === 'evidence_added' || command.type === 'review_due') {
    if (event.verificationMode !== 'observation' || currentTask.status !== 'observation') {
      throw new VerificationTransitionError('INVALID_TRANSITION', '仅持续观察中的事件可以触发复核');
    }
    if (command.type === 'review_due' && (!event.nextReviewAt || Date.parse(event.nextReviewAt) > nowMs)) {
      throw new VerificationTransitionError('REVIEW_NOT_DUE', '尚未到复核时间');
    }
    const next = advance(event, currentTask, now, {
      verificationStatus: 'pending',
      verificationMode: 'manual_review',
      verificationOwnerId: undefined,
      nextReviewAt: undefined,
      reviewPriorityAt: now,
    }, {
      status: 'available',
      ownerId: undefined,
      claimedAt: undefined,
      nextReviewAt: undefined,
    });
    const isEvidence = command.type === 'evidence_added';
    return baseOutput(next, [audit(event, now, actorId, isEvidence ? 'new_evidence_review_requested' : 'scheduled_review_requested', isEvidence ? '新证据触发提前复核' : '持续观察到期复核', isEvidence ? { evidenceId: command.evidenceId } : undefined)], { pinToTop: true });
  }

  assertEventOpen(event);
  assertOwner(currentTask, actorId);

  if (command.type === 'release') {
    const next = advance(event, currentTask, now, {
      verificationStatus: 'pending',
      verificationMode: 'manual_review',
      verificationOwnerId: undefined,
    }, {
      status: 'available',
      ownerId: undefined,
      claimedAt: undefined,
    });
    return baseOutput(next, [audit(event, now, actorId, 'verification_released', '释放核实任务', { reason: command.reason?.trim() })]);
  }

  if (command.type === 'observe') {
    const reason = requireText(command.reason, '持续观察必须填写依据');
    const level = effectiveLevel(event);
    const approval = level === 'L4'
      ? requireApproval(command.supervisorApproval, 'approve_l4_observation', 'L4事件持续观察必须经班长审批')
      : command.supervisorApproval;
    const nextReviewAt = new Date(nowMs + verificationSlaMs(level)).toISOString();
    const observationCount = event.observationCount + 1;
    const next = advance(event, currentTask, now, {
      verificationStatus: 'verifying',
      verificationMode: 'observation',
      verificationOwnerId: undefined,
      nextReviewAt,
      observationCount,
      reviewPriorityAt: undefined,
    }, {
      status: 'observation',
      ownerId: undefined,
      claimedAt: undefined,
      nextReviewAt,
    });
    return baseOutput(next, [audit(event, now, actorId, 'verification_observation_started', '信息不足，进入持续观察并释放占用', {
      reason,
      nextReviewAt,
      observationCount,
      supervisorApproval: approval,
    })], { requiresSupervisorAttention: observationCount >= 2 });
  }

  if (command.type === 'false_positive') {
    const reason = requireText(command.reason, '误报结论必须填写依据');
    const approval = effectiveLevel(event) === 'L4'
      ? requireApproval(command.supervisorApproval, 'review_l4_false_positive', 'L4事件判定误报必须经班长复核')
      : command.supervisorApproval;
    const next = advance(event, currentTask, now, {
      verificationStatus: 'false_positive',
      verificationMode: 'manual_review',
      verificationOwnerId: undefined,
      nextReviewAt: undefined,
      falsePositiveAt: now,
      reviewPriorityAt: undefined,
    }, {
      status: 'completed',
      ownerId: undefined,
      nextReviewAt: undefined,
    });
    return baseOutput(next, [audit(event, now, actorId, 'verification_false_positive', '人工核实为误报', { reason, supervisorApproval: approval })], {
      assessments: assessmentRecords(event, actorId, now, idSeed, 'false_positive', reason),
    });
  }

  const confirmedLevel = command.corrections.confirmedLevel ?? event.confirmedLevel ?? event.suggestedLevel;
  const isDowngrade = LEVEL_WEIGHT[confirmedLevel] < LEVEL_WEIGHT[event.suggestedLevel];
  const reason = isDowngrade
    ? requireText(command.reason, 'L3/L4建议等级被调低时必须填写调整原因')
    : command.reason?.trim() ?? '人工核实确认';
  let approval = command.supervisorApproval;
  if (event.suggestedLevel === 'L4' && isDowngrade) {
    approval = requireApproval(command.supervisorApproval, 'review_l4_downgrade', 'L4事件降级必须经班长复核');
  }
  const correctedLocation = command.corrections.location
    ? { ...event.location, ...command.corrections.location }
    : event.location;
  const correction: EventCorrectionVersion = {
    correctionId: `CORR-${idSeed}`,
    eventId: event.monitoringEventId,
    eventVersion: event.version + 1,
    correctedBy: actorId,
    correctedAt: now,
    reason,
    before: {
      eventType: event.eventType,
      location: event.location,
      confirmedLevel: event.confirmedLevel,
    },
    after: { ...command.corrections, confirmedLevel, location: correctedLocation },
  };
  const next = advance(event, currentTask, now, {
    eventType: command.corrections.eventType ?? event.eventType,
    location: correctedLocation,
    confirmedLevel,
    verificationStatus: 'confirmed',
    verificationMode: 'manual_review',
    verificationOwnerId: undefined,
    nextReviewAt: undefined,
    confirmedAt: now,
    reviewPriorityAt: undefined,
  }, {
    status: 'completed',
    ownerId: undefined,
    nextReviewAt: undefined,
  });
  return baseOutput(next, [audit(event, now, actorId, 'verification_confirmed', '人工核实确认事件并追加订正版本', {
    correction,
    supervisorApproval: approval,
  })], {
    assessments: assessmentRecords(event, actorId, now, idSeed, 'valid', reason),
    correction,
  });
}

export type { ConfirmedEventFacts };
