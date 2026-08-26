import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '../store';
import { buildDemoScenario } from './adapters/demoScenarios';
import type { DemoScenarioId, MonitoringMessage } from './adapters/monitoringSourceAdapter';
import { evaluateHandoffDecision } from './engine/handoffRules';
import { monitoringEventIdForCorrelation } from './engine/sourceIngestion';
import { MemoryMonitoringRepository } from './services/monitoringDb';
import { createMonitoringStore } from './store';

const NOW = Date.parse('2026-08-25T10:00:00.000Z');

function scenarioMessages(scenarioId: DemoScenarioId, seed: number): MonitoringMessage[] {
  return buildDemoScenario(scenarioId, seed).map((scheduled, index) => ({
    ...structuredClone(scheduled.message), streamSequence: index + 1,
  } as MonitoringMessage));
}

function eventId(scenarioId: DemoScenarioId, seed: number): string {
  return monitoringEventIdForCorrelation(`CORR-${scenarioId}-${seed}`);
}


async function ingestAll(
  store: ReturnType<typeof createMonitoringStore>,
  messages: readonly MonitoringMessage[],
): Promise<void> {
  for (const message of messages) await store.getState().ingestMonitoringMessage(message);
}

async function claim(store: ReturnType<typeof createMonitoringStore>, id: string): Promise<void> {
  const event = store.getState().monitoringEventsById[id]!;
  await store.getState().applyVerificationCommand({ type: 'claim', eventId: id, expectedVersion: event.version });
}

describe('阶段11 六类固定演示场景端到端验收', () => {
  beforeEach(() => useStore.getState().clearRuntime());

  it('异常停车：12条告警聚合为1起L2事件，驶离后关闭', async () => {
    const seed = 101;
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository, { nowMs: () => NOW });
    await ingestAll(store, scenarioMessages('abnormal-stop-repeated', seed));
    expect(await repository.listAlarms()).toHaveLength(12);
    expect(store.getState().monitoringEventsById[eventId('abnormal-stop-repeated', seed)]).toMatchObject({
      suggestedLevel: 'L2', lifecycleStatus: 'closed', alarmIds: expect.arrayContaining([expect.any(String)]),
    });
  });

  it('行人误报：重复检测形成L3建议，人工误报后保留Alarm和评估留痕', async () => {
    const seed = 102;
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository, { nowMs: () => NOW });
    await ingestAll(store, scenarioMessages('pedestrian-false-positive', seed));
    const id = eventId('pedestrian-false-positive', seed);
    expect(store.getState().monitoringEventsById[id]).toMatchObject({ suggestedLevel: 'L3', verificationStatus: 'pending' });
    await claim(store, id);
    const claimed = store.getState().monitoringEventsById[id]!;
    await store.getState().applyVerificationCommand({
      type: 'false_positive', eventId: id, expectedVersion: claimed.version, reason: '复核视频确认洞口阴影误检',
    });
    expect(store.getState().monitoringEventsById[id]?.verificationStatus).toBe('false_positive');
    expect(await repository.listAlarms()).toHaveLength(3);
    expect((await repository.listAssessments()).every((item) => item.result === 'false_positive')).toBe(true);
  });

  it('抛洒物：持续观察收到新告警后提前复核，确认L3并形成接管建议', async () => {
    const seed = 103;
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository, { nowMs: () => NOW });
    const messages = scenarioMessages('road-debris-observation', seed);
    await store.getState().ingestMonitoringMessage(messages[0]!);
    const id = eventId('road-debris-observation', seed);
    await claim(store, id);
    let current = store.getState().monitoringEventsById[id]!;
    await store.getState().applyVerificationCommand({
      type: 'observe', eventId: id, expectedVersion: current.version, reason: '首帧遮挡，等待新关键帧',
    });
    await store.getState().ingestMonitoringMessage(messages[1]!);
    expect(store.getState().monitoringEventsById[id]).toMatchObject({ suggestedLevel: 'L3', verificationStatus: 'pending' });
    await store.getState().ingestMonitoringMessage(messages[2]!);
    await claim(store, id);
    current = store.getState().monitoringEventsById[id]!;
    await store.getState().applyVerificationCommand({
      type: 'confirm', eventId: id, expectedVersion: current.version,
      corrections: { confirmedLevel: 'L3', lanesAffected: 1, lanesTotal: 3, notes: '抛洒物持续存在并引发车辆避让' },
    });
    expect(evaluateHandoffDecision(store.getState().monitoringEventsById[id]!)).toMatchObject({ eligible: true, mode: 'user' });
  });

  it('隧道事故：人工确认L3后由监控员发起接管', async () => {
    const seed = 104;
    const store = createMonitoringStore(new MemoryMonitoringRepository(), { nowMs: () => NOW });
    await ingestAll(store, scenarioMessages('tunnel-accident-l3', seed));
    const id = eventId('tunnel-accident-l3', seed);
    await claim(store, id);
    const current = store.getState().monitoringEventsById[id]!;
    await store.getState().applyVerificationCommand({
      type: 'confirm', eventId: id, expectedVersion: current.version,
      corrections: { confirmedLevel: 'L3', lanesAffected: 2, lanesTotal: 3, vehicleCount: 2, casualties: 0 },
    });
    const result = await store.getState().requestMonitoringHandoff(id);
    expect(result).toMatchObject({ status: 'accepted', controlEventId: expect.any(String) });
    expect(store.getState().monitoringEventsById[id]).toMatchObject({ lifecycleStatus: 'taken_over', controlEventId: result.controlEventId });
    expect(useStore.getState().events.some((event) => event.id === result.controlEventId)).toBe(true);
  });

  it('隧道火灾：AI只建议L4，人工确认后自动接管且不需二次点击', async () => {
    const seed = 105;
    const store = createMonitoringStore(new MemoryMonitoringRepository(), { nowMs: () => NOW });
    await ingestAll(store, scenarioMessages('tunnel-fire-l4', seed));
    const id = eventId('tunnel-fire-l4', seed);
    expect(store.getState().monitoringEventsById[id]).toMatchObject({ suggestedLevel: 'L4', verificationStatus: 'pending' });
    await claim(store, id);
    const current = store.getState().monitoringEventsById[id]!;
    await store.getState().applyVerificationCommand({
      type: 'confirm', eventId: id, expectedVersion: current.version,
      corrections: { confirmedLevel: 'L4', lanesAffected: 3, lanesTotal: 3, notes: '人工确认明火与浓烟' },
    });
    const confirmed = store.getState().monitoringEventsById[id]!;
    expect(confirmed).toMatchObject({ verificationStatus: 'confirmed', lifecycleStatus: 'taken_over', controlEventId: expect.any(String) });
    expect(useStore.getState().events.some((event) => event.id === confirmed.controlEventId)).toBe(true);
    expect(useStore.getState().planningGaps.every((gap) => gap.idempotencyKey.endsWith(':measures'))).toBe(true);
  });

  it('交通拥堵：多次观测保持L2，速度恢复消息关闭事件且不进入接管', async () => {
    const seed = 106;
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository, { nowMs: () => NOW });
    await ingestAll(store, scenarioMessages('traffic-congestion-monitoring', seed));
    const event = store.getState().monitoringEventsById[eventId('traffic-congestion-monitoring', seed)];
    expect(event).toMatchObject({ suggestedLevel: 'L2', lifecycleStatus: 'closed' });
    expect(await repository.listHandoffs()).toHaveLength(0);
  });
});
