import { describe, expect, it } from 'vitest';
import { buildDemoScenario } from './adapters/demoScenarios';
import type { MonitoringMessage } from './adapters/monitoringSourceAdapter';
import { monitoringEventIdForCorrelation } from './engine/sourceIngestion';
import { MemoryMonitoringRepository } from './services/monitoringDb';
import { createMonitoringStore } from './store';

function messages(scenarioId: Parameters<typeof buildDemoScenario>[0], seed: number): MonitoringMessage[] {
  return buildDemoScenario(scenarioId, seed).map((scheduled, index) => ({
    ...structuredClone(scheduled.message), streamSequence: index + 1,
  } as MonitoringMessage));
}

describe('FR-EM-002 / 003 来源消息到Store端到端接入', () => {
  it('异常停车12条告警聚合为1起L2事件，驶离消息解除并关闭', async () => {
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository, { nowMs: () => Date.parse('2026-08-25T10:00:00.000Z') });
    const scenario = messages('abnormal-stop-repeated', 11);
    for (const message of scenario) await store.getState().ingestMonitoringMessage(message);

    const eventId = monitoringEventIdForCorrelation('CORR-abnormal-stop-repeated-11');
    expect(await repository.listAlarms()).toHaveLength(12);
    expect(store.getState().monitoringEventsById[eventId]).toMatchObject({
      alarmIds: expect.arrayContaining([expect.stringContaining('ALM-')]), suggestedLevel: 'L2', lifecycleStatus: 'closed',
    });
    expect(store.getState().monitoringEventsById[eventId]?.alarmIds).toHaveLength(12);
    expect(store.getState().activeEventIds).not.toContain(eventId);
  });

  it('相同messageId重放不覆盖事件新版本或重复创建Alarm', async () => {
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository);
    const first = messages('tunnel-accident-l3', 12)[0]!;
    await store.getState().ingestMonitoringMessage(first);
    const eventId = monitoringEventIdForCorrelation(first.correlationId);
    const version = store.getState().monitoringEventsById[eventId]?.version;
    const result = await store.getState().ingestMonitoringMessage(first);
    expect(result.status).toBe('duplicate');
    expect(await repository.listAlarms()).toHaveLength(1);
    expect(store.getState().monitoringEventsById[eventId]?.version).toBe(version);
  });

  it('持续观察收到新来源告警后释放观察并置顶待复核', async () => {
    const repository = new MemoryMonitoringRepository();
    let now = Date.parse('2026-08-25T10:00:00.000Z');
    const store = createMonitoringStore(repository, { nowMs: () => now });
    store.getState().setCurrentUser('USR-SUPERVISOR-01');
    const scenario = messages('road-debris-observation', 13);
    await store.getState().ingestMonitoringMessage(scenario[0]!);
    const eventId = monitoringEventIdForCorrelation(scenario[0]!.correlationId);
    let event = store.getState().monitoringEventsById[eventId]!;
    await store.getState().applyVerificationCommand({ type: 'claim', eventId, expectedVersion: event.version });
    event = store.getState().monitoringEventsById[eventId]!;
    now += 1_000;
    await store.getState().applyVerificationCommand({ type: 'observe', eventId, expectedVersion: event.version, reason: '等待新关键帧' });
    now += 1_000;
    await store.getState().ingestMonitoringMessage(scenario[1]!);
    expect(store.getState().monitoringEventsById[eventId]).toMatchObject({
      verificationStatus: 'pending', verificationMode: 'manual_review', reviewPriorityAt: expect.any(String),
    });
    expect(store.getState().activeEventIds[0]).toBe(eventId);
  });

  it('隧道火灾源告警生成L4建议但不自动形成人工确认', async () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    const first = messages('tunnel-fire-l4', 14)[0]!;
    await store.getState().ingestMonitoringMessage(first);
    const event = store.getState().monitoringEventsById[monitoringEventIdForCorrelation(first.correlationId)];
    expect(event).toMatchObject({ suggestedLevel: 'L4', verificationStatus: 'pending' });
    expect(event?.confirmedLevel).toBeUndefined();
  });
});
