import type { HandoffLink } from '../../domain/handoff';
import {
  freezeAlarm,
  isActiveMonitoringLifecycle,
  type Alarm,
  type AlarmAssessment,
  type AlarmDeliveryReceipt,
  type MonitoringAuditEntry,
  type CrossModuleSyncReceipt,
  type MonitoringEvent,
  type MonitoringOutboxMessage,
  type VerificationTask,
} from '../../domain/monitoring';

export const MONITORING_DB_NAME = 'roadgov-monitoring-mvp';
export const MONITORING_DB_VERSION = 2;
export const ACTIVE_EVENT_MEMORY_LIMIT = 200;
export const RECENT_AUDIT_MEMORY_LIMIT = 1_000;

export type MonitoringStoreName =
  | 'alarms'
  | 'receipts'
  | 'assessments'
  | 'events'
  | 'verificationTasks'
  | 'handoffs'
  | 'outbox'
  | 'syncInbox'
  | 'monitoringAudit';

interface MonitoringIndexDefinition {
  name: string;
  keyPath: string | string[];
  unique?: boolean;
}

interface MonitoringStoreDefinition {
  name: MonitoringStoreName;
  keyPath: string;
  autoIncrement?: boolean;
  indexes: readonly MonitoringIndexDefinition[];
}

export const MONITORING_DB_SCHEMA: readonly MonitoringStoreDefinition[] = Object.freeze([
  {
    name: 'alarms',
    keyPath: 'alarmId',
    indexes: [
      { name: 'sourceSystemSourceAlarmId', keyPath: ['sourceSystem', 'sourceAlarmId'], unique: true },
      { name: 'detectedAt', keyPath: 'detectedAt' },
      { name: 'eventType', keyPath: 'eventType' },
      { name: 'deviceId', keyPath: 'location.deviceId' },
    ],
  },
  {
    name: 'receipts',
    keyPath: 'receiptId',
    indexes: [
      { name: 'messageId', keyPath: 'messageId', unique: true },
      { name: 'sourceAlarmId', keyPath: 'sourceAlarmId' },
      { name: 'receivedAt', keyPath: 'receivedAt' },
    ],
  },
  {
    name: 'assessments',
    keyPath: 'assessmentId',
    indexes: [
      { name: 'alarmId', keyPath: 'alarmId' },
      { name: 'assessedAt', keyPath: 'assessedAt' },
    ],
  },
  {
    name: 'events',
    keyPath: 'monitoringEventId',
    indexes: [
      { name: 'lifecycleStatus', keyPath: 'lifecycleStatus' },
      { name: 'verificationStatus', keyPath: 'verificationStatus' },
      { name: 'updatedAt', keyPath: 'updatedAt' },
      { name: 'roadCode', keyPath: 'location.roadCode' },
    ],
  },
  {
    name: 'verificationTasks',
    keyPath: 'taskId',
    indexes: [
      { name: 'eventId', keyPath: 'eventId' },
      { name: 'ownerId', keyPath: 'ownerId' },
      { name: 'nextReviewAt', keyPath: 'nextReviewAt' },
    ],
  },
  {
    name: 'handoffs',
    keyPath: 'handoffId',
    indexes: [
      { name: 'monitoringEventId', keyPath: 'monitoringEventId' },
      { name: 'idempotencyKey', keyPath: 'idempotencyKey', unique: true },
      { name: 'controlEventId', keyPath: 'controlEventId' },
    ],
  },
  {
    name: 'outbox',
    keyPath: 'messageId',
    indexes: [
      { name: 'streamSequence', keyPath: 'streamSequence', unique: true },
      { name: 'status', keyPath: 'status' },
    ],
  },
  {
    name: 'syncInbox',
    keyPath: 'messageId',
    indexes: [
      { name: 'streamSequence', keyPath: 'streamSequence', unique: true },
      { name: 'direction', keyPath: 'direction' },
      { name: 'status', keyPath: 'status' },
    ],
  },
  {
    name: 'monitoringAudit',
    keyPath: 'seq',
    autoIncrement: true,
    indexes: [
      { name: 'entityId', keyPath: 'entityId' },
      { name: 'occurredAt', keyPath: 'occurredAt' },
      { name: 'kind', keyPath: 'kind' },
    ],
  },
]);

export class MonitoringDbUnavailableError extends Error {
  readonly code = 'MONITORING_INDEXEDDB_UNAVAILABLE';

  constructor() {
    super('当前浏览器不支持或禁止使用IndexedDB');
    this.name = 'MonitoringDbUnavailableError';
  }
}

export class MonitoringVersionConflictError extends Error {
  readonly code = 'MONITORING_VERSION_CONFLICT';
  readonly entityId: string;
  readonly expectedVersion: number;
  readonly actualVersion?: number;

  constructor(entityId: string, expectedVersion: number, actualVersion?: number) {
    super(`监测事件 ${entityId} 版本冲突：期望 ${expectedVersion}，实际 ${actualVersion ?? '不存在'}`);
    this.name = 'MonitoringVersionConflictError';
    this.entityId = entityId;
    this.expectedVersion = expectedVersion;
    this.actualVersion = actualVersion;
  }
}

