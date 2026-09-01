import type { HandoffLink } from '../domain/handoff';
import type { Alarm, MonitoringEvent, MonitoringEventType, MonitoringLevel, VerificationStatus } from '../domain/monitoring';
import { computeEventConfidence } from './engine/aggregation';
import { isInLocalNaturalDay, isMonitoringVerificationOverdue, matchesMonitoringMetric } from './engine/monitoringMetrics';
import { canAccessMonitoringEvent, type SimulatedUser } from './permissions';
import type { MonitoringFilters, MonitoringSort } from './uiState';

export const MONITORING_EVENT_TYPE_LABELS: Readonly<Record<MonitoringEventType, string>> = {
  traffic_congestion: '交通拥堵',
  traffic_accident: '交通事故',
  pedestrian_intrusion: '行人闯入',
  wrong_way_driving: '车辆逆行',
  reversing: '车辆倒车',
  abnormal_stop: '异常停车',
  fire: '火灾',
  road_debris: '抛洒物',
};

export const MONITORING_LEVEL_LABELS: Readonly<Record<MonitoringLevel, string>> = {
  L1: 'L1 提示', L2: 'L2 一般', L3: 'L3 较重', L4: 'L4 严重',
};

export const VERIFICATION_STATUS_LABELS: Readonly<Record<VerificationStatus, string>> = {
  pending: '待核实', verifying: '核实中', confirmed: '已确认', false_positive: '已误报',
};

export interface MonitoringListItem {
  event: MonitoringEvent;
  alarms: readonly Alarm[];
  primaryAlarm?: Alarm;
  displayLevel: MonitoringLevel;
  eventConfidence?: number;
  overdue: boolean;
  hasConflict: boolean;
  takenOver: boolean;
  handoff?: HandoffLink;
}

export interface MonitoringListInput {
  events: readonly MonitoringEvent[];
  alarms: readonly Alarm[];
  handoffs: readonly HandoffLink[];
  filters: MonitoringFilters;
  sort: MonitoringSort;
  user: SimulatedUser;
  operationalNowMs: number;
}

function latestAlarm(alarms: readonly Alarm[]): Alarm | undefined {
  return [...alarms].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))[0];
}

function dateAtOrAfter(value: string, minimum: string | undefined): boolean {
  if (!minimum) return true;
  return Date.parse(value) >= Date.parse(minimum);
}

function dateAtOrBefore(value: string, maximum: string | undefined): boolean {
  if (!maximum) return true;
  return Date.parse(value) <= Date.parse(maximum);
}

function levelRank(level: MonitoringLevel): number {
  return { L1: 1, L2: 2, L3: 3, L4: 4 }[level];
}

function itemMatchesFilters(item: MonitoringListItem, filters: MonitoringFilters, operationalNowMs: number): boolean {
  const { event, alarms, primaryAlarm } = item;
  if (filters.quickMetric && !matchesMonitoringMetric(filters.quickMetric, event, alarms, operationalNowMs)) return false;
  if (filters.eventTypes.length && !filters.eventTypes.includes(event.eventType)) return false;
  if (filters.verificationStatuses.length && !filters.verificationStatuses.includes(event.verificationStatus)) return false;
  if (filters.levels.length && !filters.levels.includes(item.displayLevel)) return false;
  if (filters.roadCodes.length && !filters.roadCodes.includes(event.location.roadCode)) return false;
  if (filters.directions.length && !filters.directions.includes(event.location.direction)) return false;
  if (filters.deviceIds.length && !alarms.some((alarm) => alarm.location.deviceId && filters.deviceIds.includes(alarm.location.deviceId))) return false;
  if (filters.minimumConfidence !== undefined && (item.eventConfidence ?? -1) < filters.minimumConfidence) return false;
  if (!dateAtOrAfter(event.detectedAt, filters.detectedFrom) || !dateAtOrBefore(event.detectedAt, filters.detectedTo)) return false;
  const keyword = filters.keyword.trim().toLocaleLowerCase();
  if (keyword) {
    const haystack = [
      event.monitoringEventId,
      MONITORING_EVENT_TYPE_LABELS[event.eventType],
      event.location.roadCode,
      event.location.facilityId,
      primaryAlarm?.location.deviceId,
    ].filter(Boolean).join(' ').toLocaleLowerCase();
    if (!haystack.includes(keyword)) return false;
  }
  return true;
}

