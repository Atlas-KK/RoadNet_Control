import type {
  ConfirmedEventFacts,
  EventLocation,
  MonitoringEventType,
  MonitoringLevel,
  SourceType,
} from '../../domain/monitoring';

export type DemoScenarioId =
  | 'abnormal-stop-repeated'
  | 'pedestrian-false-positive'
  | 'road-debris-observation'
  | 'tunnel-accident-l3'
  | 'tunnel-fire-l4'
  | 'traffic-congestion-monitoring';

export type DemoFailureKind =
  | 'connection_interrupted'
  | 'connection_restored'
  | 'video_failure'
  | 'video_restored';

export interface SourceEvidenceReference {
  evidenceId: string;
  kind: 'key_frame' | 'video_clip' | 'text' | 'device_snapshot';
  capturedAt: string;
  controlledRef: string;
  available: boolean;
  archived: boolean;
  simulation: true;
}

export interface SourceAlarmPayload {
  scenarioId?: DemoScenarioId;
  sourceAlarmId: string;
  sourceType: SourceType;
  sourceSystem: string;
  eventType: MonitoringEventType;
  eventSubtype?: string;
  detectedAt: string;
  location: EventLocation;
  confidence?: number;
  algorithmVersion?: string;
  modelName?: string;
  rawPayloadRef: string;
  evidence: readonly SourceEvidenceReference[];
  observedFacts: Partial<ConfirmedEventFacts>;
  simulation: true;
}

export interface SourceClearPayload {
  scenarioId: DemoScenarioId;
  sourceSystem: string;
  correlationId: string;
  clearedAt: string;
  reason: string;
  simulation: true;
}

export interface EvidenceStatusPayload {
  scenarioId: DemoScenarioId;
  evidenceId: string;
  status: 'unavailable' | 'available';
  occurredAt: string;
  fallback: 'key_frame_and_text';
  simulation: true;
}

interface MonitoringMessageBase {
  messageId: string;
  correlationId: string;
  streamSequence: number;
  emittedAt: string;
  simulation: true;
}

export interface SourceAlarmMessage extends MonitoringMessageBase {
  kind: 'source_alarm';
  payload: SourceAlarmPayload;
}

export interface SourceClearMessage extends MonitoringMessageBase {
  kind: 'source_clear';
  payload: SourceClearPayload;
}

export interface EvidenceStatusMessage extends MonitoringMessageBase {
  kind: 'evidence_status';
  payload: EvidenceStatusPayload;
}

export type MonitoringMessage = SourceAlarmMessage | SourceClearMessage | EvidenceStatusMessage;
export type MonitoringMessageHandler = (message: MonitoringMessage) => void;

export interface EventQuery {
  eventTypes?: readonly MonitoringEventType[];
  scenarioIds?: readonly DemoScenarioId[];
  page?: number;
  pageSize?: number;
}

/** 适配器源事件摘要，不等同于阶段4标准化后的MonitoringEvent。 */
export interface MonitoringSourceEventSummary {
  eventId: string;
  scenarioId: DemoScenarioId;
  eventType: MonitoringEventType;
  firstDetectedAt: string;
  lastDetectedAt: string;
  alarmCount: number;
  simulation: true;
}

export interface EventPage {
  items: MonitoringSourceEventSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface MonitoringEventDetail extends MonitoringSourceEventSummary {
  messages: MonitoringMessage[];
}

export interface DemoScenarioMetadata {
  scenarioId: DemoScenarioId;
  name: string;
  description: string;
  eventType: MonitoringEventType;
  expectedLevel: MonitoringLevel;
  expectedOutcome: string;
}

export type AdapterConnectionState = 'disconnected' | 'connected' | 'degraded';
export type AdapterPlaybackState = 'idle' | 'running' | 'paused' | 'completed';

export interface DemoAdapterSnapshot {
  connectionState: AdapterConnectionState;
  playbackState: AdapterPlaybackState;
  activeScenarioId?: DemoScenarioId;
  seed?: number;
  streamCursor: number;
  operationalTimeMs: number;
  activeFailures: readonly Exclude<DemoFailureKind, 'connection_restored' | 'video_restored'>[];
}

export interface MonitoringSourceAdapter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startScenario(scenarioId: string, seed: number): Promise<void>;
  pause(): void;
  resume(): void;
  reset(scope: 'monitoring_demo' | 'all_demo'): Promise<void>;
  injectFailure(kind: string): void;
  subscribe(handler: MonitoringMessageHandler): () => void;
  queryEvents(query: EventQuery): Promise<EventPage>;
  getEventDetail(eventId: string): Promise<MonitoringEventDetail>;
  pullAfter(cursor: number): Promise<MonitoringMessage[]>;
}

export interface ScenarioScheduler {
  nowMs(): number;
  schedule(handler: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export class SystemScenarioScheduler implements ScenarioScheduler {
  nowMs(): number {
    return performance.now();
  }

  schedule(handler: () => void, delayMs: number): unknown {
    return globalThis.setTimeout(handler, delayMs);
  }

  cancel(handle: unknown): void {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  }
}
