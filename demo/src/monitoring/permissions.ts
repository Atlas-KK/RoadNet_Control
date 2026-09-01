import type { MonitoringEvent } from '../domain/monitoring';
import { DEFAULT_MONITORING_ROAD_CODES } from './adapters/defaultMonitoringEvents';

export type MonitoringRole = 'monitor' | 'supervisor' | 'dispatcher' | 'administrator';
export type MonitoringPermission =
  | 'verify_event'
  | 'review_l4_false_positive'
  | 'review_l4_downgrade'
  | 'approve_l4_observation'
  | 'initiate_handoff'
  | 'retry_handoff'
  | 'transfer_task'
  | 'view_original_evidence'
  | 'export_monitoring_data';

export interface SimulatedUser {
  userId: string;
  displayName: string;
  role: MonitoringRole;
  organizationId: string;
  authorizedRoadCodes: readonly string[];
  authorizedFacilityIds: readonly string[];
}

const DEMO_MONITORING_FACILITY_IDS = Object.freeze([
  'TUN-G75-062', 'BR-G50-174', 'TUN-G75-088', 'ROAD-G50-096',
]);

// 本地演示数据需要对全部模拟角色可见；角色差异仍由操作权限矩阵控制。
export const DEMO_MONITORING_ROAD_CODES = Object.freeze([
  'G65', 'G65S', 'G56', 'S204',
  ...DEFAULT_MONITORING_ROAD_CODES,
  'G75', 'G50',
].filter((roadCode, index, roadCodes) => roadCodes.indexOf(roadCode) === index));

export const SIMULATED_USERS: readonly SimulatedUser[] = Object.freeze([
  Object.freeze({
    userId: 'USR-MONITOR-01',
    displayName: '路网监测员',
    role: 'monitor' as const,
    organizationId: 'ORG-SHAANXI',
    authorizedRoadCodes: DEMO_MONITORING_ROAD_CODES,
    authorizedFacilityIds: DEMO_MONITORING_FACILITY_IDS,
  }),
  Object.freeze({
    userId: 'USR-SUPERVISOR-01',
    displayName: '监控班长',
    role: 'supervisor' as const,
    organizationId: 'ORG-SHAANXI',
    authorizedRoadCodes: DEMO_MONITORING_ROAD_CODES,
    authorizedFacilityIds: DEMO_MONITORING_FACILITY_IDS,
  }),
  Object.freeze({
    userId: 'USR-DISPATCHER-01',
    displayName: '指挥调度人员',
    role: 'dispatcher' as const,
    organizationId: 'ORG-SHAANXI',
    authorizedRoadCodes: DEMO_MONITORING_ROAD_CODES,
    authorizedFacilityIds: DEMO_MONITORING_FACILITY_IDS,
  }),
  Object.freeze({
    userId: 'USR-ADMIN-01',
    displayName: '系统管理员',
    role: 'administrator' as const,
    organizationId: 'ORG-SHAANXI',
    authorizedRoadCodes: DEMO_MONITORING_ROAD_CODES,
    authorizedFacilityIds: DEMO_MONITORING_FACILITY_IDS,
  }),
]);

const ROLE_PERMISSIONS: Readonly<Record<MonitoringRole, ReadonlySet<MonitoringPermission>>> = {
  monitor: new Set(['verify_event', 'initiate_handoff', 'view_original_evidence']),
  supervisor: new Set([
    'verify_event',
    'review_l4_false_positive',
    'review_l4_downgrade',
    'approve_l4_observation',
    'initiate_handoff',
    'retry_handoff',
    'transfer_task',
    'view_original_evidence',
    'export_monitoring_data',
  ]),
  dispatcher: new Set(['view_original_evidence']),
  administrator: new Set(['export_monitoring_data']),
};

export class MonitoringPermissionError extends Error {
  readonly code = 'MONITORING_PERMISSION_DENIED';
  readonly userId: string;
  readonly permission: MonitoringPermission;

  constructor(userId: string, permission: MonitoringPermission) {
    super(`用户 ${userId} 无权限执行 ${permission}`);
    this.name = 'MonitoringPermissionError';
    this.userId = userId;
    this.permission = permission;
  }
}

export function findSimulatedUser(userId: string): SimulatedUser | undefined {
  return SIMULATED_USERS.find((user) => user.userId === userId);
}

export function hasMonitoringPermission(user: SimulatedUser, permission: MonitoringPermission): boolean {
  return ROLE_PERMISSIONS[user.role].has(permission);
}

export function canAccessMonitoringEvent(user: SimulatedUser, event: MonitoringEvent): boolean {
  if (user.authorizedRoadCodes.includes(event.location.roadCode)) return true;
  return Boolean(event.location.facilityId && user.authorizedFacilityIds.includes(event.location.facilityId));
}

export function assertMonitoringPermission(
  user: SimulatedUser,
  permission: MonitoringPermission,
  event?: MonitoringEvent,
): void {
  if (!hasMonitoringPermission(user, permission) || (event && !canAccessMonitoringEvent(user, event))) {
    throw new MonitoringPermissionError(user.userId, permission);
  }
}
