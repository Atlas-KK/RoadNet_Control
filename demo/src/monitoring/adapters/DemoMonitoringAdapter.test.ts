import { describe, expect, it } from 'vitest';
import { demoCaseById } from '../../data/demoCases';
import { useStore } from '../../store';
import { DemoMonitoringAdapter } from './DemoMonitoringAdapter';
import type { DemoScenarioId, MonitoringMessage, ScenarioScheduler } from './monitoringSourceAdapter';

interface ScheduledJob {
  id: number;
  dueAt: number;
  handler: () => void;
}

class ManualScheduler implements ScenarioScheduler {
  private currentMs = 0;
  private nextId = 1;
  private jobs: ScheduledJob[] = [];

  nowMs(): number {
    return this.currentMs;
  }

  schedule(handler: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.jobs.push({ id, dueAt: this.currentMs + delayMs, handler });
    return id;
  }

  cancel(handle: unknown): void {
    this.jobs = this.jobs.filter((job) => job.id !== handle);
  }

  advanceBy(deltaMs: number): void {
    const target = this.currentMs + deltaMs;
    let guard = 0;
    while (guard++ < 1_000) {
      this.jobs.sort((left, right) => left.dueAt - right.dueAt || left.id - right.id);
      const next = this.jobs[0];
      if (!next || next.dueAt > target) break;
      this.jobs.shift();
      this.currentMs = next.dueAt;
      next.handler();
    }
    if (guard >= 1_000) throw new Error('ManualScheduler疑似无限调度');
    this.currentMs = target;
  }

  flushAll(): void {
    let guard = 0;
    while (this.jobs.length > 0 && guard++ < 1_000) {
      const nextDue = Math.min(...this.jobs.map((job) => job.dueAt));
      this.advanceBy(Math.max(0, nextDue - this.currentMs));
    }
    if (guard >= 1_000) throw new Error('ManualScheduler未能清空任务');
  }
}

function adapterWithManualTime() {
  const scheduler = new ManualScheduler();
  let operationalNow = Date.parse('2026-08-25T00:00:00.000Z');
  const adapter = new DemoMonitoringAdapter(scheduler, { nowMs: () => operationalNow });
  return {
    adapter,
    scheduler,
    advanceOperationalTime: (deltaMs: number) => { operationalNow += deltaMs; },
  };
}

async function runScenario(scenarioId: DemoScenarioId, seed: number): Promise<MonitoringMessage[]> {
  const { adapter, scheduler } = adapterWithManualTime();
  await adapter.connect();
  await adapter.startScenario(scenarioId, seed);
  scheduler.flushAll();
  return adapter.pullAfter(0);
}

