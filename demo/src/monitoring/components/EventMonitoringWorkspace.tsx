import { useMemo } from 'react';
import { isActiveMonitoringLifecycle } from '../../domain/monitoring';
import { computeMonitoringMetrics, type MonitoringMetricKey } from '../engine/monitoringMetrics';
import { canAccessMonitoringEvent } from '../permissions';
import { monitoringFilterOptionValues, buildMonitoringListItems } from '../selectors';
import { SystemOperationalClock } from '../services/operationalClock';
import { selectCurrentSimulatedUser, useMonitoringStore } from '../store';
import {
  DEFAULT_MONITORING_FILTERS,
  useMonitoringUiStore,
  type MonitoringView,
} from '../uiState';
import MonitoringEventDrawer from './MonitoringEventDrawer';
import MonitoringFilterBar from './MonitoringFilterBar';
import MonitoringGisView from './MonitoringGisView';
import MonitoringOverview from './MonitoringOverview';
import MonitoringResiliencePanel from './MonitoringResiliencePanel';
import VideoEventGrid from './VideoEventGrid';
import '../monitoring.css';

interface EventMonitoringWorkspaceProps {
  activeView: MonitoringView;
  onActiveViewChange: (view: MonitoringView) => void;
  onOpenIntelligentControl: (controlEventId: string) => void;
}

const VIEW_TABS: Array<{ id: MonitoringView; label: string }> = [
  { id: 'video_monitoring', label: '视频事件监测' },
  { id: 'gis_awareness', label: 'GIS态势感知' },
];

const operationalClock = new SystemOperationalClock();

// FR-EM-001 / 004 / 005 / 008：视频与GIS共用同一权限过滤、筛选状态、选中事件和详情抽屉。
export default function EventMonitoringWorkspace({ activeView, onActiveViewChange, onOpenIntelligentControl }: EventMonitoringWorkspaceProps) {
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
  const setFilters = useMonitoringUiStore((state) => state.setFilters);
  const resetFilters = useMonitoringUiStore((state) => state.resetFilters);
  const setSort = useMonitoringUiStore((state) => state.setSort);
  const setSelectedEventId = useMonitoringUiStore((state) => state.setSelectedMonitoringEventId);
  const setGridScrollOffset = useMonitoringUiStore((state) => state.setGridScrollOffset);
  const setDrawerTab = useMonitoringUiStore((state) => state.setDrawerTab);

  const alarms = useMemo(() => Object.values(alarmsById), [alarmsById]);
  const events = useMemo(() => Object.values(eventsById).filter((event) => isActiveMonitoringLifecycle(event.lifecycleStatus)), [eventsById]);
  const handoffs = useMemo(() => Object.values(handoffsById), [handoffsById]);
  const authorizedEvents = useMemo(() => events.filter((event) => canAccessMonitoringEvent(currentUser, event)), [currentUser, events]);
  const authorizedAlarmIds = useMemo(() => new Set(authorizedEvents.flatMap((event) => event.alarmIds)), [authorizedEvents]);
  const authorizedAlarms = useMemo(() => alarms.filter((alarm) => authorizedAlarmIds.has(alarm.alarmId)), [alarms, authorizedAlarmIds]);
  const operationalNowMs = operationalClock.nowMs();

  const metrics = useMemo(
    () => computeMonitoringMetrics(events, alarms, currentUser, operationalNowMs),
    [alarms, currentUser, events, operationalNowMs],
  );
  const items = useMemo(() => buildMonitoringListItems({
    events, alarms, handoffs, filters, sort, user: currentUser, operationalNowMs,
  }), [alarms, currentUser, events, filters, handoffs, operationalNowMs, sort]);
  const allAuthorizedItems = useMemo(() => buildMonitoringListItems({
    events, alarms, handoffs, filters: DEFAULT_MONITORING_FILTERS, sort: 'default_priority', user: currentUser, operationalNowMs,
  }), [alarms, currentUser, events, handoffs, operationalNowMs]);
  const filterOptions = useMemo(
    () => monitoringFilterOptionValues(authorizedEvents, authorizedAlarms),
    [authorizedAlarms, authorizedEvents],
  );
  const selectedItem = allAuthorizedItems.find((item) => item.event.monitoringEventId === selectedEventId);

  const applyMetric = (metric: MonitoringMetricKey) => {
    setFilters({ quickMetric: filters.quickMetric === metric ? undefined : metric });
  };

  return (
    <main className="event-monitoring-workspace flex min-h-0 flex-1 flex-col gap-3" data-testid="event-monitoring-workspace">
      <nav className="monitoring-view-tabs arco-card" aria-label="事件监测视图" role="tablist">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeView === tab.id}
            className="monitoring-view-tab"
            data-testid={`monitoring-view-${tab.id}`}
            onClick={() => onActiveViewChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <MonitoringResiliencePanel />

      {activeView === 'gis_awareness' ? (
        <MonitoringGisView
          items={items}
          filters={filters}
          sort={sort}
          roadCodes={filterOptions.roadCodes}
          deviceIds={filterOptions.deviceIds}
          selectedEventId={selectedEventId}
          onFiltersChange={setFilters}
          onSortChange={setSort}
          onResetFilters={resetFilters}
          onSelectEvent={(eventId) => { setSelectedEventId(eventId); setDrawerTab('video'); }}
          forceUnavailableReason={dependencyHealth.gis.availability === 'degraded' ? dependencyHealth.gis.reason : undefined}
        />
      ) : (
        <section className="monitoring-video-view" data-testid="monitoring-video-view">
          {persistenceMessage ? <div className="arco-alert arco-alert-warning" role="status">{persistenceMessage}</div> : undefined}
          <MonitoringOverview
            metrics={persistenceState === 'error' ? undefined : metrics}
            activeMetric={filters.quickMetric}
            onMetricClick={applyMetric}
          />
          <MonitoringFilterBar
            filters={filters}
            sort={sort}
            roadCodes={filterOptions.roadCodes}
            deviceIds={filterOptions.deviceIds}
            resultCount={items.length}
            onFiltersChange={setFilters}
            onSortChange={setSort}
            onReset={resetFilters}
          />
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
      )}

      {selectedItem ? (
        <MonitoringEventDrawer
          item={selectedItem}
          activeTab={drawerTab}
          onTabChange={setDrawerTab}
          onClose={() => setSelectedEventId(undefined)}
          onOpenIntelligentControl={onOpenIntelligentControl}
        />
      ) : undefined}
    </main>
  );
}

