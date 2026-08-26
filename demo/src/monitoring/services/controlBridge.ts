import type { HandoffLink, HandoffRequest, HandoffResult } from '../../domain/handoff';

export interface ControlHandoffPort {
  acceptMonitoringHandoff(request: HandoffRequest): HandoffResult | Promise<HandoffResult>;
}

export interface HandoffMappingStore {
  getByIdempotencyKey(key: string): Promise<HandoffLink | undefined>;
  save(link: HandoffLink): Promise<void>;
}

export class ControlBridge {
  private readonly inFlight = new Map<string, Promise<HandoffResult>>();
  private readonly port: ControlHandoffPort;
  private readonly maxAutomaticRetries: number;
  private readonly now: () => string;

  constructor(port: ControlHandoffPort, maxAutomaticRetries = 3, now: () => string = () => new Date().toISOString()) {
    this.port = port;
    this.maxAutomaticRetries = maxAutomaticRetries;
    this.now = now;
  }

  handoff(request: HandoffRequest, mapping: HandoffMappingStore): Promise<HandoffResult> {
    const active = this.inFlight.get(request.idempotencyKey);
    if (active) return active;
    const operation = this.execute(request, mapping).finally(() => this.inFlight.delete(request.idempotencyKey));
    this.inFlight.set(request.idempotencyKey, operation);
    return operation;
  }

  private async execute(request: HandoffRequest, mapping: HandoffMappingStore): Promise<HandoffResult> {
    const existing = await mapping.getByIdempotencyKey(request.idempotencyKey);
    if (existing && ['accepted', 'duplicate'].includes(existing.status) && existing.controlEventId) {
      return {
        messageId: existing.resultMessageId ?? `RESULT-${request.messageId}`,
        correlationId: existing.correlationId ?? request.correlationId,
        handoffId: existing.handoffId, status: 'duplicate', controlEventId: existing.controlEventId,
        controlEventVersion: existing.controlEventVersion, acceptedAt: existing.acceptedAt, retryable: false,
      };
    }
    if (existing?.status === 'rejected' || existing?.status === 'planning_gap' || (existing?.status === 'failed' && !existing.retryable)) {
      return {
        messageId: existing.resultMessageId ?? `RESULT-${request.messageId}`,
        correlationId: existing.correlationId ?? request.correlationId,
        handoffId: existing.handoffId, status: existing.status, controlEventId: existing.controlEventId,
        errorCode: existing.errorCode, errorMessage: existing.errorMessage, retryable: existing.retryable ?? false,
      };
    }
    let retryCount = existing?.retryCount ?? 0;
    let result: HandoffResult | undefined;
    let shouldAttempt = true;
    while (shouldAttempt) {
      try {
        result = await this.port.acceptMonitoringHandoff(request);
      } catch (error) {
        result = {
          messageId: `RESULT-${request.messageId}`, correlationId: request.correlationId, handoffId: request.handoffId,
          status: 'failed', errorCode: 'CONTROL_BRIDGE_UNAVAILABLE',
          errorMessage: error instanceof Error ? error.message : '智能管控接入异常', retryable: true,
        };
      }
      shouldAttempt = result.status === 'failed' && result.retryable && retryCount < this.maxAutomaticRetries;
      if (shouldAttempt) retryCount += 1;
    }
    if (!result) throw new Error('接管请求未执行');
    await mapping.save({
      handoffId: request.handoffId, monitoringEventId: request.monitoringEventId,
      monitoringEventVersion: request.monitoringEventVersion, idempotencyKey: request.idempotencyKey,
      status: result.status, controlEventId: result.controlEventId, requestedAt: request.requestedAt,
      updatedAt: this.now(), retryCount, resultMessageId: result.messageId, correlationId: result.correlationId,
      controlEventVersion: result.controlEventVersion, acceptedAt: result.acceptedAt,
      errorCode: result.errorCode, errorMessage: result.errorMessage, retryable: result.retryable,
      simulation: request.simulation,
    });
    return result;
  }
}
