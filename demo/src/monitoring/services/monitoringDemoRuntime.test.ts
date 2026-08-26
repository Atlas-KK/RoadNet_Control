import { describe, expect, it } from 'vitest';
import { DemoMonitoringAdapter } from '../adapters/DemoMonitoringAdapter';
import type { ScenarioScheduler } from '../adapters/monitoringSourceAdapter';
import { monitoringEventIdForCorrelation } from '../engine/sourceIngestion';
import { MemoryMonitoringRepository } from './monitoringDb';
import { createMonitoringStore } from '../store';
import { MonitoringDemoRuntime } from './monitoringDemoRuntime';

interface Job { id: number; dueAt: number; handler: () => void }

class ManualScheduler implements ScenarioScheduler {
  private currentMs = 0;
  private nextId = 1;
  private jobs: Job[] = [];
  nowMs(): number { return this.currentMs; }
  schedule(handler: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.jobs.push({ id, dueAt: this.currentMs + delayMs, handler });
    return id;
  }
  cancel(handle: unknown): void { this.jobs = this.jobs.filter((job) => job.id !== handle); }
  advanceBy(deltaMs: number): void {
    const target = this.currentMs + deltaMs;
    let guard = 0;
    while (guard++ < 1000) {
      this.jobs.sort((a, b) => a.dueAt - b.dueAt || a.id - b.id);
      const next = this.jobs[0];
      if (!next || next.dueAt > target) break;
      this.jobs.shift(); this.currentMs = next.dueAt; next.handler();
    }
    this.currentMs = target;
  }
  flushAll(): void {
    while (this.jobs.length) this.advanceBy(Math.max(0, Math.min(...this.jobs.map((job) => job.dueAt)) - this.currentMs));
  }
}

describe('AC-23 模拟源断线恢复端到端', () => {
  it('断线期间本地核实不被补拉覆盖，恢复按游标补齐且重放幂等', async () => {
    const scheduler = new ManualScheduler();
    let now = Date.parse('2026-08-25T10:00:00.000Z');
    const adapter = new DemoMonitoringAdapter(scheduler, { nowMs: () => now });
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository, { nowMs: () => now });
    const runtime = new MonitoringDemoRuntime(adapter, store, () => now);

    await runtime.startScenario('tunnel-accident-l3', 21);
    scheduler.advanceBy(0);
    await runtime.waitForIdle();
    const eventId = monitoringEventIdForCorrelation('CORR-tunnel-accident-l3-21');
    let event = store.getState().monitoringEventsById[eventId]!;
    await runtime.submitManualReport({
      eventType: 'road_debris',
      location: { roadCode: 'G65', direction: 'up', kilometer: 300 },
      lanesAffected: 1, lanesTotal: 3, flowVehPerHour: 1600, speedKmh: 45,
      notes: '断线期间人工补报路面抛洒物',
    });
    expect(store.getState().streamCursor).toBe(1);

    await store.getState().applyVerificationCommand({ type: 'claim', eventId, expectedVersion: event.version });
    expect(store.getState().monitoringEventsById[eventId]?.verificationOwnerId).toBe('USR-MONITOR-01');

    await runtime.interruptConnection();
    now += 20_000;
    scheduler.flushAll();
    expect(store.getState().streamCursor).toBe(1);
    await runtime.restoreConnection();
    await runtime.waitForIdle();

    event = store.getState().monitoringEventsById[eventId]!;
    expect(event.alarmIds).toHaveLength(2);
    expect(event).toMatchObject({ verificationStatus: 'verifying', verificationOwnerId: 'USR-MONITOR-01' });
    expect(store.getState().streamCursor).toBe(2);
    await runtime.restoreConnection();
    expect((await repository.listAlarms())).toHaveLength(3);
    runtime.dispose();
  });

  it('补拉写入失败时恢复操作拒绝且连接保持降级', async () => {
    class ToggleFailureRepository extends MemoryMonitoringRepository {
      fail = false;
      override async commitSourceAlarmIngestion(...args: Parameters<MemoryMonitoringRepository['commitSourceAlarmIngestion']>) {
        if (this.fail) throw new Error('模拟补拉写入失败');
        return super.commitSourceAlarmIngestion(...args);
      }
    }
    const scheduler = new ManualScheduler();
    const adapter = new DemoMonitoringAdapter(scheduler, { nowMs: () => Date.parse('2026-08-25T10:00:00.000Z') });
    const repository = new ToggleFailureRepository();
    const store = createMonitoringStore(repository);
    const runtime = new MonitoringDemoRuntime(adapter, store);

    await runtime.startScenario('tunnel-accident-l3', 22);
    scheduler.advanceBy(0);
    await runtime.waitForIdle();
    await runtime.interruptConnection();
    scheduler.flushAll();
    repository.fail = true;
    await expect(runtime.restoreConnection()).rejects.toThrow('模拟补拉写入失败');
    expect(store.getState().connectionState).toBe('degraded');
    expect(runtime.getSnapshot().lastError).toBe('模拟补拉写入失败');
    runtime.dispose();
  });

  it('人工补报通过同一标准化入口生成待核实模拟事件', async () => {
    const repository = new MemoryMonitoringRepository();
    const store = createMonitoringStore(repository);
    const runtime = new MonitoringDemoRuntime(new DemoMonitoringAdapter(), store, () => Date.parse('2026-08-25T10:00:00.000Z'));
    await runtime.submitManualReport({
      eventType: 'traffic_accident', location: { roadCode: 'G65', direction: 'up', kilometer: 1180 },
      lanesAffected: 1, lanesTotal: 3, notes: '人工巡查发现两车轻微碰撞',
    });
    const alarms = await repository.listAlarms();
    expect(alarms).toHaveLength(1);
    expect(alarms[0]).toMatchObject({ sourceType: 'manual_report', simulation: true });
    expect(Object.values(store.getState().monitoringEventsById)[0]).toMatchObject({ verificationStatus: 'pending', simulation: true });
    runtime.dispose();
  });

  it('仓储写入失败会向调用方传播、保留表单错误并标记连接降级', async () => {
    class FailingCommitRepository extends MemoryMonitoringRepository {
      override async commitSourceAlarmIngestion(): Promise<never> {
        throw new Error('模拟仓储写入失败');
      }
    }
    const store = createMonitoringStore(new FailingCommitRepository());
    const runtime = new MonitoringDemoRuntime(new DemoMonitoringAdapter(), store, () => Date.parse('2026-08-25T10:00:00.000Z'));

    await expect(runtime.submitManualReport({
      eventType: 'traffic_accident', location: { roadCode: 'G65', direction: 'up', kilometer: 1180 },
      lanesAffected: 1, lanesTotal: 3, notes: '写入失败回归',
    })).rejects.toThrow('模拟仓储写入失败');
    expect(store.getState().connectionState).toBe('degraded');
    expect(runtime.getSnapshot().lastError).toBe('模拟仓储写入失败');
    runtime.dispose();
  });
});
