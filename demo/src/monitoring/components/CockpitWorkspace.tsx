import { useMemo } from 'react';
import { isActiveMonitoringLifecycle } from '../../domain/monitoring';
import { computeMonitoringMetrics, type MonitoringMetricKey } from '../engine/monitoringMetrics';
import { canAccessMonitoringEvent } from '../permissions';
import { buildMonitoringListItems, monitoringFilterOptionValues } from '../selectors';
import { SystemOperationalClock } from '../services/operationalClock';
import { selectCurrentSimulatedUser, useMonitoringStore } from '../store';
import { DEFAULT_MONITORING_FILTERS, type MonitoringView, useMonitoringUiStore } from '../uiState';
import MonitoringEventDrawer from './MonitoringEventDrawer';
import MonitoringGisView from './MonitoringGisView';
import MonitoringOverview from './MonitoringOverview';
import '../monitoring.css';

interface CockpitWorkspaceProps {
  activeView: MonitoringView;
  onOpenEventMonitoring: () => void;
  onOpenIntelligentControl: (controlEventId: string) => void;
}

const operationalClock = new SystemOperationalClock();

export default function CockpitWorkspace({ activeView, onOpenEventMonitoring, onOpenIntelligentControl }: CockpitWorkspaceProps) {
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
  const drawerTab = useMonitoringUiStore((state) => state.drawerTab);
  const setFilters = useMonitoringUiStore((state) => state.setFilters);
  const resetFilters = useMonitoringUiStore((state) => state.resetFilters);
  const setSort = useMonitoringUiStore((state) => state.setSort);
  const setSelectedEventId = useMonitoringUiStore((state) => state.setSelectedMonitoringEventId);
  const setDrawerTab = useMonitoringUiStore((state) => state.setDrawerTab);

  const alarms = useMemo(() => Object.values(alarmsById), [alarmsById]);
  const events = useMemo(() => Object.values(eventsById).filter((event) => isActiveMonitoringLifecycle(event.lifecycleStatus)), [eventsById]);
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
  const isGis = activeView === 'gis_awareness';

  const openMetric = (metric: MonitoringMetricKey) => {
    setFilters({ quickMetric: metric });
    onOpenEventMonitoring();
  };

  return (
    <main className="cockpit-workspace flex min-h-0 flex-1 flex-col gap-3" data-testid="cockpit-workspace">
      <header className="monitoring-page-header arco-card" data-testid="cockpit-page-header">
        <nav className="monitoring-breadcrumb" aria-label="面包屑"><span>路网综合管控</span><i aria-hidden="true">/</i><span>驾驶舱</span><i aria-hidden="true">/</i><strong aria-current="page">{isGis ? 'GIS态势感知' : '监测概览'}</strong></nav>
        <div className="monitoring-page-heading">
          <div><div className="monitoring-page-title-row"><h1>{isGis ? 'GIS态势感知' : '监测概览'}</h1></div><p>{isGis ? '从空间维度掌握路网事件分布、聚合和运行态势。' : '汇总路网监测关键指标，快速识别需要关注的运行状态。'}</p></div>
        </div>
      </header>

      {persistenceMessage ? <div className="arco-alert arco-alert-warning" role="status">{persistenceMessage}</div> : undefined}
      {isGis ? (
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
        <section className="cockpit-overview-content arco-card">
          <div className="cockpit-overview-intro"><div><span className="cockpit-eyebrow">全路网运行快照</span><h2>重点状态一屏掌握</h2><p>指标按当前登录机构权限汇总，点击后进入事件监测并同步筛选条件。</p></div><button type="button" className="arco-button arco-button-primary" onClick={onOpenEventMonitoring}>进入实时事件</button></div>
          <MonitoringOverview metrics={persistenceState === 'error' ? undefined : metrics} activeMetric={filters.quickMetric} onMetricClick={openMetric} />
        </section>
      )}

      {selectedItem ? <MonitoringEventDrawer item={selectedItem} activeTab={drawerTab} onTabChange={setDrawerTab} onClose={() => setSelectedEventId(undefined)} onOpenIntelligentControl={onOpenIntelligentControl} /> : undefined}
    </main>
  );
}