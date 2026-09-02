// FR-EM-002 / FR-EM-011：模拟适配器与监测Store之间的运行编排，不代表真实WebSocket。
import type { StoreApi, UseBoundStore } from 'zustand';
import type { ConfirmedEventFacts, EventLocation, MonitoringEventType } from '../../domain/monitoring';
import { DemoMonitoringAdapter } from '../adapters/DemoMonitoringAdapter';
import { buildDefaultMonitoringMessages } from '../adapters/defaultMonitoringEvents';
import type {
  DemoAdapterSnapshot,
  DemoScenarioMetadata,
  MonitoringMessage,
  MonitoringSourceAdapter,
} from '../adapters/monitoringSourceAdapter';
import { useMonitoringStore, type MonitoringMessageIngestionResult, type MonitoringState } from '../store';

export interface ManualMonitoringReportInput {
  eventType: MonitoringEventType;
  location: EventLocation;
  notes: string;
  lanesAffected?: number;
  lanesTotal?: number;
  vehicleCount?: number;
  casualties?: number;
  hazardousMaterials?: boolean;
  flowVehPerHour?: number;
  speedKmh?: number;
}

export interface MonitoringDemoRuntimeSnapshot extends DemoAdapterSnapshot {
  processing: boolean;
  lastError?: string;
}

function assertManualReportInput(input: ManualMonitoringReportInput): void {
  if (!input.location.roadCode.trim()) throw new Error('人工补报路线不能为空');
  const kilometer = input.location.kilometer;
  if (typeof kilometer !== 'number' || !Number.isFinite(kilometer) || kilometer < 0) {
    throw new Error('人工补报桩号必须是非负数');
  }
  const integerFields: ReadonlyArray<[string, number | undefined]> = [
    ['影响车道数', input.lanesAffected],
    ['总车道数', input.lanesTotal],
    ['涉及车辆数', input.vehicleCount],
    ['伤亡人数', input.casualties],
  ];
  for (const [label, value] of integerFields) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) throw new Error(`${label}必须是非负整数`);
  }
  if (input.lanesTotal !== undefined && input.lanesTotal < 1) throw new Error('总车道数必须大于0');
  if (input.lanesAffected !== undefined && input.lanesTotal !== undefined && input.lanesAffected > input.lanesTotal) {
    throw new Error('影响车道数不能大于总车道数');
  }
  for (const [label, value] of [['流量', input.flowVehPerHour], ['车速', input.speedKmh]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(`${label}必须是非负数`);

  }
}

type MonitoringStore = UseBoundStore<StoreApi<MonitoringState>>;

export class MonitoringDemoRuntime {
  private readonly listeners = new Set<() => void>();
  private unsubscribeSource?: () => void;
  private queue: Promise<void> = Promise.resolve();
  private processing = false;
  private pendingCount = 0;
  private lastError?: string;
  private manualSequence = 0;
  private defaultDatasetSuppressed = false;
  private readonly adapter: MonitoringSourceAdapter & {
    getSnapshot(): DemoAdapterSnapshot;
    listScenarios(): readonly DemoScenarioMetadata[];
  };
  private readonly store: MonitoringStore;
  private readonly nowMs: () => number;

  constructor(
    adapter: MonitoringSourceAdapter & {
      getSnapshot(): DemoAdapterSnapshot;
      listScenarios(): readonly DemoScenarioMetadata[];
    } = new DemoMonitoringAdapter(),
    store: MonitoringStore = useMonitoringStore,
    nowMs: () => number = () => Date.now(),
  ) {
    this.adapter = adapter;
    this.store = store;
    this.nowMs = nowMs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): MonitoringDemoRuntimeSnapshot {
    return { ...this.adapter.getSnapshot(), processing: this.processing, lastError: this.lastError };
  }

  listScenarios(): readonly DemoScenarioMetadata[] {
    return this.adapter.listScenarios();
  }

  async connect(): Promise<void> {
    await this.store.getState().initialize();
    if (!this.unsubscribeSource) {
      this.unsubscribeSource = this.adapter.subscribe((message) => this.enqueue(message));
    }
    await this.adapter.connect();
    this.store.getState().setConnectionState('connected');
    this.notifySoon();
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
    this.store.getState().setConnectionState('disconnected');
    this.notifySoon();
  }

  async startScenario(scenarioId: string, seed: number): Promise<void> {
    this.lastError = undefined;
    await this.connect();
    await this.adapter.startScenario(scenarioId, seed);
    this.notifySoon();
  }

  async bootstrapDefaultEvents(force = false): Promise<number> {
    await this.connect();
    if (!force && this.defaultDatasetSuppressed) return 0;

    this.defaultDatasetSuppressed = false;
    let created = 0;
    for (const message of buildDefaultMonitoringMessages(this.nowMs())) {
      const result = await this.enqueueAndWait(message);
      if (result.status === 'created') created += 1;
    }
    this.notifySoon();
    return created;
  }

