import { describe, expect, it } from 'vitest';
import type { Alarm, AlarmDeliveryReceipt, MonitoringEvent } from '../../domain/monitoring';
import { MemoryMonitoringRepository, MonitoringConstraintError } from './monitoringDb';

function alarm(alarmId: string): Alarm {
  return {
    alarmId, sourceAlarmId: `SRC-${alarmId}`, sourceType: 'video_ai', sourceSystem: 'DEMO-VIDEO-AI',
    eventType: 'abnormal_stop', detectedAt: '2026-08-25T02:00:00.000Z', firstReceivedAt: '2026-08-25T02:00:01.000Z',
    location: { roadCode: 'G65', direction: 'up', deviceId: 'CAM-001' }, rawPayloadRef: `demo://${alarmId}`,
    evidenceIds: [], simulation: true,
  };
}

function receipt(receiptId: string, messageId: string, alarmId: string): AlarmDeliveryReceipt {
  return {
    receiptId, messageId, sourceSystem: 'DEMO-VIDEO-AI', sourceAlarmId: `SRC-${alarmId}`,
    receivedAt: '2026-08-25T02:00:01.000Z', result: 'created', alarmId,
  };
}

function event(version: number, alarmIds: string[]): MonitoringEvent {
  return {
    monitoringEventId: 'ME-INGEST', version, alarmIds, eventType: 'abnormal_stop',
    location: { roadCode: 'G65', direction: 'up' }, suggestedLevel: 'L2', verificationStatus: 'pending',
    lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [], detectedAt: '2026-08-25T02:00:00.000Z',
    updatedAt: '2026-08-25T02:00:01.000Z', simulation: true,
  };
}

describe('阶段11 来源接入事务与演示数据清理', () => {
  it('原子提交Alarm、Receipt、Event和Audit，约束失败不留下半成品', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.commitSourceAlarmIngestion({
      alarm: alarm('ALM-001'), receipt: receipt('RCP-001', 'MSG-001', 'ALM-001'), event: event(1, ['ALM-001']),
      auditEntries: [{ entityId: 'ME-INGEST', entityType: 'event', occurredAt: '2026-08-25T02:00:01.000Z',
        kind: 'source_alarm_created', summary: '来源告警已生成事件', simulation: true }],
    });
    await expect(repository.commitSourceAlarmIngestion({
      alarm: alarm('ALM-002'), receipt: receipt('RCP-002', 'MSG-001', 'ALM-002'),
      event: event(2, ['ALM-001', 'ALM-002']), expectedEventVersion: 1,
      auditEntries: [{ entityId: 'ME-INGEST', entityType: 'event', occurredAt: '2026-08-25T02:00:02.000Z',
        kind: 'source_alarm_merged', summary: '不应提交', simulation: true }],
    })).rejects.toBeInstanceOf(MonitoringConstraintError);

    expect(await repository.getAlarm('ALM-002')).toBeUndefined();
    expect((await repository.getEvent('ME-INGEST'))?.version).toBe(1);
    expect(await repository.listAuditEntries()).toHaveLength(1);
  });

  it('清空演示数据后仓储投影与唯一索引可重新使用', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.commitSourceAlarmIngestion({
      alarm: alarm('ALM-001'), receipt: receipt('RCP-001', 'MSG-001', 'ALM-001'), event: event(1, ['ALM-001']),
      auditEntries: [{ entityId: 'ME-INGEST', entityType: 'event', occurredAt: '2026-08-25T02:00:01.000Z',
        kind: 'source_alarm_created', summary: '来源告警已生成事件', simulation: true }],
    });
    await repository.clearMonitoringDemoData();
    const projection = await repository.loadProjection();
    expect(projection.alarms).toHaveLength(0);
    expect(projection.events).toHaveLength(0);
    expect(projection.auditEntries).toHaveLength(0);
    expect(await repository.getReceiptByMessageId('MSG-001')).toBeUndefined();

    await repository.commitSourceAlarmIngestion({
      alarm: alarm('ALM-001'), receipt: receipt('RCP-NEW', 'MSG-001', 'ALM-001'), event: event(1, ['ALM-001']),
      auditEntries: [],
    });
    expect(await repository.listAlarms()).toHaveLength(1);
  });
});