export class MonitoringConstraintError extends Error {
  readonly code = 'MONITORING_CONSTRAINT_VIOLATION';

  constructor(message: string) {
    super(message);
    this.name = 'MonitoringConstraintError';
  }
}

export interface MonitoringProjection {
  alarms: Alarm[];
  events: MonitoringEvent[];
  verificationTasks: VerificationTask[];
  handoffs: HandoffLink[];
  assessments?: AlarmAssessment[];
  auditEntries?: MonitoringAuditEntry[];
  syncReceipts?: CrossModuleSyncReceipt[];
  outboxMessages?: MonitoringOutboxMessage[];
}

export interface VerificationTransitionCommit {
  expectedEventVersion: number;
  event: MonitoringEvent;
  task: VerificationTask;
  assessments: readonly AlarmAssessment[];
  auditEntries: readonly MonitoringAuditEntry[];
}

export interface HandoffTransitionCommit {
  expectedEventVersion: number;
  event: MonitoringEvent;
  handoff: HandoffLink;
  auditEntries: readonly MonitoringAuditEntry[];
}

export interface OutgoingSyncCommit {
  expectedEventVersion: number;
  event: MonitoringEvent;
  outbox: MonitoringOutboxMessage;
  auditEntries: readonly MonitoringAuditEntry[];
}

export interface SyncTransitionCommit {
  expectedEventVersion?: number;
  event?: MonitoringEvent;
  receipt: CrossModuleSyncReceipt;
  auditEntries: readonly MonitoringAuditEntry[];
}

export interface SourceAlarmIngestionCommit {
  alarm?: Alarm;
  receipt: AlarmDeliveryReceipt;
  event?: MonitoringEvent;
  expectedEventVersion?: number;
  auditEntries: readonly MonitoringAuditEntry[];
}

export interface MonitoringRepository {  readonly kind: 'indexeddb' | 'memory';
  open(): Promise<void>;
  close(): void;
  addAlarm(alarm: Alarm): Promise<void>;
  getAlarm(alarmId: string): Promise<Alarm | undefined>;
  listAlarms(): Promise<Alarm[]>;
  addReceipt(receipt: AlarmDeliveryReceipt): Promise<void>;
  getReceiptByMessageId(messageId: string): Promise<AlarmDeliveryReceipt | undefined>;
  addAlarmWithReceipt(alarm: Alarm, receipt: AlarmDeliveryReceipt): Promise<void>;
  commitSourceAlarmIngestion(commit: SourceAlarmIngestionCommit): Promise<MonitoringAuditEntry[]>;
  addAssessment(assessment: AlarmAssessment): Promise<void>;
  listAssessments(): Promise<AlarmAssessment[]>;
  putEvent(event: MonitoringEvent, expectedVersion?: number): Promise<void>;
  getEvent(eventId: string): Promise<MonitoringEvent | undefined>;
  listActiveEvents(limit?: number): Promise<MonitoringEvent[]>;
  putVerificationTask(task: VerificationTask): Promise<void>;
  listVerificationTasks(): Promise<VerificationTask[]>;
  putHandoff(handoff: HandoffLink): Promise<void>;
  getHandoffByIdempotencyKey(idempotencyKey: string): Promise<HandoffLink | undefined>;
  listHandoffs(): Promise<HandoffLink[]>;
  appendAudit(entry: MonitoringAuditEntry): Promise<MonitoringAuditEntry>;
  listAuditEntries(): Promise<MonitoringAuditEntry[]>;
  commitVerificationTransition(commit: VerificationTransitionCommit): Promise<MonitoringAuditEntry[]>;
  commitHandoffTransition(commit: HandoffTransitionCommit): Promise<MonitoringAuditEntry[]>;
  enqueueOutbox(message: MonitoringOutboxMessage): Promise<void>;
  updateOutbox(message: MonitoringOutboxMessage): Promise<void>;
  listOutboxMessages(): Promise<MonitoringOutboxMessage[]>;
  commitOutgoingSync(commit: OutgoingSyncCommit): Promise<MonitoringAuditEntry[]>;
  putSyncReceipt(receipt: CrossModuleSyncReceipt): Promise<void>;
  getSyncReceipt(messageId: string): Promise<CrossModuleSyncReceipt | undefined>;
  listSyncReceipts(): Promise<CrossModuleSyncReceipt[]>;
  commitSyncTransition(commit: SyncTransitionCommit): Promise<MonitoringAuditEntry[]>;
  clearMonitoringDemoData(): Promise<void>;
  loadProjection(): Promise<MonitoringProjection>;
}

