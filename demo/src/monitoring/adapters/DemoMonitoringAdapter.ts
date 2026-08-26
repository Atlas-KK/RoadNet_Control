// FR-EM-002 / FR-EM-005：本地模拟适配器，不代表真实WebSocket或视频流。
import { buildDemoScenario, DEMO_MONITORING_SCENARIOS, isDemoScenarioId, type ScheduledScenarioMessage } from './demoScenarios';
import {
  SystemScenarioScheduler,
  type DemoAdapterSnapshot,
  type DemoFailureKind,
  type DemoScenarioMetadata,
  type EventPage,
  type EventQuery,
  type MonitoringEventDetail,
  type MonitoringMessage,
  type MonitoringMessageHandler,
  type MonitoringSourceAdapter,
  type MonitoringSourceEventSummary,
  type ScenarioScheduler,
} from './monitoringSourceAdapter';
import { SystemOperationalClock, type OperationalClock } from '../services/operationalClock';

type ActiveFailure = 'connection_interrupted' | 'video_failure';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function isFailureKind(value: string): value is DemoFailureKind {
  return value === 'connection_interrupted'
    || value === 'connection_restored'
    || value === 'video_failure'
    || value === 'video_restored';
}

function assertPageValue(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name}必须是正安全整数`);
}

export class DemoMonitoringAdapter implements MonitoringSourceAdapter {
  private readonly scheduler: ScenarioScheduler;
  private readonly operationalClock: OperationalClock;
  private readonly subscribers = new Set<MonitoringMessageHandler>();
  private readonly failures = new Set<ActiveFailure>();
  private connected = false;
  private playbackState: DemoAdapterSnapshot['playbackState'] = 'idle';
  private activeScenarioId?: DemoAdapterSnapshot['activeScenarioId'];
  private seed?: number;
  private schedule: readonly ScheduledScenarioMessage[] = [];
  private nextIndex = 0;
  private lastEmittedOffsetMs = 0;
  private history: MonitoringMessage[] = [];
  private streamCursor = 0;
  private timerHandle?: unknown;
  private timerStartedAtMs = 0;
  private timerRemainingMs = 0;

  constructor(
    scheduler: ScenarioScheduler = new SystemScenarioScheduler(),
    operationalClock: OperationalClock = new SystemOperationalClock(),
  ) {
    this.scheduler = scheduler;
    this.operationalClock = operationalClock;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    // 仅中断消费端投递；上游模拟源继续产生消息，恢复后由pullAfter补拉。
    this.connected = false;
  }

  async startScenario(scenarioId: string, seed: number): Promise<void> {
    if (!isDemoScenarioId(scenarioId)) throw new Error(`未知监测演示场景：${scenarioId}`);
    if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('seed必须是非负安全整数');
    this.stopTimer();
    this.activeScenarioId = scenarioId;
    this.seed = seed;
    this.schedule = buildDemoScenario(scenarioId, seed, !this.failures.has('video_failure'));
    this.nextIndex = 0;
    this.lastEmittedOffsetMs = 0;
    this.history = [];
    this.streamCursor = 0;
    this.playbackState = 'running';
    this.scheduleNext();
  }

  pause(): void {
    if (this.playbackState !== 'running') return;
    if (this.timerHandle !== undefined) {
      const elapsed = Math.max(0, this.scheduler.nowMs() - this.timerStartedAtMs);
      this.timerRemainingMs = Math.max(0, this.timerRemainingMs - elapsed);
      this.scheduler.cancel(this.timerHandle);
      this.timerHandle = undefined;
    }
    this.playbackState = 'paused';
  }

  resume(): void {
    if (this.playbackState !== 'paused') return;
    this.playbackState = 'running';
    if (this.nextIndex >= this.schedule.length) {
      this.playbackState = 'completed';
      return;
    }
    this.armTimer(this.timerRemainingMs);
  }

  async reset(scope: 'monitoring_demo' | 'all_demo'): Promise<void> {
    if (scope !== 'monitoring_demo' && scope !== 'all_demo') throw new Error(`不支持的重置范围：${String(scope)}`);
    // 本适配器只拥有monitoring_demo命名空间；即使收到all_demo也不触碰智能管控Runtime。
    this.stopTimer();
    this.schedule = [];
    this.history = [];
    this.streamCursor = 0;
    this.nextIndex = 0;
    this.lastEmittedOffsetMs = 0;
    this.activeScenarioId = undefined;
    this.seed = undefined;
    this.failures.clear();
    this.playbackState = 'idle';
  }

  injectFailure(kind: string): void {
    if (!isFailureKind(kind)) throw new Error(`未知故障类型：${kind}`);
    if (kind === 'connection_interrupted') {
      this.failures.add(kind);
      return;
    }
    if (kind === 'connection_restored') {
      this.failures.delete('connection_interrupted');
      return;
    }
    if (kind === 'video_failure') {
      const wasActive = this.failures.has(kind);
      this.failures.add(kind);
      if (!wasActive) this.emitEvidenceStatus('unavailable');
      return;
    }
    const wasActive = this.failures.delete('video_failure');
    if (wasActive) this.emitEvidenceStatus('available');
  }

  subscribe(handler: MonitoringMessageHandler): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  async queryEvents(query: EventQuery): Promise<EventPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    assertPageValue('page', page);
    assertPageValue('pageSize', pageSize);

    const summaries = this.sourceEventSummaries()
      .filter((item) => !query.eventTypes || query.eventTypes.includes(item.eventType))
      .filter((item) => !query.scenarioIds || query.scenarioIds.includes(item.scenarioId))
      .sort((left, right) => right.lastDetectedAt.localeCompare(left.lastDetectedAt));
    const start = (page - 1) * pageSize;
    return {
      items: clone(summaries.slice(start, start + pageSize)),
      page,
      pageSize,
      total: summaries.length,
    };
  }

  async getEventDetail(eventId: string): Promise<MonitoringEventDetail> {
    const summary = this.sourceEventSummaries().find((item) => item.eventId === eventId);
    if (!summary) throw new Error(`模拟源事件不存在：${eventId}`);
    return {
      ...clone(summary),
      messages: clone(this.history.filter((message) => message.correlationId === eventId)),
    };
  }

  async pullAfter(cursor: number): Promise<MonitoringMessage[]> {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error('cursor必须是非负安全整数');
    return clone(this.history.filter((message) => message.streamSequence > cursor));
  }

  getSnapshot(): DemoAdapterSnapshot {
    return {
      connectionState: !this.connected
        ? 'disconnected'
        : this.failures.has('connection_interrupted') ? 'degraded' : 'connected',
      playbackState: this.playbackState,
      activeScenarioId: this.activeScenarioId,
      seed: this.seed,
      streamCursor: this.streamCursor,
      operationalTimeMs: this.operationalClock.nowMs(),
      activeFailures: [...this.failures],
    };
  }

  listScenarios(): readonly DemoScenarioMetadata[] {
    return clone(DEMO_MONITORING_SCENARIOS);
  }

  private scheduleNext(): void {
    if (this.playbackState !== 'running') return;
    const next = this.schedule[this.nextIndex];
    if (!next) {
      this.playbackState = 'completed';
      this.timerHandle = undefined;
      return;
    }
    const delay = Math.max(0, next.offsetMs - this.lastEmittedOffsetMs);
    this.armTimer(delay);
  }

  private armTimer(delayMs: number): void {
    this.timerRemainingMs = delayMs;
    this.timerStartedAtMs = this.scheduler.nowMs();
    this.timerHandle = this.scheduler.schedule(() => {
      this.timerHandle = undefined;
      const scheduled = this.schedule[this.nextIndex];
      if (!scheduled || this.playbackState !== 'running') return;
      this.lastEmittedOffsetMs = scheduled.offsetMs;
      this.nextIndex += 1;
      this.emit(scheduled.message);
      this.scheduleNext();
    }, delayMs);
  }

  private stopTimer(): void {
    if (this.timerHandle !== undefined) this.scheduler.cancel(this.timerHandle);
    this.timerHandle = undefined;
    this.timerRemainingMs = 0;
  }

  private emit(template: MonitoringMessage): void {
    const message = clone({ ...template, streamSequence: ++this.streamCursor } as MonitoringMessage);
    this.history.push(message);
    if (!this.connected || this.failures.has('connection_interrupted')) return;
    for (const subscriber of this.subscribers) {
      try {
        subscriber(clone(message));
      } catch (error) {
        // 单个消费端异常不得阻断模拟源及其他订阅者。
        void error;
      }
    }
  }

  private emitEvidenceStatus(status: 'unavailable' | 'available'): void {
    if (!this.activeScenarioId || this.seed === undefined) return;
    const occurredAt = new Date(this.operationalClock.nowMs()).toISOString();
    this.emit({
      kind: 'evidence_status',
      messageId: `MSG-${this.activeScenarioId}-${this.seed}-VIDEO-${status}-${this.streamCursor + 1}`,
      correlationId: `CORR-${this.activeScenarioId}-${this.seed}`,
      streamSequence: 0,
      emittedAt: occurredAt,
      simulation: true,
      payload: {
        scenarioId: this.activeScenarioId,
        evidenceId: `EVD-${this.activeScenarioId}-VIDEO`,
        status,
        occurredAt,
        fallback: 'key_frame_and_text',
        simulation: true,
      },
    });
  }

  private sourceEventSummaries(): MonitoringSourceEventSummary[] {
    const alarms = this.history.filter((message) => message.kind === 'source_alarm');
    const grouped = new Map<string, typeof alarms>();
    for (const alarm of alarms) {
      const group = grouped.get(alarm.correlationId) ?? [];
      group.push(alarm);
      grouped.set(alarm.correlationId, group);
    }
    return [...grouped.entries()].map(([eventId, messages]) => {
      const first = messages[0];
      const last = messages.at(-1);
      if (!first || !last) throw new Error('模拟源事件摘要缺少告警');
      if (!first.payload.scenarioId) throw new Error('模拟源事件摘要缺少场景标识');
      return {
        eventId,
        scenarioId: first.payload.scenarioId,
        eventType: first.payload.eventType,
        firstDetectedAt: first.payload.detectedAt,
        lastDetectedAt: last.payload.detectedAt,
        alarmCount: messages.length,
        simulation: true,
      };
    });
  }
}
