import { describe, expect, it } from 'vitest';
import type { MonitoringEvent } from '../domain/monitoring';
import {
  SIMULATED_USERS,
  assertMonitoringPermission,
  canAccessMonitoringEvent,
  hasMonitoringPermission,
  MonitoringPermissionError,
} from './permissions';

const event = (roadCode: string): MonitoringEvent => ({
  monitoringEventId: 'ME-001',
  version: 1,
  alarmIds: [],
  eventType: 'fire',
  location: { roadCode, direction: 'up' },
  suggestedLevel: 'L4',
  verificationStatus: 'pending',
  lifecycleStatus: 'monitoring',
  observationCount: 0,
  conflicts: [],
  detectedAt: '2026-08-25T02:00:00.000Z',
  updatedAt: '2026-08-25T02:00:00.000Z',
  simulation: true,
});

describe('FR-EM-012 权限矩阵', () => {
  const monitor = SIMULATED_USERS[0];
  const supervisor = SIMULATED_USERS[1];
  const administrator = SIMULATED_USERS[3];

  it('监测员可核实但不能执行L4复核', () => {
    expect(hasMonitoringPermission(monitor, 'verify_event')).toBe(true);
    expect(hasMonitoringPermission(monitor, 'review_l4_false_positive')).toBe(false);
    expect(hasMonitoringPermission(monitor, 'initiate_handoff')).toBe(true);
    expect(hasMonitoringPermission(monitor, 'retry_handoff')).toBe(false);
  });

  it('班长具备L4复核、转交和接管重试权限', () => {
    expect(hasMonitoringPermission(supervisor, 'review_l4_downgrade')).toBe(true);
    expect(hasMonitoringPermission(supervisor, 'transfer_task')).toBe(true);
    expect(hasMonitoringPermission(supervisor, 'retry_handoff')).toBe(true);
  });

  it('系统管理员没有业务核实权限', () => {
    expect(() => assertMonitoringPermission(administrator, 'verify_event', event('G65')))
      .toThrow(MonitoringPermissionError);
  });

  it('状态层拒绝访问授权范围外事件', () => {
    expect(canAccessMonitoringEvent(monitor, event('G30'))).toBe(false);
    expect(() => assertMonitoringPermission(monitor, 'verify_event', event('G30')))
      .toThrow(MonitoringPermissionError);
  });
});
