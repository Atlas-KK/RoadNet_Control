import { create } from 'zustand';
import type { ControlEventUpdate, HandoffLink, HandoffRequest, HandoffResult, MonitoringEventUpdate } from '../domain/handoff';
import { useStore } from '../store';
import type {
  Alarm,
  AlarmAssessment,
  MonitoringAuditEntry,
  CrossModuleSyncReceipt,
  MonitoringOutboxMessage,
  MonitoringEvent,
  VerificationTask,
} from '../domain/monitoring';
import {
  transitionVerification,
  type VerificationCommand,
  type VerificationTransitionOutput,
} from './engine/verificationMachine';
import {
  createDefaultMonitoringRepository,
  MemoryMonitoringRepository,
  MonitoringVersionConflictError,
  type MonitoringProjection,
  type MonitoringRepository,
} from './services/monitoringDb';
import { SystemOperationalClock, type OperationalClock } from './services/operationalClock';
import { buildHandoffRequest, deriveConfirmedEventFacts, evaluateHandoffDecision } from './engine/handoffRules';
import { ControlBridge } from './services/controlBridge';
import { applyControlEventUpdateRule } from './engine/syncRules';
import {
  DEFAULT_MONITORING_DEPENDENCY_HEALTH,
  degradeMonitoringDependency,
  restoreMonitoringDependency,
  type MonitoringDependency,
  type MonitoringDependencyHealth,
} from './engine/degradation';
import { crossModuleSyncBus } from './services/crossModuleSync';
import {
  SIMULATED_USERS,
  assertMonitoringPermission,
  findSimulatedUser,
  type MonitoringPermission,
  type SimulatedUser,
} from './permissions';

export type MonitoringConnectionState = 'disconnected' | 'connecting' | 'connected' | 'degraded';
export type MonitoringPersistenceState = 'idle' | 'opening' | 'ready' | 'memory_only' | 'error';

export interface SyncApplyResult {
  status: 'applied' | 'duplicate' | 'gap' | 'stale' | 'rejected';
  reason: string;
}

export interface MonitoringUpdateInput {
  updateType: MonitoringEventUpdate['updateType'];
  changedFacts?: MonitoringEventUpdate['changedFacts'];
  evidence?: MonitoringEventUpdate['evidence'];
  reason: string;
}

export interface MonitoringState {
  alarmsById: Record<string, Alarm>;
  monitoringEventsById: Record<string, MonitoringEvent>;
  activeEventIds: string[];
  verificationTasksById: Record<string, VerificationTask>;
  handoffLinksById: Record<string, HandoffLink>;
  syncReceiptsByMessageId: Record<string, CrossModuleSyncReceipt>;
  outboxMessagesById: Record<string, MonitoringOutboxMessage>;
  pendingControlUpdatesBySequence: Record<number, ControlEventUpdate>;
  alarmAssessments: AlarmAssessment[];
  monitoringAuditEntries: MonitoringAuditEntry[];
  connectionState: MonitoringConnectionState;
  streamCursor: number;
  syncCursor: number;
  syncAttention?: string;
  persistenceState: MonitoringPersistenceState;
  persistenceMessage?: string;
  dependencyHealth: MonitoringDependencyHealth;
  currentUserId: string;
  handoffNotice?: { eventId: string; status: HandoffResult['status']; message: string; controlEventId?: string };

  initialize: () => Promise<void>;
  hydrateProjection: (projection: MonitoringProjection) => void;
  setCurrentUser: (userId: string) => void;
  setConnectionState: (state: MonitoringConnectionState) => void;
  degradeDependency: (dependency: MonitoringDependency, reason?: string) => Promise<void>;
  restoreDependency: (dependency: MonitoringDependency) => Promise<void>;
  restoreAllDependencies: () => Promise<void>;
  setStreamCursor: (cursor: number) => void;
  assertCurrentUserPermission: (permission: MonitoringPermission, eventId?: string) => void;
  applyVerificationCommand: (command: VerificationCommand) => Promise<VerificationTransitionOutput>;
  requestMonitoringHandoff: (eventId: string) => Promise<HandoffResult>;
  recordNoHandoffReason: (eventId: string, reason: string) => Promise<void>;
  applyControlEventUpdate: (update: ControlEventUpdate) => Promise<SyncApplyResult>;
  recoverCrossModuleSync: () => Promise<void>;
  submitMonitoringEventUpdate: (eventId: string, input: MonitoringUpdateInput) => Promise<MonitoringEventUpdate>;
  closeLocalMonitoringEvent: (eventId: string, expectedVersion: number, target: 'resolved' | 'closed', reason: string) => Promise<void>;
  clearHandoffNotice: () => void;
}

