// FR-EM-001：今日流量与当前存量分开计算，且只统计用户授权范围。
import { isActiveMonitoringLifecycle, type Alarm, type MonitoringEvent } from '../../domain/monitoring';
import type { SimulatedUser } from '../permissions';

export type MonitoringMetricKey =
  | 'today_detected'
  | 'current_pending'
  | 'current_verifying'
  | 'today_confirmed'
  | 'today_false_positive'
  | 'current_overdue'
  | 'today_taken_over'
  | 'current_control_handling';

export interface MonitoringMetrics {
  todayDetected: number;
  currentPending: number;
  currentVerifying: number;
  todayConfirmed: number;
  todayFalsePositive: number;
  currentOverdue: number;
  todayTakenOver: number;
  currentControlHandling: number;
}

export const MONITORING_METRIC_DEFINITIONS: readonly {
  key: MonitoringMetricKey;
  label: string;
  kind: '今日流量' | '当前存量';
  valueKey: keyof MonitoringMetrics;
}[] = Object.freeze([
  { key: 'today_detected', label: '今日检测', kind: '今日流量', valueKey: 'todayDetected' },
  { key: 'current_pending', label: '当前待核实', kind: '当前存量', valueKey: 'currentPending' },
  { key: 'current_verifying', label: '当前核实中', kind: '当前存量', valueKey: 'currentVerifying' },
  { key: 'today_confirmed', label: '今日已确认', kind: '今日流量', valueKey: 'todayConfirmed' },
  { key: 'today_false_positive', label: '今日已误报', kind: '今日流量', valueKey: 'todayFalsePositive' },
  { key: 'current_overdue', label: '当前核实超时', kind: '当前存量', valueKey: 'currentOverdue' },
  { key: 'today_taken_over', label: '今日已接管', kind: '今日流量', valueKey: 'todayTakenOver' },
  { key: 'current_control_handling', label: '当前接管处置中', kind: '当前存量', valueKey: 'currentControlHandling' },
]);

function canAccessLocation(user: SimulatedUser, location: Alarm['location']): boolean {
  if (user.authorizedRoadCodes.includes(location.roadCode)) return true;
  return Boolean(location.facilityId && user.authorizedFacilityIds.includes(location.facilityId));
}

export function isInLocalNaturalDay(value: string | undefined, nowMs: number): boolean {
  if (!value) return false;
  const target = new Date(value);
  if (!Number.isFinite(target.getTime())) return false;
  const now = new Date(nowMs);
  return target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth()
    && target.getDate() === now.getDate();
}

export function isMonitoringVerificationOverdue(event: MonitoringEvent, operationalNowMs: number): boolean {
  if (event.verificationStatus === 'confirmed' || event.verificationStatus === 'false_positive') return false;
  if (!event.nextReviewAt) return false;
  const dueAt = Date.parse(event.nextReviewAt);
  return Number.isFinite(dueAt) && dueAt < operationalNowMs;
}

export function matchesMonitoringMetric(
  key: MonitoringMetricKey,
  event: MonitoringEvent,
  alarms: readonly Alarm[],
  operationalNowMs: number,
): boolean {
  const active = isActiveMonitoringLifecycle(event.lifecycleStatus);
  switch (key) {
    case 'today_detected':
      return alarms.some((alarm) => isInLocalNaturalDay(alarm.detectedAt, operationalNowMs));
    case 'current_pending':
      return active && event.verificationStatus === 'pending';
    case 'current_verifying':
      return active && event.verificationStatus === 'verifying';
    case 'today_confirmed':
      return isInLocalNaturalDay(event.confirmedAt, operationalNowMs);
    case 'today_false_positive':
      return isInLocalNaturalDay(event.falsePositiveAt, operationalNowMs);
    case 'current_overdue':
      return active && isMonitoringVerificationOverdue(event, operationalNowMs);
    case 'today_taken_over':
      return isInLocalNaturalDay(event.takenOverAt, operationalNowMs);
    case 'current_control_handling':
      return active && event.lifecycleStatus === 'taken_over';
  }
}

export function computeMonitoringMetrics(
  events: readonly MonitoringEvent[],
  alarms: readonly Alarm[],
  user: SimulatedUser,
  operationalNowMs: number,
): MonitoringMetrics {
  const authorizedEvents = events.filter((event) => canAccessLocation(user, event.location));
  const authorizedAlarms = alarms.filter((alarm) => canAccessLocation(user, alarm.location));
  const alarmsByEvent = new Map(authorizedEvents.map((event) => [
    event.monitoringEventId,
    authorizedAlarms.filter((alarm) => event.alarmIds.includes(alarm.alarmId)),
  ]));
  const count = (key: MonitoringMetricKey) => authorizedEvents.filter((event) => matchesMonitoringMetric(
    key,
    event,
    alarmsByEvent.get(event.monitoringEventId) ?? [],
    operationalNowMs,
  )).length;
  return {
    todayDetected: authorizedAlarms.filter((alarm) => isInLocalNaturalDay(alarm.detectedAt, operationalNowMs)).length,
    currentPending: count('current_pending'),
    currentVerifying: count('current_verifying'),
    todayConfirmed: count('today_confirmed'),
    todayFalsePositive: count('today_false_positive'),
    currentOverdue: count('current_overdue'),
    todayTakenOver: count('today_taken_over'),
    currentControlHandling: count('current_control_handling'),
  };
}