export function upgradeMonitoringDatabase(db: IDBDatabase, transaction?: IDBTransaction | null): void {
  for (const definition of MONITORING_DB_SCHEMA) {
    const store = db.objectStoreNames.contains(definition.name)
      ? transaction?.objectStore(definition.name)
      : db.createObjectStore(definition.name, {
          keyPath: definition.keyPath,
          autoIncrement: definition.autoIncrement,
        });
    if (!store) continue;
    for (const index of definition.indexes) {
      if (!store.indexNames.contains(index.name)) {
        store.createIndex(index.name, index.keyPath, { unique: index.unique ?? false });
      }
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB请求失败'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB事务已中止'));
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB事务失败'));
  });
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class IndexedDbMonitoringRepository implements MonitoringRepository {
  readonly kind = 'indexeddb' as const;
  private db?: IDBDatabase;
  private readonly factory: IDBFactory | undefined;

  constructor(factory: IDBFactory | undefined = globalThis.indexedDB) {
    this.factory = factory;
  }

  async open(): Promise<void> {
    if (this.db) return;
    if (!this.factory) throw new MonitoringDbUnavailableError();
    const request = this.factory.open(MONITORING_DB_NAME, MONITORING_DB_VERSION);
    request.onupgradeneeded = () => upgradeMonitoringDatabase(request.result, request.transaction);
    this.db = await requestResult(request);
    this.db.onversionchange = () => {
      this.db?.close();
      this.db = undefined;
    };
  }

  close(): void {
    this.db?.close();
    this.db = undefined;
  }

  private async database(): Promise<IDBDatabase> {
    await this.open();
    if (!this.db) throw new MonitoringDbUnavailableError();
    return this.db;
  }

  async addAlarm(alarm: Alarm): Promise<void> {
    const db = await this.database();
    const transaction = db.transaction('alarms', 'readwrite');
    const done = transactionDone(transaction);
    await requestResult(transaction.objectStore('alarms').add(clone(alarm)));
    await done;
  }

  async getAlarm(alarmId: string): Promise<Alarm | undefined> {
    const db = await this.database();
    const result = await requestResult(db.transaction('alarms').objectStore('alarms').get(alarmId)) as Alarm | undefined;
    return result ? freezeAlarm(result) : undefined;
  }

  async listAlarms(): Promise<Alarm[]> {
    const db = await this.database();
    const result = await requestResult(db.transaction('alarms').objectStore('alarms').getAll()) as Alarm[];
    return result.map(freezeAlarm);
  }

  async addReceipt(receipt: AlarmDeliveryReceipt): Promise<void> {
    const db = await this.database();
    const transaction = db.transaction('receipts', 'readwrite');
    const done = transactionDone(transaction);
    await requestResult(transaction.objectStore('receipts').add(clone(receipt)));
    await done;
  }

  async getReceiptByMessageId(messageId: string): Promise<AlarmDeliveryReceipt | undefined> {
    const db = await this.database();
    return requestResult(db.transaction('receipts').objectStore('receipts').index('messageId').get(messageId)) as Promise<AlarmDeliveryReceipt | undefined>;
  }

  async addAlarmWithReceipt(alarm: Alarm, receipt: AlarmDeliveryReceipt): Promise<void> {
    const db = await this.database();
    const transaction = db.transaction(['alarms', 'receipts'], 'readwrite');
    const done = transactionDone(transaction);
    await Promise.all([
      requestResult(transaction.objectStore('alarms').add(clone(alarm))),
      requestResult(transaction.objectStore('receipts').add(clone(receipt))),
      done,
    ]);
  }

  async commitSourceAlarmIngestion(commit: SourceAlarmIngestionCommit): Promise<MonitoringAuditEntry[]> {
    const db = await this.database();
    const transaction = db.transaction(['alarms', 'receipts', 'events', 'monitoringAudit'], 'readwrite');
    const done = transactionDone(transaction);
    const writes: Promise<unknown>[] = [];
    if (commit.event) {
      const eventStore = transaction.objectStore('events');
      const current = await requestResult(eventStore.get(commit.event.monitoringEventId)) as MonitoringEvent | undefined;
      if (commit.expectedEventVersion !== undefined && current?.version !== commit.expectedEventVersion) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion, current?.version);
      }
      if (commit.expectedEventVersion === undefined && current) {
        transaction.abort();
        await done.catch(() => undefined);
        throw new MonitoringConstraintError(`监测事件已存在：${commit.event.monitoringEventId}`);
      }
      writes.push(requestResult(eventStore.put(clone(commit.event))));
    }
    if (commit.alarm) writes.push(requestResult(transaction.objectStore('alarms').add(clone(commit.alarm))));
    writes.push(requestResult(transaction.objectStore('receipts').add(clone(commit.receipt))));
    const auditStore = transaction.objectStore('monitoringAudit');
    const auditKeys = commit.auditEntries.map((entry) => requestResult(auditStore.add(clone(entry))));
    const [, keys] = await Promise.all([Promise.all(writes), Promise.all(auditKeys), done]);
    return commit.auditEntries.map((entry, index) => ({ ...entry, seq: Number(keys[index]) }));
  }

  async addAssessment(assessment: AlarmAssessment): Promise<void> {    const db = await this.database();
    const transaction = db.transaction('assessments', 'readwrite');
    const done = transactionDone(transaction);
    await requestResult(transaction.objectStore('assessments').add(clone(assessment)));
    await done;
  }

  async listAssessments(): Promise<AlarmAssessment[]> {
    return this.getAll<AlarmAssessment>('assessments');
  }

  async putEvent(event: MonitoringEvent, expectedVersion?: number): Promise<void> {
    const db = await this.database();
    const transaction = db.transaction('events', 'readwrite');
    const done = transactionDone(transaction);
    const store = transaction.objectStore('events');
    const current = await requestResult(store.get(event.monitoringEventId)) as MonitoringEvent | undefined;
    if (expectedVersion !== undefined && current?.version !== expectedVersion) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new MonitoringVersionConflictError(event.monitoringEventId, expectedVersion, current?.version);
    }
    await requestResult(store.put(clone(event)));
    await done;
  }

  async getEvent(eventId: string): Promise<MonitoringEvent | undefined> {
    const db = await this.database();
    return requestResult(db.transaction('events').objectStore('events').get(eventId)) as Promise<MonitoringEvent | undefined>;
  }

  async listActiveEvents(limit = 200): Promise<MonitoringEvent[]> {
    const db = await this.database();
    const events = await requestResult(db.transaction('events').objectStore('events').getAll()) as MonitoringEvent[];
    return events
      .filter((event) => isActiveMonitoringLifecycle(event.lifecycleStatus))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit);
  }

  async putVerificationTask(task: VerificationTask): Promise<void> {
    await this.put('verificationTasks', task);
  }

  async listVerificationTasks(): Promise<VerificationTask[]> {
    return this.getAll<VerificationTask>('verificationTasks');
  }

  async putHandoff(handoff: HandoffLink): Promise<void> {
    await this.put('handoffs', handoff);
  }

  async getHandoffByIdempotencyKey(idempotencyKey: string): Promise<HandoffLink | undefined> {
    const db = await this.database();
    return requestResult(db.transaction('handoffs').objectStore('handoffs').index('idempotencyKey').get(idempotencyKey)) as Promise<HandoffLink | undefined>;
  }

  async listHandoffs(): Promise<HandoffLink[]> {
    return this.getAll<HandoffLink>('handoffs');
  }

  async appendAudit(entry: MonitoringAuditEntry): Promise<MonitoringAuditEntry> {
    const db = await this.database();
    const transaction = db.transaction('monitoringAudit', 'readwrite');
    const done = transactionDone(transaction);
    const key = await requestResult(transaction.objectStore('monitoringAudit').add(clone(entry)));
    await done;
    return { ...entry, seq: Number(key) };
  }

  async listAuditEntries(): Promise<MonitoringAuditEntry[]> {
    return this.getAll<MonitoringAuditEntry>('monitoringAudit');
  }

  async commitVerificationTransition(commit: VerificationTransitionCommit): Promise<MonitoringAuditEntry[]> {
    const db = await this.database();
    const transaction = db.transaction(['events', 'verificationTasks', 'assessments', 'monitoringAudit'], 'readwrite');
    const done = transactionDone(transaction);
    const eventStore = transaction.objectStore('events');
    const current = await requestResult(eventStore.get(commit.event.monitoringEventId)) as MonitoringEvent | undefined;
    if (current?.version !== commit.expectedEventVersion) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new MonitoringVersionConflictError(
        commit.event.monitoringEventId,
        commit.expectedEventVersion,
        current?.version,
      );
    }
    const auditStore = transaction.objectStore('monitoringAudit');
    const writeRequests: Promise<unknown>[] = [
      requestResult(eventStore.put(clone(commit.event))),
      requestResult(transaction.objectStore('verificationTasks').put(clone(commit.task))),
      ...commit.assessments.map((assessment) => requestResult(
        transaction.objectStore('assessments').add(clone(assessment)),
      )),
    ];
    const auditKeys = commit.auditEntries.map((entry) => requestResult(auditStore.add(clone(entry))));
    const [, keys] = await Promise.all([
      Promise.all(writeRequests),
      Promise.all(auditKeys),
      done,
    ]);
    return commit.auditEntries.map((entry, index) => ({ ...entry, seq: Number(keys[index]) }));
  }

  async commitHandoffTransition(commit: HandoffTransitionCommit): Promise<MonitoringAuditEntry[]> {
    const db = await this.database();
    const transaction = db.transaction(['events', 'handoffs', 'monitoringAudit'], 'readwrite');
    const done = transactionDone(transaction);
    const eventStore = transaction.objectStore('events');
    const current = await requestResult(eventStore.get(commit.event.monitoringEventId)) as MonitoringEvent | undefined;
    if (current?.version !== commit.expectedEventVersion) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion, current?.version);
    }
    const handoffStore = transaction.objectStore('handoffs');
    const existing = await requestResult(handoffStore.index('idempotencyKey').get(commit.handoff.idempotencyKey)) as HandoffLink | undefined;
    if (existing && existing.handoffId !== commit.handoff.handoffId) {
      transaction.abort();
      await done.catch(() => undefined);
      throw new MonitoringConstraintError(`重复接管幂等键：${commit.handoff.idempotencyKey}`);
    }
    const auditStore = transaction.objectStore('monitoringAudit');
    const auditKeys = commit.auditEntries.map((entry) => requestResult(auditStore.add(clone(entry))));
    const [, keys] = await Promise.all([
      Promise.all([requestResult(eventStore.put(clone(commit.event))), requestResult(handoffStore.put(clone(commit.handoff)))]),
      Promise.all(auditKeys),
      done,
    ]);
    return commit.auditEntries.map((entry, index) => ({ ...entry, seq: Number(keys[index]) }));
  }
  async commitOutgoingSync(commit: OutgoingSyncCommit): Promise<MonitoringAuditEntry[]> {
    const db = await this.database();
    const transaction = db.transaction(['events', 'outbox', 'monitoringAudit'], 'readwrite');
    const done = transactionDone(transaction);
    const eventStore = transaction.objectStore('events');
    const current = await requestResult(eventStore.get(commit.event.monitoringEventId)) as MonitoringEvent | undefined;
    if (current?.version !== commit.expectedEventVersion) {
      transaction.abort(); await done.catch(() => undefined);
      throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion, current?.version);
    }
    const auditStore = transaction.objectStore('monitoringAudit');
    const auditKeys = commit.auditEntries.map((entry) => requestResult(auditStore.add(clone(entry))));
    const [, keys] = await Promise.all([
      Promise.all([
        requestResult(eventStore.put(clone(commit.event))),
        requestResult(transaction.objectStore('outbox').put(clone(commit.outbox))),
      ]),
      Promise.all(auditKeys),
      done,
    ]);
    return commit.auditEntries.map((entry, index) => ({ ...entry, seq: Number(keys[index]) }));
  }
  async listOutboxMessages(): Promise<MonitoringOutboxMessage[]> {
    return this.getAll<MonitoringOutboxMessage>('outbox');
  }

  async putSyncReceipt(receipt: CrossModuleSyncReceipt): Promise<void> {
    await this.put('syncInbox', receipt);
  }

  async getSyncReceipt(messageId: string): Promise<CrossModuleSyncReceipt | undefined> {
    const db = await this.database();
    return requestResult(db.transaction('syncInbox').objectStore('syncInbox').get(messageId)) as Promise<CrossModuleSyncReceipt | undefined>;
  }

  async listSyncReceipts(): Promise<CrossModuleSyncReceipt[]> {
    return this.getAll<CrossModuleSyncReceipt>('syncInbox');
  }

  async commitSyncTransition(commit: SyncTransitionCommit): Promise<MonitoringAuditEntry[]> {
    const db = await this.database();
    const transaction = db.transaction(['events', 'syncInbox', 'monitoringAudit'], 'readwrite');
    const done = transactionDone(transaction);
    const writes: Promise<unknown>[] = [requestResult(transaction.objectStore('syncInbox').put(clone(commit.receipt)))];
    if (commit.event) {
      const eventStore = transaction.objectStore('events');
      const current = await requestResult(eventStore.get(commit.event.monitoringEventId)) as MonitoringEvent | undefined;
      if (current?.version !== commit.expectedEventVersion) {
        transaction.abort(); await done.catch(() => undefined);
        throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion!, current?.version);
      }
      writes.push(requestResult(eventStore.put(clone(commit.event))));
    }
    const auditStore = transaction.objectStore('monitoringAudit');
    const auditKeys = commit.auditEntries.map((entry) => requestResult(auditStore.add(clone(entry))));
    const [, keys] = await Promise.all([Promise.all(writes), Promise.all(auditKeys), done]);
    return commit.auditEntries.map((entry, index) => ({ ...entry, seq: Number(keys[index]) }));
  }
  async enqueueOutbox(message: MonitoringOutboxMessage): Promise<void> {
    const db = await this.database();
    const transaction = db.transaction('outbox', 'readwrite');
    const done = transactionDone(transaction);
    await requestResult(transaction.objectStore('outbox').add(clone(message)));
    await done;
  }
  async updateOutbox(message: MonitoringOutboxMessage): Promise<void> {
    await this.put('outbox', message);
  }

  async loadProjection(): Promise<MonitoringProjection> {
    const events = await this.listActiveEvents(ACTIVE_EVENT_MEMORY_LIMIT);
    const eventIds = new Set(events.map((event) => event.monitoringEventId));
    const alarmIds = [...new Set(events.flatMap((event) => [...event.alarmIds]))];
    const alarms = (await Promise.all(alarmIds.map((alarmId) => this.getAlarm(alarmId)))).filter((alarm): alarm is Alarm => Boolean(alarm));
    const alarmIdSet = new Set(alarms.map((alarm) => alarm.alarmId));
    const [verificationTasks, handoffs, assessments, auditEntries, syncReceipts, outboxMessages] = await Promise.all([
      this.listVerificationTasks(), this.listHandoffs(), this.listAssessments(), this.listAuditEntries(),
      this.listSyncReceipts(), this.listOutboxMessages(),
    ]);
    return {
      alarms, events,
      verificationTasks: verificationTasks.filter((task) => eventIds.has(task.eventId)),
      handoffs: handoffs.filter((handoff) => eventIds.has(handoff.monitoringEventId)),
      assessments: assessments.filter((assessment) => alarmIdSet.has(assessment.alarmId)),
      auditEntries: auditEntries.slice(-RECENT_AUDIT_MEMORY_LIMIT), syncReceipts, outboxMessages,
    };
  }

  async clearMonitoringDemoData(): Promise<void> {
    const db = await this.database();
    const stores = MONITORING_DB_SCHEMA.map((definition) => definition.name);
    const transaction = db.transaction(stores, 'readwrite');
    const done = transactionDone(transaction);
    await Promise.all([
      ...stores.map((storeName) => requestResult(transaction.objectStore(storeName).clear())),
      done,
    ]);
  }

  private async put<T>(storeName: MonitoringStoreName, value: T): Promise<void> {    const db = await this.database();
    const transaction = db.transaction(storeName, 'readwrite');
    const done = transactionDone(transaction);
    await requestResult(transaction.objectStore(storeName).put(clone(value)));
    await done;
  }

  private async getAll<T>(storeName: MonitoringStoreName): Promise<T[]> {
    const db = await this.database();
    return requestResult(db.transaction(storeName).objectStore(storeName).getAll()) as Promise<T[]>;
  }
}