describe('阶段3 DemoMonitoringAdapter确定性与播放控制', () => {
  it('同一seed通过适配器产生一致消息序列和连续全局游标', async () => {
    const first = await runScenario('road-debris-observation', 99);
    const second = await runScenario('road-debris-observation', 99);
    expect(first).toEqual(second);
    expect(first.map((message) => message.streamSequence)).toEqual([1, 2, 3]);
  });

  it('重复加载同一场景追加历史并生成独立事件批次', async () => {
    const { adapter, scheduler } = adapterWithManualTime();
    await adapter.connect();
    await adapter.startScenario('pedestrian-false-positive', 77);
    scheduler.flushAll();
    await adapter.startScenario('pedestrian-false-positive', 77);
    scheduler.flushAll();

    const messages = await adapter.pullAfter(0);
    expect(messages.map((message) => message.streamSequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(messages.map((message) => message.correlationId)).size).toBe(2);
    expect((await adapter.queryEvents({ page: 1, pageSize: 10 })).total).toBe(2);
  });
  it('暂停场景不暂停operationalTime，恢复后从剩余延迟继续', async () => {
    const { adapter, scheduler, advanceOperationalTime } = adapterWithManualTime();
    await adapter.connect();
    await adapter.startScenario('abnormal-stop-repeated', 1);
    scheduler.advanceBy(0);
    expect((await adapter.pullAfter(0))).toHaveLength(1);

    const beforePause = adapter.getSnapshot().operationalTimeMs;
    adapter.pause();
    advanceOperationalTime(45_000);
    scheduler.advanceBy(60_000);
    expect((await adapter.pullAfter(0))).toHaveLength(1);
    expect(adapter.getSnapshot().operationalTimeMs - beforePause).toBe(45_000);

    adapter.resume();
    scheduler.advanceBy(19_999);
    expect((await adapter.pullAfter(0))).toHaveLength(1);
    scheduler.advanceBy(1);
    expect((await adapter.pullAfter(0))).toHaveLength(2);
  });

  it('开始、暂停、恢复和重置操作保持幂等状态边界', async () => {
    const { adapter, scheduler } = adapterWithManualTime();
    await adapter.startScenario('pedestrian-false-positive', 8);
    adapter.pause();
    adapter.pause();
    expect(adapter.getSnapshot().playbackState).toBe('paused');
    adapter.resume();
    scheduler.flushAll();
    expect(adapter.getSnapshot().playbackState).toBe('completed');
    await adapter.reset('monitoring_demo');
    expect(adapter.getSnapshot()).toMatchObject({ playbackState: 'idle', streamCursor: 0 });
    expect(await adapter.pullAfter(0)).toEqual([]);
  });

  it('拒绝未知场景、无效seed和非法游标', async () => {
    const { adapter } = adapterWithManualTime();
    await expect(adapter.startScenario('unknown', 1)).rejects.toThrow('未知监测演示场景');
    await expect(adapter.startScenario('tunnel-fire-l4', -1)).rejects.toThrow('seed必须');
    await expect(adapter.pullAfter(-1)).rejects.toThrow('cursor必须');
  });
});

describe('阶段3 订阅、补拉与故障注入', () => {
  it('连接中断期间停止订阅投递但保留消息，恢复后可按游标补拉', async () => {
    const { adapter, scheduler } = adapterWithManualTime();
    const delivered: MonitoringMessage[] = [];
    adapter.subscribe((message) => delivered.push(message));
    await adapter.connect();
    await adapter.startScenario('tunnel-accident-l3', 17);
    scheduler.advanceBy(0);
    expect(delivered).toHaveLength(1);

    adapter.injectFailure('connection_interrupted');
    expect(adapter.getSnapshot().connectionState).toBe('degraded');
    scheduler.advanceBy(8_000);
    expect(delivered).toHaveLength(1);
    expect((await adapter.pullAfter(1)).map((message) => message.streamSequence)).toEqual([2]);

    adapter.injectFailure('connection_restored');
    expect(adapter.getSnapshot().connectionState).toBe('connected');
  });

  it('视频失败保留关键帧和文字降级信息，不伪装真实视频流', async () => {
    const { adapter, scheduler } = adapterWithManualTime();
    adapter.injectFailure('video_failure');
    await adapter.connect();
    await adapter.startScenario('tunnel-fire-l4', 18);
    scheduler.advanceBy(0);
    const first = (await adapter.pullAfter(0))[0];
    expect(first?.kind).toBe('source_alarm');
    if (first?.kind !== 'source_alarm') throw new Error('缺少火灾源告警');
    expect(first.payload.evidence.find((item) => item.kind === 'key_frame')?.available).toBe(true);
    expect(first.payload.evidence.find((item) => item.kind === 'video_clip')?.available).toBe(false);

    adapter.injectFailure('video_restored');
    const status = (await adapter.pullAfter(1))[0];
    expect(status).toMatchObject({ kind: 'evidence_status', payload: { status: 'available', fallback: 'key_frame_and_text' } });
  });

  it('单个订阅者异常不阻断其他订阅者', async () => {
    const { adapter, scheduler } = adapterWithManualTime();
    const delivered: MonitoringMessage[] = [];
    adapter.subscribe(() => { throw new Error('consumer failed'); });
    adapter.subscribe((message) => delivered.push(message));
    await adapter.connect();
    await adapter.startScenario('pedestrian-false-positive', 5);
    scheduler.advanceBy(0);
    expect(delivered).toHaveLength(1);
  });

  it('拒绝未定义故障类型', () => {
    const { adapter } = adapterWithManualTime();
    expect(() => adapter.injectFailure('real-websocket')).toThrow('未知故障类型');
  });
});

describe('阶段3 源事件查询与重置隔离', () => {
  it('按来源消息提供分页摘要和详情，不冒充标准化MonitoringEvent', async () => {
    const { adapter, scheduler } = adapterWithManualTime();
    await adapter.startScenario('abnormal-stop-repeated', 42);
    scheduler.flushAll();
    const page = await adapter.queryEvents({ eventTypes: ['abnormal_stop'], page: 1, pageSize: 10 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ alarmCount: 12, simulation: true, eventType: 'abnormal_stop' });
    const detail = await adapter.getEventDetail(page.items[0]!.eventId);
    expect(detail.messages).toHaveLength(13);
    expect(detail.messages.at(-1)?.kind).toBe('source_clear');
  });

  it('reset monitoring_demo不改变智能管控运行态', async () => {
    useStore.getState().loadDemoCase(demoCaseById('cross-event-diversion'));
    const before = structuredClone({
      simSec: useStore.getState().simSec,
      runtimeSeq: useStore.getState().runtimeSeq,
      events: useStore.getState().events,
      plans: useStore.getState().plans,
      activeDemoTwin: useStore.getState().activeDemoTwin,
    });
    const { adapter, scheduler } = adapterWithManualTime();
    await adapter.startScenario('traffic-congestion-monitoring', 6);
    scheduler.flushAll();
    await adapter.reset('monitoring_demo');
    const after = {
      simSec: useStore.getState().simSec,
      runtimeSeq: useStore.getState().runtimeSeq,
      events: useStore.getState().events,
      plans: useStore.getState().plans,
      activeDemoTwin: useStore.getState().activeDemoTwin,
    };
    expect(after).toEqual(before);
  });

  it('查询分页和不存在详情进行明确校验', async () => {
    const { adapter } = adapterWithManualTime();
    await expect(adapter.queryEvents({ page: 0 })).rejects.toThrow('page必须');
    await expect(adapter.getEventDetail('missing')).rejects.toThrow('模拟源事件不存在');
  });
});
