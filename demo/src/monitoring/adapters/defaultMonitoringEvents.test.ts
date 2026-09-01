import { describe, expect, it } from 'vitest';
import { MONITORING_EVENT_TYPES } from '../../domain/monitoring';
import { DemoMonitoringAdapter } from './DemoMonitoringAdapter';
import {
  DEFAULT_MONITORING_EVENT_COUNT,
  DEFAULT_MONITORING_EVENT_SPECS,
  buildDefaultMonitoringMessages,
  isDefaultMonitoringEventId,
} from './defaultMonitoringEvents';
import { createMonitoringStore } from '../store';
import { MemoryMonitoringRepository } from '../services/monitoringDb';
import { MonitoringDemoRuntime } from '../services/monitoringDemoRuntime';
import { SIMULATED_USERS } from '../permissions';
import { buildMonitoringListItems } from '../selectors';
import { DEFAULT_MONITORING_FILTERS } from '../uiState';

describe('本地模拟默认全类型事件数据', () => {
  it('固定提供24条独立事件，八种类型各三条并绑定不同图片', () => {
    expect(DEFAULT_MONITORING_EVENT_SPECS).toHaveLength(DEFAULT_MONITORING_EVENT_COUNT);
    const countByType = Object.fromEntries(MONITORING_EVENT_TYPES.map((type) => [type, 0]));
    for (const spec of DEFAULT_MONITORING_EVENT_SPECS) countByType[spec.eventType] += 1;
    expect(countByType).toEqual(Object.fromEntries(MONITORING_EVENT_TYPES.map((type) => [type, 3])));

    const messages = buildDefaultMonitoringMessages(Date.parse('2026-09-01T01:00:00.000Z'));
    expect(messages).toHaveLength(24);
    expect(messages.every((message) => message.kind === 'source_alarm' && message.streamSequence === 0)).toBe(true);
    const imageRefs = messages.flatMap((message) => (
      message.kind === 'source_alarm'
        ? message.payload.evidence.filter((item) => item.kind === 'key_frame').map((item) => item.controlledRef)
        : []
    ));
    expect(new Set(imageRefs).size).toBe(24);
    expect(imageRefs.every((reference) => /^\/event-photos\/generated\/[a-z0-9-]+\.webp$/.test(reference))).toBe(true);
    const defaultEventIds = messages.map((message) => `ME-${message.correlationId}`);
    expect(defaultEventIds.every(isDefaultMonitoringEventId)).toBe(true);
    const persistedEventIds = [...defaultEventIds, ...Array.from({ length: 6 }, (_, index) => `ME-HISTORICAL-${index + 1}`)];
    expect(persistedEventIds).toHaveLength(30);
    expect(persistedEventIds.filter(isDefaultMonitoringEventId)).toHaveLength(24);
  });

  it('首次空数据自动加载，重复进入不追加，主动清空后仅手动恢复', async () => {
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository);
    const runtime = new MonitoringDemoRuntime(
      new DemoMonitoringAdapter(),
      store,
      () => Date.parse('2026-09-01T01:00:00.000Z'),
    );

    expect(await runtime.bootstrapDefaultEvents()).toBe(24);
    expect(Object.keys(store.getState().monitoringEventsById)).toHaveLength(24);
    expect(store.getState().activeEventIds).toHaveLength(24);
    expect(Object.values(store.getState().monitoringEventsById).every((event) => event.verificationStatus === 'pending')).toBe(true);
    expect(store.getState().streamCursor).toBe(0);
    expect(await runtime.bootstrapDefaultEvents()).toBe(0);

    await runtime.reset();
    expect(Object.keys(store.getState().monitoringEventsById)).toHaveLength(0);
    expect(await runtime.bootstrapDefaultEvents()).toBe(0);
    expect(await runtime.restoreDefaultEvents()).toBe(24);
    expect(Object.keys(store.getState().monitoringEventsById)).toHaveLength(24);
    runtime.dispose();
  });

  it('默认筛选下四种模拟角色均可加载并看到24个演示案例', async () => {
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository);
    const nowMs = Date.parse('2026-09-01T01:00:00.000Z');
    const runtime = new MonitoringDemoRuntime(
      new DemoMonitoringAdapter(),
      store,
      () => nowMs,
    );

    expect(await runtime.bootstrapDefaultEvents()).toBe(DEFAULT_MONITORING_EVENT_COUNT);
    const state = store.getState();
    const events = Object.values(state.monitoringEventsById);
    const alarms = Object.values(state.alarmsById);

    for (const user of SIMULATED_USERS) {
      const visibleItems = buildMonitoringListItems({
        events,
        alarms,
        handoffs: [],
        filters: structuredClone(DEFAULT_MONITORING_FILTERS),
        sort: 'default_priority',
        user,
        operationalNowMs: nowMs,
      });
      expect(visibleItems, user.displayName).toHaveLength(DEFAULT_MONITORING_EVENT_COUNT);
      const countByType = Object.fromEntries(MONITORING_EVENT_TYPES.map((type) => [type, 0]));
      for (const item of visibleItems) countByType[item.event.eventType] += 1;
      expect(countByType, user.displayName).toEqual(
        Object.fromEntries(MONITORING_EVENT_TYPES.map((type) => [type, 3])),
      );
    }
    runtime.dispose();
  });

  it('已有专项或人工事件时仍补齐默认全类型数据', async () => {
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository);
    const runtime = new MonitoringDemoRuntime(
      new DemoMonitoringAdapter(),
      store,
      () => Date.parse('2026-09-01T01:00:00.000Z'),
    );

    await runtime.submitManualReport({
      eventType: 'traffic_accident',
      location: { roadCode: 'G99', direction: 'up', kilometer: 999.9 },
      notes: '用于验证已有事件时仍会补齐默认数据',
    });
    expect(Object.keys(store.getState().monitoringEventsById)).toHaveLength(1);
    expect(await runtime.bootstrapDefaultEvents()).toBe(24);
    expect(Object.keys(store.getState().monitoringEventsById)).toHaveLength(25);
    expect(await runtime.bootstrapDefaultEvents()).toBe(0);
    runtime.dispose();
  });
});
