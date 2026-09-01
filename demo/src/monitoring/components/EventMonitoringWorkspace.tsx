import { useMemo } from 'react';
import { isActiveMonitoringLifecycle } from '../../domain/monitoring';
import { computeMonitoringMetrics, type MonitoringMetricKey } from '../engine/monitoringMetrics';
import { canAccessMonitoringEvent } from '../permissions';
import { monitoringFilterOptionValues, buildMonitoringListItems } from '../selectors';
import { SystemOperationalClock } from '../services/operationalClock';
import { selectCurrentSimulatedUser, useMonitoringStore } from '../store';
import { DEFAULT_MONITORING_FILTERS, useMonitoringUiStore } from '../uiState';
import { isDefaultMonitoringEventId } from '../adapters/defaultMonitoringEvents';
import MonitoringEventDrawer from './MonitoringEventDrawer';
import MonitoringFilterBar from './MonitoringFilterBar';
import MonitoringOverview from './MonitoringOverview';
import MonitoringResiliencePanel from './MonitoringResiliencePanel';
import VideoEventGrid from './VideoEventGrid';
import '../monitoring.css';

interface EventMonitoringWorkspaceProps {
  onOpenIntelligentControl: (controlEventId: string) => void;
}

const EVENT_TASK_METRICS: readonly MonitoringMetricKey[] = ['current_pending', 'current_verifying', 'current_overdue', 'current_control_handling'];
const operationalClock = new SystemOperationalClock();

export default function EventMonitoringWorkspace({ onOpenIntelligentControl }: EventMonitoringWorkspaceProps) {
  const alarmsById = useMonitoringStore((state) => state.alarmsById);
  const eventsById = useMonitoringStore((state) => state.monitoringEventsById);
  const handoffsById = useMonitoringStore((state) => state.handoffLinksById);
  const persistenceState = useMonitoringStore((state) => state.persistenceState);
  const persistenceMessage = useMonitoringStore((state) => state.persistenceMessage);
  const dependencyHealth = useMonitoringStore((state) => state.dependencyHealth);
  const currentUser = useMonitoringStore(selectCurrentSimulatedUser);
  const filters = useMonitoringUiStore((state) => state.filters);
  const sort = useMonitoringUiStore((state) => state.sort);
  const selectedEventId = useMonitoringUiStore((state) => state.selectedMonitoringEventId);
  const gridScrollOffset = useMonitoringUiStore((state) => state.gridScrollOffset);
  const drawerTab = useMonitoringUiStore((state) => state.drawerTab);
  const demoDatasetScope = useMonitoringUiStore((state) => state.demoDatasetScope);
  const setFilters = useMonitoringUiStore((state) => state.setFilters);
  const resetFilters = useMonitoringUiStore((state) => state.resetFilters);
  const setSort = useMonitoringUiStore((state) => state.setSort);
  const setSelectedEventId = useMonitoringUiStore((state) => state.setSelectedMonitoringEventId);
  const setGridScrollOffset = useMonitoringUiStore((state) => state.setGridScrollOffset);
  const setDrawerTab = useMonitoringUiStore((state) => state.setDrawerTab);

  const alarms = useMemo(() => Object.values(alarmsById), [alarmsById]);
  const events = useMemo(() => Object.values(eventsById).filter((event) => (
    isActiveMonitoringLifecycle(event.lifecycleStatus)
      && (demoDatasetScope === 'all' || isDefaultMonitoringEventId(event.monitoringEventId))
  )), [demoDatasetScope, eventsById]);
  const handoffs = useMemo(() => Object.values(handoffsById), [handoffsById]);
  const authorizedEvents = useMemo(() => events.filter((event) => canAccessMonitoringEvent(currentUser, event)), [currentUser, events]);
  const authorizedAlarmIds = useMemo(() => new Set(authorizedEvents.flatMap((event) => event.alarmIds)), [authorizedEvents]);
  const authorizedAlarms = useMemo(() => alarms.filter((alarm) => authorizedAlarmIds.has(alarm.alarmId)), [alarms, authorizedAlarmIds]);
  const operationalNowMs = operationalClock.nowMs();
  const metrics = useMemo(() => computeMonitoringMetrics(events, alarms, currentUser, operationalNowMs), [alarms, currentUser, events, operationalNowMs]);
  const items = useMemo(() => buildMonitoringListItems({ events, alarms, handoffs, filters, sort, user: currentUser, operationalNowMs }), [alarms, currentUser, events, filters, handoffs, operationalNowMs, sort]);
  const allAuthorizedItems = useMemo(() => buildMonitoringListItems({ events, alarms, handoffs, filters: DEFAULT_MONITORING_FILTERS, sort: 'default_priority', user: currentUser, operationalNowMs }), [alarms, currentUser, events, handoffs, operationalNowMs]);
  const filterOptions = useMemo(() => monitoringFilterOptionValues(authorizedEvents, authorizedAlarms), [authorizedAlarms, authorizedEvents]);
  const selectedItem = allAuthorizedItems.find((item) => item.event.monitoringEventId === selectedEventId);

  const applyMetric = (metric: MonitoringMetricKey) => setFilters({ quickMetric: filters.quickMetric === metric ? undefined : metric });

  return (
    <main className="event-monitoring-workspace flex min-h-0 flex-1 flex-col gap-3" data-testid="event-monitoring-workspace">
      <MonitoringResiliencePanel />
      <section className="monitoring-video-view" data-testid="monitoring-video-view">
        {persistenceMessage ? <div className="arco-alert arco-alert-warning" role="status">{persistenceMessage}</div> : undefined}
        <MonitoringOverview
          metrics={persistenceState === 'error' ? undefined : metrics}
          activeMetric={filters.quickMetric}
          metricKeys={EVENT_TASK_METRICS}
          title="待办状态"
          description=""
          compact
          hideHeading
          onMetricClick={applyMetric}
        />
        <MonitoringFilterBar filters={filters} sort={sort} roadCodes={filterOptions.roadCodes} deviceIds={filterOptions.deviceIds} resultCount={items.length} onFiltersChange={setFilters} onSortChange={setSort} onReset={resetFilters} />
        <VideoEventGrid
          items={items}
          allEventIds={authorizedEvents.map((event) => event.monitoringEventId)}
          operationalNowMs={operationalNowMs}
          selectedEventId={selectedEventId}
          scrollOffset={gridScrollOffset}
          onScrollOffsetChange={setGridScrollOffset}
          onOpen={(eventId) => { setSelectedEventId(eventId); setDrawerTab('video'); }}
          onResetFilters={resetFilters}
          videoUnavailableReason={dependencyHealth.video.availability === 'degraded' ? dependencyHealth.video.reason : undefined}
        />
      </section>

      {selectedItem ? <MonitoringEventDrawer item={selectedItem} activeTab={drawerTab} onTabChange={setDrawerTab} onClose={() => setSelectedEventId(undefined)} onOpenIntelligentControl={onOpenIntelligentControl} /> : undefined}
    </main>
  );
}
