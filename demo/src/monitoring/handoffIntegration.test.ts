import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandoffRequest } from '../domain/handoff';
import type { MonitoringEvent } from '../domain/monitoring';
import { useStore } from '../store';
import { ControlBridge } from './services/controlBridge';
import { MemoryMonitoringRepository } from './services/monitoringDb';
import { createMonitoringStore } from './store';

const NOW = Date.parse('2026-08-25T02:00:00.000Z');

function confirmedEvent(level: 'L3' | 'L4' = 'L3'): MonitoringEvent {
  return {
    monitoringEventId: `ME-${level}`, version: 2, alarmIds: [], eventType: level === 'L4' ? 'fire' : 'traffic_accident',
    location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, suggestedLevel: level,
    confirmedLevel: level, suggestedLevelReasonCodes: level === 'L4' ? ['TUNNEL_FIRE_CONFIRMED'] : ['LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT'],
    verificationStatus: 'confirmed', lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [],
    detectedAt: '2026-08-25T01:59:00.000Z', confirmedAt: '2026-08-25T02:00:00.000Z',
    updatedAt: '2026-08-25T02:00:00.000Z', simulation: true,
  };
}

function fullRequest(key = 'KEY-CONTROL'): HandoffRequest {
  return {
    messageId: 'MSG-CONTROL', correlationId: 'HO-CONTROL', handoffId: 'HO-CONTROL', idempotencyKey: key,
    monitoringEventId: 'ME-CONTROL', monitoringEventVersion: 2, requestedAt: '2026-08-25T02:00:00.000Z',
    requestedBy: { mode: 'user', userId: 'USR-MONITOR-01', ruleIds: ['LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT'] },
    confirmedFacts: {
      eventType: 'traffic_accident', location: { roadCode: 'G65', direction: 'up', kilometer: 1148 },
      lanesTotal: 3, lanesAffected: 2, vehicleCount: 2, casualties: 0,
    },
    context: {
      roadCode: 'G65', direction: 'up', configuredSensitiveFacility: false, configuredCriticalNode: false,
      trafficSnapshot: { flowVehPerHour: 1800, speedKmh: 80 },
    },
    evidence: [], conflicts: [], rationale: { level: 'L3', reasons: ['受影响车道数达到阈值'] }, simulation: true,
  };
}

describe('阶段8 监测到智能管控接管闭环', () => {
  beforeEach(() => useStore.getState().clearRuntime());

  it('L3人工接管持久化状态、审计及显式controlEventId，重复点击不重复创建', async () => {
    const repository = new MemoryMonitoringRepository();
    const event = confirmedEvent('L3');
    await repository.putEvent(event);
    const accept = vi.fn(async (request: HandoffRequest) => ({
      messageId: `RESULT-${request.messageId}`, correlationId: request.correlationId, handoffId: request.handoffId,
      status: 'accepted' as const, controlEventId: 'EV-CONTROL-1', controlEventVersion: 1,
      acceptedAt: '2026-08-25T02:00:01.000Z', retryable: false,
    }));
    const store = createMonitoringStore(repository, { nowMs: () => NOW }, new ControlBridge({ acceptMonitoringHandoff: accept }));
    await store.getState().initialize();

    const first = await store.getState().requestMonitoringHandoff(event.monitoringEventId);
    const second = await store.getState().requestMonitoringHandoff(event.monitoringEventId);

    expect(first.controlEventId).toBe('EV-CONTROL-1');
    expect(second.status).toBe('duplicate');
    expect(accept).toHaveBeenCalledTimes(1);
    expect(store.getState().monitoringEventsById[event.monitoringEventId]).toMatchObject({
      lifecycleStatus: 'taken_over', controlEventId: 'EV-CONTROL-1', handoffId: 'HO-ME-L3-V2', version: 5,
    });
    expect(store.getState().monitoringAuditEntries.map((entry) => entry.kind)).toEqual([
      'handoff_requested', 'handoff_started', 'handoff_succeeded',
    ]);
  });

  it('L3暂不接管必须填写理由并留痕', async () => {
    const repository = new MemoryMonitoringRepository();
    const event = confirmedEvent('L3'); await repository.putEvent(event);
    const store = createMonitoringStore(repository, { nowMs: () => NOW }); await store.getState().initialize();
    await expect(store.getState().recordNoHandoffReason(event.monitoringEventId, ' ')).rejects.toThrow('必须填写理由');
    await store.getState().recordNoHandoffReason(event.monitoringEventId, '现场已布控，继续观察视频');
    expect(store.getState().monitoringAuditEntries.at(-1)?.kind).toBe('handoff_declined');
  });

  it('管控服务故障保留核实结果并形成可重试失败，恢复后由班长重试成功', async () => {
    const repository = new MemoryMonitoringRepository();
    const event = confirmedEvent('L3'); await repository.putEvent(event);
    const accept = vi.fn(async (request: HandoffRequest) => ({
      messageId: `RESULT-${request.messageId}`, correlationId: request.correlationId, handoffId: request.handoffId,
      status: 'accepted' as const, controlEventId: 'EV-RECOVERED', controlEventVersion: 1,
      acceptedAt: '2026-08-25T02:02:00.000Z', retryable: false,
    }));
    const store = createMonitoringStore(repository, { nowMs: () => NOW }, new ControlBridge({ acceptMonitoringHandoff: accept }));
    await store.getState().initialize();
    await store.getState().degradeDependency('control');
    const failed = await store.getState().requestMonitoringHandoff(event.monitoringEventId);
    expect(failed).toMatchObject({ status: 'failed', errorCode: 'CONTROL_SERVICE_UNAVAILABLE', retryable: true });
    expect(accept).not.toHaveBeenCalled();
    expect(store.getState().monitoringEventsById[event.monitoringEventId]).toMatchObject({
      verificationStatus: 'confirmed', confirmedLevel: 'L3', lifecycleStatus: 'handoff_failed',
    });

    await store.getState().restoreDependency('control');
    store.getState().setCurrentUser('USR-SUPERVISOR-01');
    const recovered = await store.getState().requestMonitoringHandoff(event.monitoringEventId);
    expect(recovered).toMatchObject({ status: 'accepted', controlEventId: 'EV-RECOVERED' });
    expect(accept).toHaveBeenCalledTimes(1);
  });
  it('智能管控入口同幂等键只创建一个事件，接管措施全部等待人工确认', () => {
    const request = fullRequest();
    const first = useStore.getState().acceptMonitoringHandoff(request);
    const replay = useStore.getState().acceptMonitoringHandoff(request);
    expect(first.status).toBe('accepted'); expect(replay.status).toBe('duplicate');
    expect(useStore.getState().events.filter((event) => event.monitoringHandoffs?.some((link) => link.idempotencyKey === request.idempotencyKey))).toHaveLength(1);
    const plan = useStore.getState().plans.find((item) => item.id === `PLAN-${first.controlEventId}`);
    expect(plan?.measures.every((measure) => measure.runState !== '自动执行' && Object.keys(measure.params).length > 0)).toBe(true);
  });

  it('关键研判参数不足时只创建PlanningGap，不生成事件、预案或Measure', () => {
    const request = fullRequest('KEY-GAP'); request.context.trafficSnapshot = undefined;
    const result = useStore.getState().acceptMonitoringHandoff(request);
    expect(result.status).toBe('accepted');
    expect(useStore.getState().planningGaps).toMatchObject([{ idempotencyKey: 'KEY-GAP', missingFacts: ['交通流量'] }]);
    expect(useStore.getState().events).toHaveLength(0); expect(useStore.getState().plans).toHaveLength(0);
  });
});

