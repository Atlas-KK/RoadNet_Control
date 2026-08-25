import type { ControlEventUpdate, MonitoringEventUpdate } from '../../domain/handoff';

export type CrossModuleSyncEnvelope =
  | { direction: 'monitoring_to_control'; message: MonitoringEventUpdate }
  | { direction: 'control_to_monitoring'; message: ControlEventUpdate };

type MonitoringHandler = (message: MonitoringEventUpdate) => void | Promise<void>;
type ControlHandler = (message: ControlEventUpdate) => void | Promise<void>;

/** MVP本地消息总线：保留全局有序历史，模拟生产消息流的发布、断线和补拉语义。 */
export class CrossModuleSyncBus {
  private sequence = 0;
  private readonly history: CrossModuleSyncEnvelope[] = [];
  private readonly monitoringHandlers = new Set<MonitoringHandler>();
  private readonly controlHandlers = new Set<ControlHandler>();

  nextSequence(): number {
    this.sequence += 1;
    return this.sequence;
  }

  publishMonitoring(message: MonitoringEventUpdate): void {
    this.record({ direction: 'monitoring_to_control', message });
    for (const handler of this.monitoringHandlers) void handler(structuredClone(message));
  }

  publishControl(message: ControlEventUpdate): void {
    this.record({ direction: 'control_to_monitoring', message });
    for (const handler of this.controlHandlers) void handler(structuredClone(message));
  }

  subscribeMonitoring(handler: MonitoringHandler): () => void {
    this.monitoringHandlers.add(handler);
    return () => this.monitoringHandlers.delete(handler);
  }

  subscribeControl(handler: ControlHandler): () => void {
    this.controlHandlers.add(handler);
    return () => this.controlHandlers.delete(handler);
  }

  pullAfter(cursor: number): CrossModuleSyncEnvelope[] {
    return this.history
      .filter((item) => item.message.streamSequence > cursor)
      .sort((left, right) => left.message.streamSequence - right.message.streamSequence)
      .map((item) => structuredClone(item));
  }

  reset(): void {
    this.sequence = 0;
    this.history.length = 0;
  }

  private record(envelope: CrossModuleSyncEnvelope): void {
    const message = envelope.message;
    if (!Number.isSafeInteger(message.streamSequence) || message.streamSequence <= 0) throw new Error('streamSequence必须是正安全整数');
    if (this.history.some((item) => item.message.messageId === message.messageId)) return;
    if (this.history.some((item) => item.message.streamSequence === message.streamSequence)) throw new Error(`重复全局游标：${message.streamSequence}`);
    this.sequence = Math.max(this.sequence, message.streamSequence);
    this.history.push(structuredClone(envelope));
  }
}

export const crossModuleSyncBus = new CrossModuleSyncBus();
