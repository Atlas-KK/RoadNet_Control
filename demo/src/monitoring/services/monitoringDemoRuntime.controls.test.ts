import { describe, expect, it } from 'vitest';
import { DemoMonitoringAdapter } from '../adapters/DemoMonitoringAdapter';
import { buildDemoScenario } from '../adapters/demoScenarios';
import type { MonitoringMessage } from '../adapters/monitoringSourceAdapter';
import { createMonitoringStore } from '../store';
import { MemoryMonitoringRepository } from './monitoringDb';
import { MonitoringDemoRuntime } from './monitoringDemoRuntime';

describe('阶段11 演示运行时控制边界', () => {
  it('无活动场景时模拟视频故障仍会切换正式依赖降级状态', async () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    const runtime = new MonitoringDemoRuntime(new DemoMonitoringAdapter(), store);
    await runtime.injectVideoFailure(true);
    expect(store.getState().dependencyHealth.video).toMatchObject({ availability: 'degraded' });
    await runtime.injectVideoFailure(false);
    expect(store.getState().dependencyHealth.video).toMatchObject({ availability: 'available' });
    runtime.dispose();
  });

  it('存在已关闭历史事件时也必须先清空，防止新场景游标与旧投影叠加', async () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    const runtime = new MonitoringDemoRuntime(new DemoMonitoringAdapter(), store);
    const messages = buildDemoScenario('abnormal-stop-repeated', 301).map((scheduled, index) => ({
      ...structuredClone(scheduled.message), streamSequence: index + 1,
    } as MonitoringMessage));
    for (const message of messages) await store.getState().ingestMonitoringMessage(message);
    expect(store.getState().activeEventIds).toHaveLength(0);
    expect(Object.keys(store.getState().monitoringEventsById)).toHaveLength(1);
    await expect(runtime.startScenario('tunnel-accident-l3', 302)).rejects.toThrow('必须先清空');
    runtime.dispose();
  });
});
