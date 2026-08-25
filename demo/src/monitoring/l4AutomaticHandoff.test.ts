import { describe, expect, it, vi } from 'vitest';
import type { HandoffRequest } from '../domain/handoff';
import type { MonitoringEvent } from '../domain/monitoring';
import { ControlBridge } from './services/controlBridge';
import { MemoryMonitoringRepository } from './services/monitoringDb';
import { createMonitoringStore } from './store';

describe('阶段8 L4人工确认后自动接管', () => {
  it('AI建议L4不触发，人工确认事务成功后以rule模式自动发起且不自动下发措施', async () => {
    const event: MonitoringEvent = {
      monitoringEventId: 'ME-L4-AUTO', version: 1, alarmIds: [], eventType: 'fire',
      location: { roadCode: 'G65', direction: 'up', kilometer: 1148 }, suggestedLevel: 'L4',
      suggestedLevelReasonCodes: ['TUNNEL_FIRE_CONFIRMED'], verificationStatus: 'pending', lifecycleStatus: 'monitoring',
      observationCount: 0, conflicts: [], detectedAt: '2026-08-25T02:00:00.000Z',
      updatedAt: '2026-08-25T02:00:00.000Z', simulation: true,
    };
    const repository = new MemoryMonitoringRepository(); await repository.putEvent(event);
    const accept = vi.fn(async (request: HandoffRequest) => ({
      messageId: `R-${request.messageId}`, correlationId: request.correlationId, handoffId: request.handoffId,
      status: 'accepted' as const, controlEventId: 'CTRL-L4', acceptedAt: '2026-08-25T02:00:03.000Z', retryable: false,
    }));
    let now = Date.parse('2026-08-25T02:00:01.000Z');
    const store = createMonitoringStore(repository, { nowMs: () => now++ }, new ControlBridge({ acceptMonitoringHandoff: accept }));
    await store.getState().initialize();
    expect(accept).not.toHaveBeenCalled();
    await store.getState().applyVerificationCommand({ type: 'claim', eventId: event.monitoringEventId, expectedVersion: 1 });
    await store.getState().applyVerificationCommand({
      type: 'confirm', eventId: event.monitoringEventId, expectedVersion: 2,
      corrections: { confirmedLevel: 'L4', lanesAffected: 3, lanesTotal: 3, notes: '确认明火和浓烟' },
    });
    expect(accept).toHaveBeenCalledTimes(1);
    expect(accept.mock.calls[0]?.[0].requestedBy.mode).toBe('rule');
    expect(store.getState().monitoringEventsById[event.monitoringEventId]).toMatchObject({
      verificationStatus: 'confirmed', confirmedLevel: 'L4', lifecycleStatus: 'taken_over', controlEventId: 'CTRL-L4',
    });
  });
});