function byId<T>(items: readonly T[], idOf: (item: T) => string): Record<string, T> {
  return Object.fromEntries(items.map((item) => [idOf(item), item]));
}

function projectionState(projection: MonitoringProjection): Pick<
  MonitoringState,
  | 'alarmsById'
  | 'monitoringEventsById'
  | 'activeEventIds'
  | 'verificationTasksById'
  | 'handoffLinksById'
  | 'syncReceiptsByMessageId'
  | 'outboxMessagesById'
  | 'syncCursor'
  | 'alarmAssessments'
  | 'monitoringAuditEntries'
> {
  return {
    alarmsById: byId(projection.alarms, (alarm) => alarm.alarmId),
    monitoringEventsById: byId(projection.events, (event) => event.monitoringEventId),
    activeEventIds: projection.events.map((event) => event.monitoringEventId),
    verificationTasksById: byId(projection.verificationTasks, (task) => task.taskId),
    handoffLinksById: byId(projection.handoffs, (handoff) => handoff.handoffId),
    syncReceiptsByMessageId: byId(projection.syncReceipts ?? [], (receipt) => receipt.messageId),
    outboxMessagesById: byId(projection.outboxMessages ?? [], (message) => message.messageId),
    syncCursor: Math.max(0, ...(projection.syncReceipts ?? []).filter((receipt) => receipt.status !== 'gap').map((receipt) => receipt.streamSequence), ...(projection.outboxMessages ?? []).map((message) => message.streamSequence)),
    alarmAssessments: [...(projection.assessments ?? [])],
    monitoringAuditEntries: [...(projection.auditEntries ?? [])],
  };
}

function emptyProjection(): MonitoringProjection {
  return { alarms: [], events: [], verificationTasks: [], handoffs: [], assessments: [], auditEntries: [] };
}

function verificationTaskForEvent(tasks: Record<string, VerificationTask>, eventId: string): VerificationTask | undefined {
  return Object.values(tasks).find((task) => task.eventId === eventId);
}

function commandPermission(command: VerificationCommand): MonitoringPermission {
  return command.type === 'force_transfer' ? 'transfer_task' : 'verify_event';
}

function normalizeAndAuthorizeApproval(
  command: VerificationCommand,
  event: MonitoringEvent,
  nowMs: number,
): VerificationCommand {
  if (!('supervisorApproval' in command) || !command.supervisorApproval) return command;
  const approver = findSimulatedUser(command.supervisorApproval.approvedBy);
  if (!approver) throw new Error(`未知班长审批人：${command.supervisorApproval.approvedBy}`);
  assertMonitoringPermission(approver, command.supervisorApproval.permission, event);
  return {
    ...command,
    supervisorApproval: {
      ...command.supervisorApproval,
      approvedAt: new Date(nowMs).toISOString(),
    },
  };
}