  async restoreDefaultEvents(): Promise<number> {
    this.defaultDatasetSuppressed = false;
    return this.bootstrapDefaultEvents(true);
  }

  pause(): void {
    this.adapter.pause();
    this.notifySoon();
  }

  resume(): void {
    this.adapter.resume();
    this.notifySoon();
  }

  async interruptConnection(): Promise<void> {
    this.adapter.injectFailure('connection_interrupted');
    this.store.getState().setConnectionState('degraded');
    this.notifySoon();
  }

  async restoreConnection(): Promise<void> {
    this.store.getState().setConnectionState('connecting');
    this.adapter.injectFailure('connection_restored');
    await this.adapter.connect();
    const cursor = this.store.getState().streamCursor;
    const missed = (await this.adapter.pullAfter(cursor)).sort((left, right) => left.streamSequence - right.streamSequence);
    for (const message of missed) await this.enqueueAndWait(message);
    this.store.getState().setConnectionState('connected');
    this.notifySoon();
  }

  async injectVideoFailure(failed: boolean): Promise<void> {
    this.adapter.injectFailure(failed ? 'video_failure' : 'video_restored');
    if (failed) {
      await this.store.getState().degradeDependency('video', '模拟视频服务不可用，已保留事件卡片和受控证据引用');
    } else {
      await this.store.getState().restoreDependency('video');
    }
    this.notifySoon();
  }

  async reset(): Promise<void> {
    await this.waitForIdle();
    await this.adapter.reset('monitoring_demo');
    await this.store.getState().resetMonitoringDemoData();
    this.lastError = undefined;
    this.manualSequence = 0;
    this.defaultDatasetSuppressed = true;
    this.notifySoon();
  }

  async submitManualReport(input: ManualMonitoringReportInput): Promise<void> {
    assertManualReportInput(input);
    await this.connect();
    const timestamp = this.nowMs();
    if (!Number.isFinite(timestamp)) throw new Error('人工补报时间无效');
    const token = `${timestamp}-${++this.manualSequence}`;
    const occurredAt = new Date(timestamp).toISOString();
    const correlationId = `CORR-MANUAL-${token}`;
    const observedFacts: Partial<ConfirmedEventFacts> = {
      eventType: input.eventType,
      location: input.location,
      notes: input.notes,
      flowVehPerHour: input.flowVehPerHour,
      speedKmh: input.speedKmh,
      lanesAffected: input.lanesAffected,
      lanesTotal: input.lanesTotal,
      vehicleCount: input.vehicleCount,
      casualties: input.casualties,
      hazardousMaterials: input.hazardousMaterials,
    };
    const message: MonitoringMessage = {
      kind: 'source_alarm', messageId: `MSG-MANUAL-${token}`, correlationId,
      // 人工补报不属于适配器重放日志，复用当前检查点，避免跳过随后到达的上游序号。
      streamSequence: this.store.getState().streamCursor, emittedAt: occurredAt, simulation: true,
      payload: {
        sourceAlarmId: `SRC-MANUAL-${token}`, sourceType: 'manual_report', sourceSystem: 'DEMO-MANUAL-REPORT',
        eventType: input.eventType, detectedAt: occurredAt, location: structuredClone(input.location),
        rawPayloadRef: `demo-manual://${token}`, evidence: [{
          evidenceId: `EVD-MANUAL-${token}-TEXT`, kind: 'text', capturedAt: occurredAt,
          controlledRef: `demo-manual://${token}/text`, available: true, archived: false, simulation: true,
        }], observedFacts, simulation: true,
      },
    };
    await this.enqueueAndWait(message);
  }

  async waitForIdle(): Promise<void> {
    await this.queue;
  }

  dispose(): void {
    this.unsubscribeSource?.();
    this.unsubscribeSource = undefined;
    this.listeners.clear();
  }

  private enqueue(message: MonitoringMessage): void {
    void this.enqueueAndWait(message).catch(() => undefined);
  }

  private enqueueAndWait(message: MonitoringMessage): Promise<MonitoringMessageIngestionResult> {
    this.pendingCount += 1;
    this.processing = true;
    this.notifySoon();
    const operation = this.queue.then(
      () => this.store.getState().ingestMonitoringMessage(message),
    );
    this.queue = operation.then(() => undefined, () => undefined);
    return operation
      .then((result) => {
        this.lastError = undefined;
        return result;
      })
      .catch((error: unknown) => {
        this.lastError = error instanceof Error ? error.message : '监测消息处理失败';
        this.store.getState().setConnectionState('degraded');
        throw error;
      })
      .finally(() => {
        this.pendingCount -= 1;
        this.processing = this.pendingCount > 0;
        this.notifySoon();
      });
  }

  private notifySoon(): void {
    queueMicrotask(() => {
      for (const listener of this.listeners) listener();
    });
  }
}

export const monitoringDemoRuntime = new MonitoringDemoRuntime();
