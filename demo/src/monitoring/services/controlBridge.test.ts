import { describe, expect, it, vi } from 'vitest';
import type { HandoffLink, HandoffRequest } from '../../domain/handoff';
import { ControlBridge, type HandoffMappingStore } from './controlBridge';

const request: HandoffRequest = {
  messageId: 'MSG-1', correlationId: 'HO-1', handoffId: 'HO-1', idempotencyKey: 'KEY-1',
  monitoringEventId: 'ME-1', monitoringEventVersion: 2, requestedAt: '2026-08-25T00:00:00.000Z',
  requestedBy: { mode: 'rule', ruleIds: ['HUMAN_CONFIRMED_L4'] },
  confirmedFacts: { eventType: 'fire', location: { roadCode: 'G65', direction: 'up', kilometer: 1148 } },
  context: { roadCode: 'G65', direction: 'up', configuredSensitiveFacility: false, configuredCriticalNode: false },
  evidence: [], conflicts: [], rationale: { level: 'L4', reasons: ['人工确认L4'] }, simulation: true,
};

function memoryMapping(): HandoffMappingStore & { value?: HandoffLink } {
  return { value: undefined,
    async getByIdempotencyKey(key) { return this.value?.idempotencyKey === key ? this.value : undefined; },
    async save(link) { this.value = link; },
  };
}

describe('ControlBridge', () => {
  it('技术失败自动重试并始终复用同一请求', async () => {
    const accept = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ messageId: 'R-1', correlationId: 'HO-1', handoffId: 'HO-1', status: 'accepted', controlEventId: 'EV-R001', retryable: false });
    const mapping = memoryMapping();
    const result = await new ControlBridge({ acceptMonitoringHandoff: accept }).handoff(request, mapping);
    expect(result.status).toBe('accepted'); expect(accept).toHaveBeenCalledTimes(2);
    expect(accept.mock.calls.every(([value]) => value.idempotencyKey === 'KEY-1')).toBe(true);
    expect(mapping.value?.retryCount).toBe(1);
  });
  it('并发和持久化重放都只调用一次管控入口', async () => {
    const accept = vi.fn(async () => ({ messageId: 'R-1', correlationId: 'HO-1', handoffId: 'HO-1', status: 'accepted' as const, controlEventId: 'EV-R001', retryable: false }));
    const mapping = memoryMapping(); const bridge = new ControlBridge({ acceptMonitoringHandoff: accept });
    const [first, second] = await Promise.all([bridge.handoff(request, mapping), bridge.handoff(request, mapping)]);
    const replay = await bridge.handoff(request, mapping);
    expect([first.controlEventId, second.controlEventId, replay.controlEventId]).toEqual(['EV-R001', 'EV-R001', 'EV-R001']);
    expect(replay.status).toBe('duplicate'); expect(accept).toHaveBeenCalledTimes(1);
  });
});
