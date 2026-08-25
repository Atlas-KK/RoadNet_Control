import { describe, expect, it } from 'vitest';
import type { Alarm, AlarmDeliveryReceipt, MonitoringEvent } from '../../domain/monitoring';
import {
  createDefaultMonitoringRepository,
  MemoryMonitoringRepository,
  MONITORING_DB_NAME,
  MONITORING_DB_SCHEMA,
  MONITORING_DB_VERSION,
  MonitoringConstraintError,
  MonitoringVersionConflictError,
  upgradeMonitoringDatabase,
} from './monitoringDb';

const alarm = (id: string, sourceAlarmId = id): Alarm => ({
  alarmId: id,
  sourceAlarmId,
  sourceType: 'video_ai',
  sourceSystem: 'demo-video-ai',
  eventType: 'abnormal_stop',
  detectedAt: '2026-08-25T02:00:00.000Z',
  firstReceivedAt: '2026-08-25T02:00:01.000Z',
  location: { roadCode: 'G65', direction: 'up', deviceId: 'CAM-1195' },
  rawPayloadRef: `demo://alarm/${id}`,
  evidenceIds: [],
  simulation: true,
});

const receipt = (id: string, messageId = id): AlarmDeliveryReceipt => ({
  receiptId: id,
  messageId,
  sourceSystem: 'demo-video-ai',
  sourceAlarmId: 'SRC-001',
  receivedAt: '2026-08-25T02:00:01.000Z',
  result: 'created',
  alarmId: 'ALM-001',
});

const event = (version: number, status: MonitoringEvent['lifecycleStatus'] = 'monitoring'): MonitoringEvent => ({
  monitoringEventId: 'ME-001',
  version,
  alarmIds: ['ALM-001'],
  eventType: 'abnormal_stop',
  location: { roadCode: 'G65', direction: 'up' },
  suggestedLevel: 'L2',
  verificationStatus: 'pending',
  lifecycleStatus: status,
  observationCount: 0,
  conflicts: [],
  detectedAt: '2026-08-25T02:00:00.000Z',
  updatedAt: `2026-08-25T02:00:0${version}.000Z`,
  simulation: true,
});

class RecordingNameList {
  private readonly names: Set<string>;

  constructor(names: Set<string>) { this.names = names; }
  contains(name: string): boolean { return this.names.has(name); }
}

class RecordingStore {
  readonly indexes = new Map<string, { keyPath: string | string[]; unique: boolean }>();
  readonly indexNames = new RecordingNameList(new Set<string>());

  createIndex(name: string, keyPath: string | string[], options?: IDBIndexParameters): void {
    this.indexes.set(name, { keyPath, unique: options?.unique ?? false });
    (this.indexNames as unknown as { names: Set<string> }).names.add(name);
  }
}

class RecordingDatabase {
  readonly stores = new Map<string, RecordingStore>();
  readonly objectStoreNames = new RecordingNameList(new Set<string>());

  createObjectStore(name: string): RecordingStore {
    const store = new RecordingStore();
    this.stores.set(name, store);
    (this.objectStoreNames as unknown as { names: Set<string> }).names.add(name);
    return store;
  }
}

describe('FR-EM-011 IndexedDB Schema', () => {
  it('使用独立数据库和固定版本', () => {
    expect(MONITORING_DB_NAME).toBe('roadgov-monitoring-mvp');
    expect(MONITORING_DB_VERSION).toBe(2);
    expect(MONITORING_DB_SCHEMA).toHaveLength(9);
  });

  it('升级时创建全部对象仓和索引', () => {
    const database = new RecordingDatabase();
    upgradeMonitoringDatabase(database as unknown as IDBDatabase);
    expect([...database.stores.keys()]).toEqual(MONITORING_DB_SCHEMA.map((store) => store.name));
    expect(database.stores.get('alarms')?.indexes.get('sourceSystemSourceAlarmId')?.unique).toBe(true);
    expect(database.stores.get('receipts')?.indexes.get('messageId')?.unique).toBe(true);
    expect(database.stores.get('handoffs')?.indexes.get('idempotencyKey')?.unique).toBe(true);
    expect(database.stores.get('syncInbox')?.indexes.get('streamSequence')?.unique).toBe(true);
  });

  it('运行时没有IndexedDB时显式创建内存降级仓储', () => {
    expect(createDefaultMonitoringRepository(undefined).kind).toBe('memory');
  });
});