function compareDefault(left: MonitoringListItem, right: MonitoringListItem): number {
  const priorityDifference = Number(Boolean(right.event.reviewPriorityAt)) - Number(Boolean(left.event.reviewPriorityAt));
  if (priorityDifference) return priorityDifference;
  if (left.event.reviewPriorityAt && right.event.reviewPriorityAt) {
    const priorityTimeDifference = right.event.reviewPriorityAt.localeCompare(left.event.reviewPriorityAt);
    if (priorityTimeDifference) return priorityTimeDifference;
  }
  if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
  const levelDifference = levelRank(right.displayLevel) - levelRank(left.displayLevel);
  if (levelDifference) return levelDifference;
  const leftPending = left.event.verificationStatus === 'pending';
  const rightPending = right.event.verificationStatus === 'pending';
  if (leftPending !== rightPending) return leftPending ? -1 : 1;
  return right.event.detectedAt.localeCompare(left.event.detectedAt);
}

export function buildMonitoringListItems(input: MonitoringListInput): MonitoringListItem[] {
  const alarmById = new Map(input.alarms.map((alarm) => [alarm.alarmId, alarm]));
  const handoffByEventId = new Map(input.handoffs.map((handoff) => [handoff.monitoringEventId, handoff]));
  const items = input.events
    .filter((event) => canAccessMonitoringEvent(input.user, event))
    .map((event): MonitoringListItem => {
      const alarms = event.alarmIds.map((alarmId) => alarmById.get(alarmId)).filter((alarm): alarm is Alarm => Boolean(alarm));
      const handoff = handoffByEventId.get(event.monitoringEventId);
      return {
        event,
        alarms,
        primaryAlarm: latestAlarm(alarms),
        displayLevel: event.confirmedLevel ?? event.suggestedLevel,
        eventConfidence: computeEventConfidence(alarms).confidence,
        overdue: isMonitoringVerificationOverdue(event, input.operationalNowMs),
        hasConflict: event.conflicts.some((conflict) => conflict.status === 'pending'),
        takenOver: event.lifecycleStatus === 'taken_over' || Boolean(event.controlEventId || event.handoffId || handoff),
        handoff,
      };
    })
    .filter((item) => itemMatchesFilters(item, input.filters, input.operationalNowMs));

  return items.sort((left, right) => {
    if (input.sort === 'detected_desc') return right.event.detectedAt.localeCompare(left.event.detectedAt);
    if (input.sort === 'level_desc') {
      return levelRank(right.displayLevel) - levelRank(left.displayLevel)
        || right.event.detectedAt.localeCompare(left.event.detectedAt);
    }
    return compareDefault(left, right);
  });
}

export function monitoringFilterOptionValues(events: readonly MonitoringEvent[], alarms: readonly Alarm[]) {
  return {
    roadCodes: [...new Set(events.map((event) => event.location.roadCode))].sort(),
    deviceIds: [...new Set(alarms.map((alarm) => alarm.location.deviceId).filter((value): value is string => Boolean(value)))].sort(),
  };
}

export function describeDetectedTime(value: string, nowMs: number): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '时间无效';
  const differenceSeconds = Math.max(0, Math.floor((nowMs - timestamp) / 1000));
  if (differenceSeconds < 60) return `${differenceSeconds}秒前`;
  if (differenceSeconds < 3_600) return `${Math.floor(differenceSeconds / 60)}分钟前`;
  if (isInLocalNaturalDay(value, nowMs)) return new Date(timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return new Date(timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