export class MemoryMonitoringRepository implements MonitoringRepository {
  readonly kind = 'memory' as const;
  private readonly alarms = new Map<string, Alarm>();
  private readonly receiptById = new Map<string, AlarmDeliveryReceipt>();
  private readonly receiptIdByMessage = new Map<string, string>();
  private readonly sourceAlarmKeys = new Set<string>();
  private readonly assessments = new Map<string, AlarmAssessment>();
  private readonly events = new Map<string, MonitoringEvent>();
  private readonly tasks = new Map<string, VerificationTask>();
  private readonly handoffs = new Map<string, HandoffLink>();
  private readonly handoffIdByKey = new Map<string, string>();
  private readonly outbox = new Map<string, MonitoringOutboxMessage>();
  private readonly syncInbox = new Map<string, CrossModuleSyncReceipt>();
  private readonly audit: MonitoringAuditEntry[] = [];

  async open(): Promise<void> {}
  close(): void {}

  private assertAlarmUnique(alarm: Alarm): void {
    const sourceKey = `${alarm.sourceSystem}\u0000${alarm.sourceAlarmId}`;
    if (this.alarms.has(alarm.alarmId) || this.sourceAlarmKeys.has(sourceKey)) {
      throw new MonitoringConstraintError(`重复Alarm：${alarm.alarmId}`);
    }
  }

