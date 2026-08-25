import { beforeEach, describe, expect, it } from 'vitest';
import type { ControlEventUpdate, HandoffRequest, MonitoringEventUpdate } from '../domain/handoff';
import type { MonitoringEvent } from '../domain/monitoring';
import { useStore } from '../store';
import { crossModuleSyncBus } from './services/crossModuleSync';
import { MemoryMonitoringRepository } from './services/monitoringDb';
import { createMonitoringStore } from './store';

function takenOverEvent(): MonitoringEvent {
  return {
    monitoringEventId: 'ME-SYNC-001', version: 4, alarmIds: [], eventType: 'traffic_accident',
    location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, suggestedLevel: 'L4', confirmedLevel: 'L4',
    verificationStatus: 'confirmed', lifecycleStatus: 'taken_over', observationCount: 0, conflicts: [],
    controlEventId: 'CTRL-SYNC-001', handoffId: 'HO-SYNC-001', detectedAt: '2026-08-25T02:00:00.000Z',
    takenOverAt: '2026-08-25T02:02:00.000Z', updatedAt: '2026-08-25T02:02:00.000Z', simulation: true,
  };
}

function controlUpdate(sequence: number, version: number, overrides: Partial<ControlEventUpdate> = {}): ControlEventUpdate {
  return {
    messageId: `CM-${sequence}-${version}`, correlationId: 'HO-SYNC-001', streamSequence: sequence,
    controlEventId: 'CTRL-SYNC-001', handoffId: 'HO-SYNC-001', controlEventVersion: version,
    occurredAt: `2026-08-25T02:0${Math.min(sequence, 9)}:00.000Z`, eventLifecycleStatus: 'handling',
    controlPhase: 'executing', planVersion: version, planState: '已下发', pendingMeasureCount: 1,
    executionProgress: `进度${version}`, simulation: true, ...overrides,
  };
}

async function monitoringStoreWithTakenOverEvent() {
  const repository = new MemoryMonitoringRepository();
  await repository.putEvent(takenOverEvent());
  const store = createMonitoringStore(repository, { nowMs: () => Date.parse('2026-08-25T02:10:00.000Z') });
  await store.getState().initialize();
  return { store, repository };
}

describe('阶段9 管控回写幂等、乱序与关闭仲裁', () => {
  beforeEach(() => crossModuleSyncBus.reset());

  it('同一messageId只应用一次', async () => {
    const { store } = await monitoringStoreWithTakenOverEvent();
    const update = controlUpdate(1, 1);
    expect((await store.getState().applyControlEventUpdate(update)).status).toBe('applied');
    expect((await store.getState().applyControlEventUpdate(update)).status).toBe('duplicate');
    expect(store.getState().monitoringEventsById['ME-SYNC-001']?.version).toBe(5);
  });

  it('先收到高游标时挂起，补齐后按序应用且旧实体版本不能覆盖新版本', async () => {
    const { store } = await monitoringStoreWithTakenOverEvent();
    expect((await store.getState().applyControlEventUpdate(controlUpdate(2, 2))).status).toBe('gap');
    await store.getState().applyControlEventUpdate(controlUpdate(1, 1));
    expect(store.getState().syncCursor).toBe(2);
    expect(store.getState().monitoringEventsById['ME-SYNC-001']?.controlSummary?.controlEventVersion).toBe(2);
    expect((await store.getState().applyControlEventUpdate(controlUpdate(3, 1))).status).toBe('stale');
    expect(store.getState().monitoringEventsById['ME-SYNC-001']?.controlSummary?.controlEventVersion).toBe(2);
  });

  it('终态缺少closureDecision时拒绝，显式关闭决定才能关闭监测事件', async () => {
    const { store } = await monitoringStoreWithTakenOverEvent();
    const rejected = await store.getState().applyControlEventUpdate(controlUpdate(1, 1, { eventLifecycleStatus: 'closed', controlPhase: 'closed' }));
    expect(rejected.status).toBe('rejected');
    expect(store.getState().monitoringEventsById['ME-SYNC-001']?.lifecycleStatus).toBe('taken_over');

    const accepted = await store.getState().applyControlEventUpdate(controlUpdate(2, 2, {
      eventLifecycleStatus: 'closed', controlPhase: 'closed',
      closureDecision: { decisionId: 'DEC-1', decidedAt: '2026-08-25T02:09:00.000Z', decidedBy: 'USR-CONTROL-01', reason: '现场清撤完成' },
    }));
    expect(accepted.status).toBe('applied');
    expect(store.getState().monitoringEventsById['ME-SYNC-001']?.lifecycleStatus).toBe('closed');
    expect(store.getState().activeEventIds).not.toContain('ME-SYNC-001');
  });

  it('已接管事件不能从监测侧直接关闭，只能提交订正或复核申请', async () => {
    const { store } = await monitoringStoreWithTakenOverEvent();
    await expect(store.getState().closeLocalMonitoringEvent('ME-SYNC-001', 4, 'closed', '直接关闭'))
      .rejects.toThrow('提交事实订正或误报复核申请');
  });

  it('断线时写入Outbox，恢复后按原messageId发送且不重复创建消息', async () => {
    const { store, repository } = await monitoringStoreWithTakenOverEvent();
    store.getState().setConnectionState('disconnected');
    const message = await store.getState().submitMonitoringEventUpdate('ME-SYNC-001', {
      updateType: 'evidence_added', reason: '补充第二路视频证据',
      evidence: [{ evidenceId: 'E-NEW', kind: 'video_clip', capturedAt: '2026-08-25T02:08:00.000Z', controlledRef: 'controlled://e-new', archived: true, simulation: true }],
    });
    expect((await repository.listOutboxMessages()).find((item) => item.messageId === message.messageId)?.status).toBe('pending');
    await store.getState().recoverCrossModuleSync();
    expect((await repository.listOutboxMessages()).find((item) => item.messageId === message.messageId)?.status).toBe('sent');
    expect(crossModuleSyncBus.pullAfter(0).filter((item) => item.message.messageId === message.messageId)).toHaveLength(1);
  });
});

