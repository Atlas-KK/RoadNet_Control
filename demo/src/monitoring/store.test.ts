import { describe, expect, it } from 'vitest';
import { demoCaseById } from '../data/demoCases';
import type { MonitoringEvent } from '../domain/monitoring';
import { useStore } from '../store';
import { MonitoringPermissionError } from './permissions';
import { MemoryMonitoringRepository, MonitoringVersionConflictError } from './services/monitoringDb';
import { createMonitoringStore } from './store';

const event = (): MonitoringEvent => ({
  monitoringEventId: 'ME-001',
  version: 1,
  alarmIds: [],
  eventType: 'abnormal_stop',
  location: { roadCode: 'G65', direction: 'up' },
  suggestedLevel: 'L2',
  verificationStatus: 'pending',
  lifecycleStatus: 'monitoring',
  observationCount: 0,
  conflicts: [],
  detectedAt: '2026-08-25T02:00:00.000Z',
  updatedAt: '2026-08-25T02:00:00.000Z',
  simulation: true,
});

class FailingRepository extends MemoryMonitoringRepository {
  override async open(): Promise<void> {
    throw new Error('blocked by browser');
  }
}

describe('FR-EM-011 独立监测Store', () => {
  it('从仓储载入活跃投影并标记内存降级', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event());
    const store = createMonitoringStore(repository);
    await store.getState().initialize();
    expect(store.getState().activeEventIds).toEqual(['ME-001']);
    expect(store.getState().monitoringEventsById['ME-001']?.version).toBe(1);
    expect(store.getState().persistenceState).toBe('memory_only');
    expect(store.getState().persistenceMessage).toContain('仅保存在内存');
  });

  it('IndexedDB打开失败时显式回退内存且不静默成功', async () => {
    const store = createMonitoringStore(new FailingRepository());
    await store.getState().initialize();
    expect(store.getState().persistenceState).toBe('memory_only');
    expect(store.getState().persistenceMessage).toContain('blocked by browser');
  });

  it('加载智能管控案例不会清空监测投影', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event());
    const monitoringStore = createMonitoringStore(repository);
    await monitoringStore.getState().initialize();
    useStore.getState().loadDemoCase(demoCaseById('cross-event-diversion'));
    expect(monitoringStore.getState().activeEventIds).toEqual(['ME-001']);
  });

  it('流游标拒绝负数和非整数', () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    expect(() => store.getState().setStreamCursor(-1)).toThrow('非负安全整数');
    expect(() => store.getState().setStreamCursor(1.5)).toThrow('非负安全整数');
    store.getState().setStreamCursor(3);
    expect(store.getState().streamCursor).toBe(3);
  });
});

describe('FR-EM-012 Store动作层权限守卫', () => {
  it('管理员即使看到事件也不能执行核实', () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    store.getState().hydrateProjection({ alarms: [], events: [event()], verificationTasks: [], handoffs: [] });
    store.getState().setCurrentUser('USR-ADMIN-01');
    expect(() => store.getState().assertCurrentUserPermission('verify_event', 'ME-001'))
      .toThrow(MonitoringPermissionError);
  });

  it('监测员可在授权路段执行核实守卫', () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    store.getState().hydrateProjection({ alarms: [], events: [event()], verificationTasks: [], handoffs: [] });
    expect(() => store.getState().assertCurrentUserPermission('verify_event', 'ME-001')).not.toThrow();
  });

  it('拒绝不存在的模拟身份', () => {
    const store = createMonitoringStore(new MemoryMonitoringRepository());
    expect(() => store.getState().setCurrentUser('USR-UNKNOWN')).toThrow('未知模拟用户');
  });
});