  private assertReceiptUnique(receipt: AlarmDeliveryReceipt): void {
    if (this.receiptById.has(receipt.receiptId) || this.receiptIdByMessage.has(receipt.messageId)) {
      throw new MonitoringConstraintError(`重复投递消息：${receipt.messageId}`);
    }
  }

  async addAlarm(alarm: Alarm): Promise<void> {
    this.assertAlarmUnique(alarm);
    this.alarms.set(alarm.alarmId, freezeAlarm(clone(alarm)));
    this.sourceAlarmKeys.add(`${alarm.sourceSystem}\u0000${alarm.sourceAlarmId}`);
  }

  async getAlarm(alarmId: string): Promise<Alarm | undefined> {
    const alarm = this.alarms.get(alarmId);
    return alarm ? freezeAlarm(clone(alarm)) : undefined;
  }

  async listAlarms(): Promise<Alarm[]> {
    return [...this.alarms.values()].map((alarm) => freezeAlarm(clone(alarm)));
  }

  async addReceipt(receipt: AlarmDeliveryReceipt): Promise<void> {
    this.assertReceiptUnique(receipt);
    this.receiptById.set(receipt.receiptId, clone(receipt));
    this.receiptIdByMessage.set(receipt.messageId, receipt.receiptId);
  }

  async getReceiptByMessageId(messageId: string): Promise<AlarmDeliveryReceipt | undefined> {
    const receiptId = this.receiptIdByMessage.get(messageId);
    const receipt = receiptId ? this.receiptById.get(receiptId) : undefined;
    return receipt ? clone(receipt) : undefined;
  }