function handoffRequest(): HandoffRequest {
  return {
    messageId: 'REQ-SYNC-1', correlationId: 'HO-ROOT-1', handoffId: 'HO-ROOT-1', idempotencyKey: 'ME-ROOT-1:4',
    monitoringEventId: 'ME-ROOT-1', monitoringEventVersion: 4, requestedAt: '2026-08-25T02:00:00.000Z',
    requestedBy: { mode: 'user', userId: 'USR-MONITOR-01', ruleIds: [] },
    confirmedFacts: { eventType: 'traffic_accident', location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, lanesTotal: 3, lanesAffected: 2 },
    context: { roadCode: 'G65', direction: 'up', configuredSensitiveFacility: false, configuredCriticalNode: false, trafficSnapshot: { flowVehPerHour: 3600, speedKmh: 35 } },
    evidence: [], conflicts: [], rationale: { level: 'L4', reasons: ['重大事件'] }, simulation: true,
  };
}

function monitoringUpdate(controlEventId: string, sequence: number, expectedVersion: number, overrides: Partial<MonitoringEventUpdate> = {}): MonitoringEventUpdate {
  return {
    messageId: `MM-${sequence}`, correlationId: 'HO-ROOT-1', streamSequence: sequence,
    monitoringEventId: 'ME-ROOT-1', controlEventId, expectedControlEventVersion: expectedVersion,
    monitoringEventVersion: 4 + sequence, occurredAt: `2026-08-25T02:1${sequence}:00.000Z`,
    updateType: 'evidence_added', reason: '补充监测信息', simulation: true, ...overrides,
  };
}

describe('阶段9 监测订正进入智能管控', () => {
  beforeEach(() => { useStore.getState().clearRuntime(); crossModuleSyncBus.reset(); });

  it('证据追加只留痕不生成新版预案，重复消息不重复应用', () => {
    const accepted = useStore.getState().acceptMonitoringHandoff(handoffRequest());
    const eventId = accepted.controlEventId!;
    const beforePlans = useStore.getState().plans.filter((plan) => plan.id === `PLAN-${eventId}`).length;
    const update = monitoringUpdate(eventId, 1, 1, {
      evidence: [{ evidenceId: 'EV-2', kind: 'key_frame', capturedAt: '2026-08-25T02:10:00.000Z', controlledRef: 'controlled://ev-2', archived: true, simulation: true }],
    });
    expect(useStore.getState().applyMonitoringEventUpdate(update).status).toBe('applied');
    expect(useStore.getState().applyMonitoringEventUpdate(update).status).toBe('duplicate');
    expect(useStore.getState().plans.filter((plan) => plan.id === `PLAN-${eventId}`)).toHaveLength(beforePlans);
    expect(useStore.getState().events.find((event) => event.id === eventId)?.monitoringEvidence).toHaveLength(1);
  });

  it('关键事实订正生成新版预案，expectedVersion冲突被拒绝', () => {
    const accepted = useStore.getState().acceptMonitoringHandoff(handoffRequest());
    const eventId = accepted.controlEventId!;
    expect(useStore.getState().applyMonitoringEventUpdate(monitoringUpdate(eventId, 1, 1, {
      updateType: 'facts_corrected', changedFacts: { casualties: 2, lanesAffected: 3 }, reason: '现场确认新增伤员并全幅占道',
    })).status).toBe('applied');
    expect(useStore.getState().plans.filter((plan) => plan.id === `PLAN-${eventId}`).some((plan) => plan.version === 2)).toBe(true);
    expect(useStore.getState().applyMonitoringEventUpdate(monitoringUpdate(eventId, 2, 1))).toMatchObject({ status: 'rejected' });
    expect(useStore.getState().events.find((event) => event.id === eventId)?.controlEventVersion).toBe(2);
  });

  it('误报复核申请不直接证伪，预案作废也不改变事件生命周期', () => {
    const accepted = useStore.getState().acceptMonitoringHandoff(handoffRequest());
    const eventId = accepted.controlEventId!;
    expect(useStore.getState().applyMonitoringEventUpdate(monitoringUpdate(eventId, 1, 1, {
      updateType: 'false_positive_review_requested', reason: '监测员申请复核误报',
    })).status).toBe('applied');
    const event = useStore.getState().events.find((item) => item.id === eventId);
    expect(event?.falsePositive).toBeFalsy();
    expect(event?.finalized).toBeFalsy();
    expect(event?.controlLifecycleStatus).toBe('correction_required');
    useStore.getState().voidPlan(`PLAN-${eventId}`, '重新评估方案');
    expect(useStore.getState().events.find((event) => event.id === eventId)?.controlLifecycleStatus).toBe('correction_required');
  });

  it('只有显式事件级决定生成closureDecision并回写终态', () => {
    const accepted = useStore.getState().acceptMonitoringHandoff(handoffRequest());
    const eventId = accepted.controlEventId!;
    const update = useStore.getState().decideControlEventLifecycle(eventId, 'closed', '现场清撤并恢复通行', 'USR-CONTROL-01');
    expect(update.closureDecision).toMatchObject({ decidedBy: 'USR-CONTROL-01', reason: '现场清撤并恢复通行' });
    expect(useStore.getState().events.find((event) => event.id === eventId)).toMatchObject({ finalized: true, controlLifecycleStatus: 'closed' });
  });
});