describe('阶段6 核实动作、并发和L4权限', () => {
  it('两个客户端同时认领时旧版本被拒绝，并刷新为当前占用人', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event());
    const clientA = createMonitoringStore(repository, { nowMs: () => Date.parse('2026-08-25T02:01:00.000Z') });
    const clientB = createMonitoringStore(repository, { nowMs: () => Date.parse('2026-08-25T02:01:01.000Z') });
    await Promise.all([clientA.getState().initialize(), clientB.getState().initialize()]);
    clientB.getState().setCurrentUser('USR-SUPERVISOR-01');

    await clientA.getState().applyVerificationCommand({ type: 'claim', eventId: 'ME-001', expectedVersion: 1 });
    await expect(clientB.getState().applyVerificationCommand({
      type: 'claim', eventId: 'ME-001', expectedVersion: 1,
    })).rejects.toBeInstanceOf(MonitoringVersionConflictError);

    expect(clientB.getState().monitoringEventsById['ME-001']?.verificationOwnerId).toBe('USR-MONITOR-01');
    expect(Object.values(clientB.getState().verificationTasksById)[0]?.ownerId).toBe('USR-MONITOR-01');
    await expect(clientB.getState().applyVerificationCommand({
      type: 'claim', eventId: 'ME-001', expectedVersion: 2,
    })).rejects.toMatchObject({ code: 'TASK_OCCUPIED', currentOwnerId: 'USR-MONITOR-01' });
  });

  it('持续观察提交后释放占用并由其他用户认领', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event());
    let now = Date.parse('2026-08-25T02:01:00.000Z');
    const store = createMonitoringStore(repository, { nowMs: () => now });
    await store.getState().initialize();
    await store.getState().applyVerificationCommand({ type: 'claim', eventId: 'ME-001', expectedVersion: 1 });
    now += 1_000;
    await store.getState().applyVerificationCommand({
      type: 'observe', eventId: 'ME-001', expectedVersion: 2, reason: '等待下一段视频',
    });
    expect(store.getState().monitoringEventsById['ME-001']?.verificationOwnerId).toBeUndefined();
    expect(Object.values(store.getState().verificationTasksById)[0]?.status).toBe('observation');

    store.getState().setCurrentUser('USR-SUPERVISOR-01');
    now += 1_000;
    await store.getState().applyVerificationCommand({ type: 'claim', eventId: 'ME-001', expectedVersion: 3 });
    expect(Object.values(store.getState().verificationTasksById)[0]?.ownerId).toBe('USR-SUPERVISOR-01');
  });

  it('监测员不能冒用真实班长ID审批，班长本人接管后才可提交', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent({ ...event(), suggestedLevel: 'L4' });
    const store = createMonitoringStore(repository, { nowMs: () => Date.parse('2026-08-25T02:01:00.000Z') });
    await store.getState().initialize();
    await store.getState().applyVerificationCommand({ type: 'claim', eventId: 'ME-001', expectedVersion: 1 });
    await expect(store.getState().applyVerificationCommand({
      type: 'false_positive', eventId: 'ME-001', expectedVersion: 2, reason: '光影误检',
      supervisorApproval: {
        approvedBy: 'USR-SUPERVISOR-01', approvedAt: '', permission: 'review_l4_false_positive',
      },
    })).rejects.toBeInstanceOf(MonitoringPermissionError);
    expect(store.getState().monitoringEventsById['ME-001']?.verificationStatus).toBe('verifying');

    store.getState().setCurrentUser('USR-SUPERVISOR-01');
    await store.getState().applyVerificationCommand({
      type: 'force_transfer', eventId: 'ME-001', expectedVersion: 2,
      newOwnerId: 'USR-SUPERVISOR-01', reason: 'L4受限结论由班长本人复核',
    });
    await store.getState().applyVerificationCommand({
      type: 'false_positive', eventId: 'ME-001', expectedVersion: 3, reason: '光影误检',
      supervisorApproval: { approvedBy: 'USR-SUPERVISOR-01', approvedAt: '', permission: 'review_l4_false_positive' },
    });
  });

  it('班长可强制转交占用任务且操作进入审计', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event());
    const store = createMonitoringStore(repository, { nowMs: () => Date.parse('2026-08-25T02:01:00.000Z') });
    await store.getState().initialize();
    await store.getState().applyVerificationCommand({ type: 'claim', eventId: 'ME-001', expectedVersion: 1 });
    store.getState().setCurrentUser('USR-SUPERVISOR-01');
    await store.getState().applyVerificationCommand({
      type: 'force_transfer', eventId: 'ME-001', expectedVersion: 2,
      newOwnerId: 'USR-SUPERVISOR-01', reason: '原监测员离岗',
    });
    expect(Object.values(store.getState().verificationTasksById)[0]?.ownerId).toBe('USR-SUPERVISOR-01');
    expect(store.getState().monitoringAuditEntries.at(-1)?.kind).toBe('verification_force_transferred');
  });

  it('管理员不能借动作入口绕过核实权限', async () => {
    const repository = new MemoryMonitoringRepository();
    await repository.putEvent(event());
    const store = createMonitoringStore(repository);
    await store.getState().initialize();
    store.getState().setCurrentUser('USR-ADMIN-01');
    await expect(store.getState().applyVerificationCommand({
      type: 'claim', eventId: 'ME-001', expectedVersion: 1,
    })).rejects.toBeInstanceOf(MonitoringPermissionError);
  });
});