export function createMonitoringStore(
  initialRepository: MonitoringRepository = createDefaultMonitoringRepository(),
  operationalClock: OperationalClock = new SystemOperationalClock(),
  controlBridge: ControlBridge = new ControlBridge({
    acceptMonitoringHandoff: (request) => useStore.getState().acceptMonitoringHandoff(request),
  }),
) {
  let repository = initialRepository;
  let initializePromise: Promise<void> | undefined;
  const handoffInFlight = new Map<string, Promise<HandoffResult>>();

  return create<MonitoringState>((set, get) => ({
    ...projectionState(emptyProjection()),
    connectionState: 'disconnected',
    streamCursor: 0,
    syncCursor: 0,
    pendingControlUpdatesBySequence: {},
    persistenceState: 'idle',
    dependencyHealth: DEFAULT_MONITORING_DEPENDENCY_HEALTH,
    currentUserId: SIMULATED_USERS[0].userId,

    initialize: async () => {
      if (get().persistenceState === 'ready' || get().persistenceState === 'memory_only') return;
      if (initializePromise) return initializePromise;
      set({ persistenceState: 'opening', persistenceMessage: undefined });
      initializePromise = (async () => {
        try {
          await repository.open();
          const projection = await repository.loadProjection();
          set({
            ...projectionState(projection),
            persistenceState: repository.kind === 'indexeddb' ? 'ready' : 'memory_only',
            persistenceMessage: repository.kind === 'memory'
              ? '当前仅保存在内存，本次可能不留痕'
              : undefined,
          });
        } catch (error) {
          repository.close();
          repository = new MemoryMonitoringRepository();
          await repository.open();
          set({
            ...projectionState(emptyProjection()),
            persistenceState: 'memory_only',
            persistenceMessage: `IndexedDB不可用，当前仅保存在内存，本次可能不留痕：${error instanceof Error ? error.message : '未知错误'}`,
          });
        } finally {
          initializePromise = undefined;
        }
      })();
      return initializePromise;
    },

    hydrateProjection: (projection) => set(projectionState(projection)),

    setCurrentUser: (userId) => {
      if (!findSimulatedUser(userId)) throw new Error(`未知模拟用户：${userId}`);
      set({ currentUserId: userId });
    },

    setConnectionState: (connectionState) => set({ connectionState }),

    degradeDependency: async (dependency, reason) => {
      const occurredAt = new Date(operationalClock.nowMs()).toISOString();
      const dependencyHealth = degradeMonitoringDependency(get().dependencyHealth, dependency, occurredAt, reason);
      const audit = await repository.appendAudit({
        entityId: `DEPENDENCY-${dependency}`, entityType: 'sync', occurredAt, kind: 'dependency_degraded',
        actorId: get().currentUserId, summary: dependencyHealth[dependency].reason ?? `${dependency}服务降级`,
        payload: { dependency }, simulation: true,
      });
      set((state) => ({ dependencyHealth, monitoringAuditEntries: [...state.monitoringAuditEntries, audit] }));
    },

    restoreDependency: async (dependency) => {
      const occurredAt = new Date(operationalClock.nowMs()).toISOString();
      const dependencyHealth = restoreMonitoringDependency(get().dependencyHealth, dependency, occurredAt);
      const audit = await repository.appendAudit({
        entityId: `DEPENDENCY-${dependency}`, entityType: 'sync', occurredAt, kind: 'dependency_restored',
        actorId: get().currentUserId, summary: `${dependency}服务已恢复`, payload: { dependency }, simulation: true,
      });
      set((state) => ({ dependencyHealth, monitoringAuditEntries: [...state.monitoringAuditEntries, audit] }));
    },

    restoreAllDependencies: async () => {
      for (const dependency of ['gis', 'video', 'ai', 'control'] as const) {
        if (get().dependencyHealth[dependency].availability === 'degraded') await get().restoreDependency(dependency);
      }
    },

    setStreamCursor: (streamCursor) => {
      if (!Number.isSafeInteger(streamCursor) || streamCursor < 0) throw new Error('streamCursor必须是非负安全整数');
      set({ streamCursor });
    },

    assertCurrentUserPermission: (permission, eventId) => {
      const state = get();
      const user = findSimulatedUser(state.currentUserId);
      if (!user) throw new Error(`未知模拟用户：${state.currentUserId}`);
      const event = eventId ? state.monitoringEventsById[eventId] : undefined;
      if (eventId && !event) throw new Error(`监测事件不存在：${eventId}`);
      assertMonitoringPermission(user, permission, event);
    },

    applyVerificationCommand: async (command) => {
      const state = get();
      const event = state.monitoringEventsById[command.eventId];
      if (!event) throw new Error(`监测事件不存在：${command.eventId}`);
      const actor = findSimulatedUser(state.currentUserId);
      if (!actor) throw new Error(`未知模拟用户：${state.currentUserId}`);
      assertMonitoringPermission(actor, commandPermission(command), event);
      if (command.type === 'force_transfer' && !findSimulatedUser(command.newOwnerId)) {
        throw new Error(`未知转交目标：${command.newOwnerId}`);
      }
      const nowMs = operationalClock.nowMs();
      const authorizedCommand = normalizeAndAuthorizeApproval(command, event, nowMs);
      const output = transitionVerification({
        event,
        task: verificationTaskForEvent(state.verificationTasksById, command.eventId),
        command: authorizedCommand,
        actorId: actor.userId,
        nowMs,
        idSeed: `${event.monitoringEventId}-${event.version + 1}`,
      });

      try {
        const persistedAudit = await repository.commitVerificationTransition({
          expectedEventVersion: command.expectedVersion,
          event: output.event,
          task: output.task,
          assessments: output.assessments,
          auditEntries: output.auditEntries,
        });
        set((current) => ({
          monitoringEventsById: { ...current.monitoringEventsById, [output.event.monitoringEventId]: output.event },
          verificationTasksById: { ...current.verificationTasksById, [output.task.taskId]: output.task },
          activeEventIds: output.pinToTop
            ? [output.event.monitoringEventId, ...current.activeEventIds.filter((id) => id !== output.event.monitoringEventId)]
            : current.activeEventIds,
          alarmAssessments: [...current.alarmAssessments, ...output.assessments],
          monitoringAuditEntries: [...current.monitoringAuditEntries, ...persistedAudit],
        }));
        const persistedOutput = { ...output, auditEntries: persistedAudit };
        if (command.type === 'confirm' && output.event.confirmedLevel === 'L4') {
          await get().requestMonitoringHandoff(output.event.monitoringEventId);
        }
        return persistedOutput;
      } catch (error) {
        if (error instanceof MonitoringVersionConflictError) {
          const latest = await repository.loadProjection();
          set(projectionState(latest));
        }
        throw error;
      }
},

    requestMonitoringHandoff: async (eventId) => {
      const active = handoffInFlight.get(eventId);
      if (active) return active;
      const operation = (async (): Promise<HandoffResult> => {
        const state = get();
        const event = state.monitoringEventsById[eventId];
        if (!event) throw new Error(`监测事件不存在：${eventId}`);
        const actor = findSimulatedUser(state.currentUserId);
        if (!actor) throw new Error(`未知模拟用户：${state.currentUserId}`);
        const existing = Object.values(state.handoffLinksById).find((link) => link.monitoringEventId === eventId);
        if (existing && ['accepted', 'duplicate'].includes(existing.status) && existing.controlEventId) {
          return {
            messageId: existing.resultMessageId ?? `RESULT-${existing.handoffId}`,
            correlationId: existing.correlationId ?? existing.handoffId, handoffId: existing.handoffId,
            status: 'duplicate', controlEventId: existing.controlEventId,
            controlEventVersion: existing.controlEventVersion, acceptedAt: existing.acceptedAt, retryable: false,
          };
        }
        const decision = evaluateHandoffDecision(event);
        if (!decision.eligible) throw new Error(decision.blockingReasons.join('；'));
        if (existing?.status === 'failed') {
          assertMonitoringPermission(actor, 'retry_handoff', event);
        } else if (decision.mode === 'user') {
          assertMonitoringPermission(actor, 'initiate_handoff', event);
        }
        const requestedAt = new Date(operationalClock.nowMs()).toISOString();
        const built = buildHandoffRequest({
          event, facts: deriveConfirmedEventFacts(event, state.monitoringAuditEntries), decision, actor, requestedAt,
          existingIdempotencyKey: existing?.idempotencyKey, existingHandoffId: existing?.handoffId,
        });
        const request: HandoffRequest = {
          ...built,
          monitoringEventVersion: existing?.monitoringEventVersion ?? built.monitoringEventVersion,
        };
        let currentEvent = event;
        let link: HandoffLink = {
          handoffId: request.handoffId, monitoringEventId: eventId,
          monitoringEventVersion: request.monitoringEventVersion, idempotencyKey: request.idempotencyKey,
          status: 'pending', requestedAt: request.requestedAt, updatedAt: request.requestedAt,
          retryCount: existing?.retryCount ?? 0, simulation: request.simulation,
        };
        const commitStep = async (lifecycleStatus: MonitoringEvent['lifecycleStatus'], kind: string, summary: string) => {
          const now = new Date(operationalClock.nowMs()).toISOString();
          const nextEvent: MonitoringEvent = {
            ...currentEvent, lifecycleStatus, handoffId: request.handoffId,
            version: currentEvent.version + 1, updatedAt: now,
          };
          const audit: MonitoringAuditEntry = {
            entityId: eventId, entityType: 'handoff', occurredAt: now, kind, actorId: actor.userId,
            summary, payload: { handoffId: request.handoffId, idempotencyKey: request.idempotencyKey }, simulation: event.simulation,
          };
          link = { ...link, updatedAt: now };
          const persistedAudit = await repository.commitHandoffTransition({
            expectedEventVersion: currentEvent.version, event: nextEvent, handoff: link, auditEntries: [audit],
          });
          currentEvent = nextEvent;
          set((current) => ({
            monitoringEventsById: { ...current.monitoringEventsById, [eventId]: nextEvent },
            handoffLinksById: { ...current.handoffLinksById, [link.handoffId]: link },
            monitoringAuditEntries: [...current.monitoringAuditEntries, ...persistedAudit],
          }));
        };
        await commitStep('pending_handoff', 'handoff_requested', decision.mode === 'rule' ? '人工确认L4，系统自动发起接管' : '监控员发起L3事件接管');
        await commitStep('handoff_in_progress', 'handoff_started', '接管请求已发送至智能管控');
        let result: HandoffResult;
        if (get().dependencyHealth.control.availability === 'degraded') {
          result = {
            messageId: `RESULT-${request.messageId}`, correlationId: request.correlationId, handoffId: request.handoffId,
            status: 'failed', errorCode: 'CONTROL_SERVICE_UNAVAILABLE',
            errorMessage: get().dependencyHealth.control.reason ?? '智能管控服务不可用', retryable: true,
          };
          link = { ...link, status: 'failed', retryCount: link.retryCount + 1, errorCode: result.errorCode,
            errorMessage: result.errorMessage, retryable: true, updatedAt: new Date(operationalClock.nowMs()).toISOString() };
          await repository.putHandoff(link);
        } else {
          result = await controlBridge.handoff(request, {
            getByIdempotencyKey: (key) => repository.getHandoffByIdempotencyKey(key),
            save: (value) => repository.putHandoff(value),
          });
        }
        const persistedLink = await repository.getHandoffByIdempotencyKey(request.idempotencyKey);
        link = persistedLink ?? { ...link, status: result.status, controlEventId: result.controlEventId };
        const success = result.status === 'accepted' || result.status === 'duplicate';
        const now = new Date(operationalClock.nowMs()).toISOString();
        const finalEvent: MonitoringEvent = {
          ...currentEvent, lifecycleStatus: success ? 'taken_over' : 'handoff_failed',
          controlEventId: result.controlEventId, takenOverAt: success ? result.acceptedAt ?? now : undefined,
          version: currentEvent.version + 1, updatedAt: now,
        };
        const finalAudit: MonitoringAuditEntry = {
          entityId: eventId, entityType: 'handoff', occurredAt: now,
          kind: success ? 'handoff_succeeded' : 'handoff_failed', actorId: actor.userId,
          summary: success ? `接管成功，关联智能管控事件 ${result.controlEventId}` : `接管失败：${result.errorMessage ?? result.errorCode ?? '未知原因'}`,
          payload: { handoffId: request.handoffId, idempotencyKey: request.idempotencyKey, controlEventId: result.controlEventId },
          simulation: event.simulation,
        };
        const persistedAudit = await repository.commitHandoffTransition({
          expectedEventVersion: currentEvent.version, event: finalEvent, handoff: link, auditEntries: [finalAudit],
        });
        set((current) => ({
          monitoringEventsById: { ...current.monitoringEventsById, [eventId]: finalEvent },
          handoffLinksById: { ...current.handoffLinksById, [link.handoffId]: link },
          monitoringAuditEntries: [...current.monitoringAuditEntries, ...persistedAudit],
          handoffNotice: {
            eventId, status: result.status, controlEventId: result.controlEventId,
            message: success ? '接管成功，可查看智能管控或继续事件监测' : `接管失败：${result.errorMessage ?? result.errorCode ?? '请联系班长重试'}`,
          },
        }));
        return result;
      })().catch(async (error) => {
        if (error instanceof MonitoringVersionConflictError) {
          const latest = await repository.loadProjection();
          set(projectionState(latest));
        }
        throw error;
      }).finally(() => handoffInFlight.delete(eventId));
      handoffInFlight.set(eventId, operation);
      return operation;
    },

    recordNoHandoffReason: async (eventId, reason) => {
      const normalized = reason.trim();
      if (!normalized) throw new Error('暂不接管必须填写理由');
      const state = get();
      const event = state.monitoringEventsById[eventId];
      if (!event) throw new Error(`监测事件不存在：${eventId}`);
      const actor = findSimulatedUser(state.currentUserId);
      if (!actor) throw new Error(`未知模拟用户：${state.currentUserId}`);
      assertMonitoringPermission(actor, 'initiate_handoff', event);
      const decision = evaluateHandoffDecision(event);
      if (decision.level !== 'L3') throw new Error('只有满足建议条件的L3事件可以记录暂不接管理由');
      const persisted = await repository.appendAudit({
        entityId: eventId, entityType: 'handoff', occurredAt: new Date(operationalClock.nowMs()).toISOString(),
        kind: 'handoff_declined', actorId: actor.userId, summary: `暂不接管：${normalized}`,
        payload: { reasons: decision.reasons }, simulation: event.simulation,
      });
      set((current) => ({ monitoringAuditEntries: [...current.monitoringAuditEntries, persisted] }));
    },

    applyControlEventUpdate: async (update) => {
      const existingReceipt = await repository.getSyncReceipt(update.messageId);
      if (existingReceipt && existingReceipt.status !== 'gap') {
        return { status: 'duplicate', reason: `消息${update.messageId}已处理` };
      }
      const state = get();
      if (update.streamSequence > state.syncCursor + 1) {
        const receipt: CrossModuleSyncReceipt = {
          messageId: update.messageId, correlationId: update.correlationId, streamSequence: update.streamSequence,
          direction: 'control_to_monitoring', entityId: update.controlEventId, entityVersion: update.controlEventVersion,
          status: 'gap', reason: `等待补拉游标${state.syncCursor + 1}至${update.streamSequence - 1}`,
          receivedAt: new Date(operationalClock.nowMs()).toISOString(), simulation: update.simulation,
        };
        await repository.putSyncReceipt(receipt);
        set((current) => ({
          syncReceiptsByMessageId: { ...current.syncReceiptsByMessageId, [receipt.messageId]: receipt },
          pendingControlUpdatesBySequence: { ...current.pendingControlUpdatesBySequence, [update.streamSequence]: update },
          syncAttention: receipt.reason,
        }));
        return { status: 'gap', reason: receipt.reason };
      }
      const event = Object.values(state.monitoringEventsById).find((item) => item.controlEventId === update.controlEventId && item.handoffId === update.handoffId);
      const decision = event ? applyControlEventUpdateRule(event, update) : undefined;
      const receiptStatus: CrossModuleSyncReceipt['status'] = !decision || decision.code === 'RELATION_MISMATCH'
        ? 'rejected'
        : decision.code === 'STALE_ENTITY_VERSION' ? 'stale'
          : decision.code === 'APPLIED' ? 'applied' : 'rejected';
      const reason = decision?.reason ?? '未找到匹配的监测事件关联';
      const receipt: CrossModuleSyncReceipt = {
        messageId: update.messageId, correlationId: update.correlationId, streamSequence: update.streamSequence,
        direction: 'control_to_monitoring', entityId: update.controlEventId, entityVersion: update.controlEventVersion,
        status: receiptStatus, reason, receivedAt: new Date(operationalClock.nowMs()).toISOString(), simulation: update.simulation,
      };
      const audit: MonitoringAuditEntry = {
        entityId: event?.monitoringEventId ?? update.controlEventId, entityType: 'sync', occurredAt: receipt.receivedAt,
        kind: `control_update_${receiptStatus}`, summary: reason,
        payload: { messageId: update.messageId, streamSequence: update.streamSequence, controlEventVersion: update.controlEventVersion },
        simulation: update.simulation,
      };
      const persistedAudit = await repository.commitSyncTransition({
        expectedEventVersion: decision?.code === 'APPLIED' ? event!.version : undefined,
        event: decision?.code === 'APPLIED' ? decision.event : undefined,
        receipt, auditEntries: [audit],
      });
      set((current) => {
        const nextEvents = decision?.code === 'APPLIED'
          ? { ...current.monitoringEventsById, [decision.event.monitoringEventId]: decision.event }
          : current.monitoringEventsById;
        return {
          monitoringEventsById: nextEvents,
          activeEventIds: decision?.code === 'APPLIED' && (decision.event.lifecycleStatus === 'resolved' || decision.event.lifecycleStatus === 'closed')
            ? current.activeEventIds.filter((id) => id !== decision.event.monitoringEventId)
            : current.activeEventIds,
          syncReceiptsByMessageId: { ...current.syncReceiptsByMessageId, [receipt.messageId]: receipt },
          pendingControlUpdatesBySequence: Object.fromEntries(Object.entries(current.pendingControlUpdatesBySequence).filter(([sequence]) => Number(sequence) !== update.streamSequence)),
          monitoringAuditEntries: [...current.monitoringAuditEntries, ...persistedAudit],
          syncCursor: Math.max(current.syncCursor, update.streamSequence),
          syncAttention: receiptStatus === 'rejected' ? reason : undefined,
        };
      });
      const nextPending = get().pendingControlUpdatesBySequence[get().syncCursor + 1];
      if (nextPending) await get().applyControlEventUpdate(nextPending);
      return { status: receiptStatus === 'applied' ? 'applied' : receiptStatus, reason } as SyncApplyResult;
    },

    recoverCrossModuleSync: async () => {
      for (const outbox of Object.values(get().outboxMessagesById).filter((item) => item.status === 'pending')) {
        const message = outbox.payload as unknown as MonitoringEventUpdate;
        crossModuleSyncBus.publishMonitoring(message);
        const sent = { ...outbox, status: 'sent' as const, updatedAt: new Date(operationalClock.nowMs()).toISOString() };
        await repository.updateOutbox(sent);
        set((current) => ({ outboxMessagesById: { ...current.outboxMessagesById, [sent.messageId]: sent } }));
      }
      for (const envelope of crossModuleSyncBus.pullAfter(get().syncCursor)) {
        if (envelope.direction === 'control_to_monitoring') {
          await get().applyControlEventUpdate(envelope.message);
        } else if (envelope.message.streamSequence === get().syncCursor + 1) {
          set({ syncCursor: envelope.message.streamSequence });
        }
      }
      set({ syncAttention: undefined });
    },

    submitMonitoringEventUpdate: async (eventId, input) => {
      const state = get();
      const event = state.monitoringEventsById[eventId];
      if (!event) throw new Error(`监测事件不存在：${eventId}`);
      if (event.lifecycleStatus !== 'taken_over' || !event.controlEventId || !event.handoffId) {
        throw new Error('只有已接管事件可以提交跨模块订正或证据更新');
      }
      const reason = input.reason.trim();
      if (!reason) throw new Error('跨模块更新必须填写原因');
      const occurredAt = new Date(operationalClock.nowMs()).toISOString();
      const streamSequence = crossModuleSyncBus.nextSequence();
      const message: MonitoringEventUpdate = {
        messageId: `MSG-M-${eventId}-V${event.version + 1}`, correlationId: event.handoffId,
        streamSequence, monitoringEventId: eventId, controlEventId: event.controlEventId,
        expectedControlEventVersion: event.controlSummary?.controlEventVersion,
        monitoringEventVersion: event.version + 1, occurredAt, updateType: input.updateType,
        changedFacts: input.changedFacts, evidence: input.evidence, reason, simulation: event.simulation,
      };
      const nextEvent: MonitoringEvent = {
        ...event,
        eventType: input.changedFacts?.eventType ?? event.eventType,
        location: input.changedFacts?.location ? { ...event.location, ...input.changedFacts.location } : event.location,
        version: event.version + 1, updatedAt: occurredAt,
      };
      const outbox: MonitoringOutboxMessage = {
        messageId: message.messageId, correlationId: message.correlationId, streamSequence,
        status: 'pending', messageType: 'MonitoringEventUpdate', payload: message, createdAt: occurredAt, updatedAt: occurredAt,
      };
      const audit: MonitoringAuditEntry = {
        entityId: eventId, entityType: 'sync', occurredAt, kind: `monitoring_update_${input.updateType}`,
        actorId: state.currentUserId, summary: `提交管控侧${input.updateType}：${reason}`,
        payload: { messageId: message.messageId, streamSequence }, simulation: event.simulation,
      };
      const persistedAudit = await repository.commitOutgoingSync({ expectedEventVersion: event.version, event: nextEvent, outbox, auditEntries: [audit] });
      set((current) => ({
        monitoringEventsById: { ...current.monitoringEventsById, [eventId]: nextEvent },
        outboxMessagesById: { ...current.outboxMessagesById, [outbox.messageId]: outbox },
        monitoringAuditEntries: [...current.monitoringAuditEntries, ...persistedAudit],
        syncCursor: Math.max(current.syncCursor, streamSequence),
      }));
      if (get().connectionState !== 'disconnected') {
        crossModuleSyncBus.publishMonitoring(message);
        const sent = { ...outbox, status: 'sent' as const, updatedAt: new Date(operationalClock.nowMs()).toISOString() };
        await repository.updateOutbox(sent);
        set((current) => ({ outboxMessagesById: { ...current.outboxMessagesById, [sent.messageId]: sent } }));
      }
      return message;
    },

    closeLocalMonitoringEvent: async (eventId, expectedVersion, target, reasonInput) => {
      const state = get(); const event = state.monitoringEventsById[eventId];
      if (!event) throw new Error(`监测事件不存在：${eventId}`);
      if (event.version !== expectedVersion) throw new MonitoringVersionConflictError(eventId, expectedVersion, event.version);
      if (event.lifecycleStatus === 'taken_over' || event.controlEventId || event.handoffId) {
        throw new Error('已接管事件不能直接误报或关闭，请提交事实订正或误报复核申请');
      }
      if (event.confirmedLevel !== 'L1' && event.confirmedLevel !== 'L2') throw new Error('只有已确认的L1/L2事件可在监测侧解除或关闭');
      const reason = reasonInput.trim(); if (!reason) throw new Error('解除或关闭必须填写原因');
      const now = new Date(operationalClock.nowMs()).toISOString();
      const nextEvent: MonitoringEvent = {
        ...event, lifecycleStatus: target, resolvedAt: target === 'resolved' ? now : event.resolvedAt,
        closedAt: target === 'closed' ? now : event.closedAt, version: event.version + 1, updatedAt: now,
      };
      await repository.putEvent(nextEvent, expectedVersion);
      const audit = await repository.appendAudit({
        entityId: eventId, entityType: 'event', occurredAt: now, kind: `monitoring_${target}`,
        actorId: state.currentUserId, summary: `${target === 'resolved' ? '解除' : '关闭'}事件：${reason}`, simulation: event.simulation,
      });
      set((current) => ({
        monitoringEventsById: { ...current.monitoringEventsById, [eventId]: nextEvent },
        activeEventIds: current.activeEventIds.filter((id) => id !== eventId),
        monitoringAuditEntries: [...current.monitoringAuditEntries, audit],
      }));
    },

    clearHandoffNotice: () => set({ handoffNotice: undefined }),
  }));
}

export const useMonitoringStore = createMonitoringStore();

crossModuleSyncBus.subscribeControl((update) => {
  void useMonitoringStore.getState().applyControlEventUpdate(update);
});

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __monitoringStore?: typeof useMonitoringStore }).__monitoringStore = useMonitoringStore;
}

export function selectCurrentSimulatedUser(state: MonitoringState): SimulatedUser {
  return findSimulatedUser(state.currentUserId) ?? SIMULATED_USERS[0];
}