  async addAlarmWithReceipt(alarm: Alarm, receipt: AlarmDeliveryReceipt): Promise<void> {
    // 先完成全部约束校验，再提交两个Map，模拟IndexedDB原子事务。
    this.assertAlarmUnique(alarm);
    this.assertReceiptUnique(receipt);
    await this.addAlarm(alarm);
    await this.addReceipt(receipt);
  }

  async commitSourceAlarmIngestion(commit: SourceAlarmIngestionCommit): Promise<MonitoringAuditEntry[]> {
    if (commit.alarm) this.assertAlarmUnique(commit.alarm);
    this.assertReceiptUnique(commit.receipt);
    if (commit.event) {
      const current = this.events.get(commit.event.monitoringEventId);
      if (commit.expectedEventVersion !== undefined && current?.version !== commit.expectedEventVersion) {
        throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion, current?.version);
      }
      if (commit.expectedEventVersion === undefined && current) {
        throw new MonitoringConstraintError(`监测事件已存在：${commit.event.monitoringEventId}`);
      }
    }
    if (commit.alarm) {
      this.alarms.set(commit.alarm.alarmId, freezeAlarm(clone(commit.alarm)));
      this.sourceAlarmKeys.add(`${commit.alarm.sourceSystem}\u0000${commit.alarm.sourceAlarmId}`);
    }
    this.receiptById.set(commit.receipt.receiptId, clone(commit.receipt));
    this.receiptIdByMessage.set(commit.receipt.messageId, commit.receipt.receiptId);
    if (commit.event) this.events.set(commit.event.monitoringEventId, clone(commit.event));
    const persisted = commit.auditEntries.map((entry, index) => ({ ...clone(entry), seq: this.audit.length + index + 1 }));
    this.audit.push(...persisted);
    return persisted.map(clone);
  }

  async addAssessment(assessment: AlarmAssessment): Promise<void> {    if (this.assessments.has(assessment.assessmentId)) {
      throw new MonitoringConstraintError(`重复核实记录：${assessment.assessmentId}`);
    }
    this.assessments.set(assessment.assessmentId, clone(assessment));
  }

  async listAssessments(): Promise<AlarmAssessment[]> {
    return [...this.assessments.values()].map(clone);
  }

  async putEvent(event: MonitoringEvent, expectedVersion?: number): Promise<void> {
    const current = this.events.get(event.monitoringEventId);
    if (expectedVersion !== undefined && current?.version !== expectedVersion) {
      throw new MonitoringVersionConflictError(event.monitoringEventId, expectedVersion, current?.version);
    }
    this.events.set(event.monitoringEventId, clone(event));
  }

  async getEvent(eventId: string): Promise<MonitoringEvent | undefined> {
    const event = this.events.get(eventId);
    return event ? clone(event) : undefined;
  }

  async listActiveEvents(limit = 200): Promise<MonitoringEvent[]> {
    return [...this.events.values()]
      .filter((event) => isActiveMonitoringLifecycle(event.lifecycleStatus))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
      .map(clone);
  }

  async putVerificationTask(task: VerificationTask): Promise<void> {
    this.tasks.set(task.taskId, clone(task));
  }

  async listVerificationTasks(): Promise<VerificationTask[]> {
    return [...this.tasks.values()].map(clone);
  }

  async putHandoff(handoff: HandoffLink): Promise<void> {
    const existing = this.handoffIdByKey.get(handoff.idempotencyKey);
    if (existing && existing !== handoff.handoffId) {
      throw new MonitoringConstraintError(`重复接管幂等键：${handoff.idempotencyKey}`);
    }
    this.handoffs.set(handoff.handoffId, clone(handoff));
    this.handoffIdByKey.set(handoff.idempotencyKey, handoff.handoffId);
  }

  async getHandoffByIdempotencyKey(idempotencyKey: string): Promise<HandoffLink | undefined> {
    const handoffId = this.handoffIdByKey.get(idempotencyKey);
    const handoff = handoffId ? this.handoffs.get(handoffId) : undefined;
    return handoff ? clone(handoff) : undefined;
  }

  async listHandoffs(): Promise<HandoffLink[]> {
    return [...this.handoffs.values()].map(clone);
  }

  async appendAudit(entry: MonitoringAuditEntry): Promise<MonitoringAuditEntry> {
    const full = { ...clone(entry), seq: this.audit.length + 1 };
    this.audit.push(full);
    return clone(full);
  }

  async listAuditEntries(): Promise<MonitoringAuditEntry[]> {
    return this.audit.map(clone);
  }

  async commitVerificationTransition(commit: VerificationTransitionCommit): Promise<MonitoringAuditEntry[]> {
    const current = this.events.get(commit.event.monitoringEventId);
    if (current?.version !== commit.expectedEventVersion) {
      throw new MonitoringVersionConflictError(
        commit.event.monitoringEventId,
        commit.expectedEventVersion,
        current?.version,
      );
    }
    const duplicate = commit.assessments.find((assessment) => this.assessments.has(assessment.assessmentId));
    if (duplicate) throw new MonitoringConstraintError(`重复核实记录：${duplicate.assessmentId}`);
    const eventCopy = clone(commit.event);
    const taskCopy = clone(commit.task);
    const assessmentCopies = commit.assessments.map(clone);
    const auditCopies = commit.auditEntries.map(clone);
    this.events.set(eventCopy.monitoringEventId, eventCopy);
    this.tasks.set(taskCopy.taskId, taskCopy);
    for (const assessment of assessmentCopies) this.assessments.set(assessment.assessmentId, assessment);
    const persisted = auditCopies.map((entry, index) => ({ ...entry, seq: this.audit.length + index + 1 }));
    this.audit.push(...persisted);
    return persisted.map(clone);
  }

  async commitHandoffTransition(commit: HandoffTransitionCommit): Promise<MonitoringAuditEntry[]> {
    const current = this.events.get(commit.event.monitoringEventId);
    if (current?.version !== commit.expectedEventVersion) {
      throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion, current?.version);
    }
    const existingId = this.handoffIdByKey.get(commit.handoff.idempotencyKey);
    if (existingId && existingId !== commit.handoff.handoffId) {
      throw new MonitoringConstraintError(`重复接管幂等键：${commit.handoff.idempotencyKey}`);
    }
    this.events.set(commit.event.monitoringEventId, clone(commit.event));
    this.handoffs.set(commit.handoff.handoffId, clone(commit.handoff));
    this.handoffIdByKey.set(commit.handoff.idempotencyKey, commit.handoff.handoffId);
    const persisted = commit.auditEntries.map((entry, index) => ({ ...clone(entry), seq: this.audit.length + index + 1 }));
    this.audit.push(...persisted);
    return persisted.map(clone);
  }
  async commitOutgoingSync(commit: OutgoingSyncCommit): Promise<MonitoringAuditEntry[]> {
    const current = this.events.get(commit.event.monitoringEventId);
    if (current?.version !== commit.expectedEventVersion) {
      throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion, current?.version);
    }
    this.events.set(commit.event.monitoringEventId, clone(commit.event));
    this.outbox.set(commit.outbox.messageId, clone(commit.outbox));
    const persisted = commit.auditEntries.map((entry, index) => ({ ...clone(entry), seq: this.audit.length + index + 1 }));
    this.audit.push(...persisted);
    return persisted.map(clone);
  }
  async listOutboxMessages(): Promise<MonitoringOutboxMessage[]> {
    return [...this.outbox.values()].map(clone);
  }

  async putSyncReceipt(receipt: CrossModuleSyncReceipt): Promise<void> {
    this.syncInbox.set(receipt.messageId, clone(receipt));
  }

  async getSyncReceipt(messageId: string): Promise<CrossModuleSyncReceipt | undefined> {
    const receipt = this.syncInbox.get(messageId);
    return receipt ? clone(receipt) : undefined;
  }

  async listSyncReceipts(): Promise<CrossModuleSyncReceipt[]> {
    return [...this.syncInbox.values()].map(clone);
  }

  async commitSyncTransition(commit: SyncTransitionCommit): Promise<MonitoringAuditEntry[]> {
    if (commit.event) {
      const current = this.events.get(commit.event.monitoringEventId);
      if (current?.version !== commit.expectedEventVersion) {
        throw new MonitoringVersionConflictError(commit.event.monitoringEventId, commit.expectedEventVersion!, current?.version);
      }
    }
    if (commit.event) this.events.set(commit.event.monitoringEventId, clone(commit.event));
    this.syncInbox.set(commit.receipt.messageId, clone(commit.receipt));
    const persisted = commit.auditEntries.map((entry, index) => ({ ...clone(entry), seq: this.audit.length + index + 1 }));
    this.audit.push(...persisted);
    return persisted.map(clone);
  }
  async enqueueOutbox(message: MonitoringOutboxMessage): Promise<void> {
    if (this.outbox.has(message.messageId)) throw new MonitoringConstraintError(`重复消息：${message.messageId}`);
    this.outbox.set(message.messageId, clone(message));
  }
  async updateOutbox(message: MonitoringOutboxMessage): Promise<void> {
    this.outbox.set(message.messageId, clone(message));
  }

  async loadProjection(): Promise<MonitoringProjection> {
    const events = await this.listActiveEvents(ACTIVE_EVENT_MEMORY_LIMIT);
    const eventIds = new Set(events.map((event) => event.monitoringEventId));
    const alarmIds = new Set(events.flatMap((event) => [...event.alarmIds]));
    return {
      alarms: (await this.listAlarms()).filter((alarm) => alarmIds.has(alarm.alarmId)),
      events,
      verificationTasks: (await this.listVerificationTasks()).filter((task) => eventIds.has(task.eventId)),
      handoffs: (await this.listHandoffs()).filter((handoff) => eventIds.has(handoff.monitoringEventId)),
      assessments: (await this.listAssessments()).filter((assessment) => alarmIds.has(assessment.alarmId)),
      auditEntries: (await this.listAuditEntries()).slice(-RECENT_AUDIT_MEMORY_LIMIT),
      syncReceipts: await this.listSyncReceipts(),
      outboxMessages: await this.listOutboxMessages(),
    };
  }

  async clearMonitoringDemoData(): Promise<void> {
    this.alarms.clear();
    this.receiptById.clear();
    this.receiptIdByMessage.clear();
    this.sourceAlarmKeys.clear();
    this.assessments.clear();
    this.events.clear();
    this.tasks.clear();
    this.handoffs.clear();
    this.handoffIdByKey.clear();
    this.outbox.clear();
    this.syncInbox.clear();
    this.audit.length = 0;
  }
}

export function createDefaultMonitoringRepository(factory: IDBFactory | undefined = globalThis.indexedDB): MonitoringRepository {
  return factory ? new IndexedDbMonitoringRepository(factory) : new MemoryMonitoringRepository();
}