describe('FR-EM-011 监测仓储契约', () => {
  it('支持Alarm增删查投影且读取结果继续保持不可变', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.addAlarm(alarm('ALM-001'));
    const loaded = await repository.getAlarm('ALM-001');
    expect(loaded?.sourceAlarmId).toBe('ALM-001');
    expect(Object.isFrozen(loaded)).toBe(true);
    expect(await repository.listAlarms()).toHaveLength(1);
  });

  it('messageId唯一索引阻止重复投递回执', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.addReceipt(receipt('RCP-001', 'MSG-001'));
    await expect(repository.addReceipt(receipt('RCP-002', 'MSG-001')))
      .rejects.toBeInstanceOf(MonitoringConstraintError);
    expect((await repository.getReceiptByMessageId('MSG-001'))?.receiptId).toBe('RCP-001');
  });

  it('同一来源告警的不同messageId可分别保存回执', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.addReceipt(receipt('RCP-001', 'MSG-001'));
    await repository.addReceipt(receipt('RCP-002', 'MSG-002'));
    expect((await repository.getReceiptByMessageId('MSG-002'))?.receiptId).toBe('RCP-002');
  });

  it('Alarm与Receipt原子写入失败时不留下半成品', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.addReceipt(receipt('RCP-EXISTING', 'MSG-001'));
    await expect(repository.addAlarmWithReceipt(alarm('ALM-001'), receipt('RCP-002', 'MSG-001')))
      .rejects.toBeInstanceOf(MonitoringConstraintError);
    expect(await repository.getAlarm('ALM-001')).toBeUndefined();
  });

  it('expectedVersion阻止旧版本覆盖新事件', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event(1));
    await repository.putEvent(event(2), 1);
    await expect(repository.putEvent(event(3), 1)).rejects.toBeInstanceOf(MonitoringVersionConflictError);
    expect((await repository.getEvent('ME-001'))?.version).toBe(2);
  });

  it('活跃投影排除resolved与closed事件', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event(1, 'monitoring'));
    await repository.putEvent({ ...event(2, 'closed'), monitoringEventId: 'ME-002' });
    expect((await repository.listActiveEvents()).map((item) => item.monitoringEventId)).toEqual(['ME-001']);
  });

  it('审计记录只追加并由仓储分配顺序号', async () => {
    const repository = new MemoryMonitoringRepository();
    const first = await repository.appendAudit({
      entityId: 'ME-001',
      entityType: 'event',
      occurredAt: '2026-08-25T02:00:00.000Z',
      kind: 'projection_loaded',
      summary: '载入监测投影',
      simulation: true,
    });
    const second = await repository.appendAudit({ ...first, seq: undefined, kind: 'projection_refreshed' });
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });

  it('核实事务原子提交事件、任务、AlarmAssessment和审计', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event(1));
    const nextEvent = {
      ...event(2),
      verificationStatus: 'confirmed' as const,
      confirmedLevel: 'L2' as const,
      confirmedAt: '2026-08-25T02:01:00.000Z',
    };
    await repository.commitVerificationTransition({
      expectedEventVersion: 1,
      event: nextEvent,
      task: {
        taskId: 'VT-ME-001', eventId: 'ME-001', expectedEventVersion: 2,
        status: 'completed', updatedAt: '2026-08-25T02:01:00.000Z',
      },
      assessments: [{
        assessmentId: 'ASM-001', alarmId: 'ALM-001', result: 'valid', reason: '人工确认',
        assessedBy: 'USR-MONITOR-01', assessedAt: '2026-08-25T02:01:00.000Z',
      }],
      auditEntries: [{
        entityId: 'ME-001', entityType: 'event', occurredAt: '2026-08-25T02:01:00.000Z',
        kind: 'verification_confirmed', summary: '人工核实确认事件', simulation: true,
      }],
    });
    const projection = await repository.loadProjection();
    expect(projection.events[0]?.version).toBe(2);
    expect(projection.verificationTasks[0]?.status).toBe('completed');
    expect(projection.assessments?.[0]?.result).toBe('valid');
    expect(projection.auditEntries?.[0]?.seq).toBe(1);
  });

  it('核实事务版本冲突时不留下任务、评估或审计半成品', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event(2));
    await expect(repository.commitVerificationTransition({
      expectedEventVersion: 1,
      event: event(3),
      task: {
        taskId: 'VT-ME-001', eventId: 'ME-001', expectedEventVersion: 3,
        status: 'completed', updatedAt: '2026-08-25T02:01:00.000Z',
      },
      assessments: [{
        assessmentId: 'ASM-ROLLBACK', alarmId: 'ALM-001', result: 'valid', reason: '不应落库',
        assessedBy: 'USR-MONITOR-01', assessedAt: '2026-08-25T02:01:00.000Z',
      }],
      auditEntries: [{
        entityId: 'ME-001', entityType: 'event', occurredAt: '2026-08-25T02:01:00.000Z',
        kind: 'should_not_commit', summary: '不应落库', simulation: true,
      }],
    })).rejects.toBeInstanceOf(MonitoringVersionConflictError);
    const projection = await repository.loadProjection();
    expect(projection.events[0]?.version).toBe(2);
    expect(projection.verificationTasks).toHaveLength(0);
    expect(projection.assessments).toHaveLength(0);
    expect(projection.auditEntries).toHaveLength(0);
  });
});

describe('阶段10 内存活动窗口与持久数据保留', () => {
  it('只投影最近200起活跃事件，但仓储中的旧事件、告警和审计仍可查询', async () => {
    const repository = new MemoryMonitoringRepository();
    const base = Date.parse('2026-08-25T00:00:00.000Z');
    for (let index = 0; index < 205; index += 1) {
      const alarmId = `ALM-W-${String(index).padStart(3, '0')}`;
      const eventId = `ME-W-${String(index).padStart(3, '0')}`;
      await repository.addAlarm(alarm(alarmId));
      await repository.putEvent({ ...event(1), monitoringEventId: eventId, alarmIds: [alarmId],
        detectedAt: new Date(base + index * 1_000).toISOString(), updatedAt: new Date(base + index * 1_000).toISOString() });
    }
    for (let index = 0; index < 1_005; index += 1) {
      await repository.appendAudit({ entityId: `ME-A-${index}`, entityType: 'event',
        occurredAt: new Date(base + index).toISOString(), kind: 'load_test', summary: `审计${index}`, simulation: true });
    }

    const projection = await repository.loadProjection();
    expect(projection.events).toHaveLength(200);
    expect(projection.alarms).toHaveLength(200);
    expect(projection.auditEntries).toHaveLength(1_000);
    expect(await repository.getEvent('ME-W-000')).toBeDefined();
    expect(await repository.listAlarms()).toHaveLength(205);
    expect(await repository.listAuditEntries()).toHaveLength(1_005);
  });
});
