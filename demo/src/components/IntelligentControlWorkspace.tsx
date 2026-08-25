import { useEffect, useState } from 'react';
import GisNetworkMap from './GisNetworkMap';
import PlanTracePanel from './PlanTracePanel';
import EventTriageList from './EventTriageList';
import TwinNarrativePanel from './TwinNarrativePanel';
import TrafficFlowMonitor from './TrafficFlowMonitor';
import InfrastructureMonitorGrid from './InfrastructureMonitorGrid';
import { nearestCameraId } from '../data/devices';
import { TWIN_NARRATIVE_REFRESH_MS, useStore } from '../store';

// FR-EM-001：从原App提取，保持现有智能管控四列布局和业务行为不变。
export default function IntelligentControlWorkspace() {
  const [selectedCameraId, setSelectedCameraId] = useState('CAM-1195');
  const [triageCollapsed, setTriageCollapsed] = useState(false);
  const [trafficChartCollapsed, setTrafficChartCollapsed] = useState(false);
  const [selectedInfrastructureDeviceId, setSelectedInfrastructureDeviceId] = useState<string>();
  const focusedEventId = useStore((s) => s.focusedEventId);
  const focusedEvent = useStore((s) => s.events.find((event) => event.id === s.focusedEventId));
  const focusedPlanningGap = useStore((s) => s.planningGaps.find((gap) => gap.controlEventId === s.focusedEventId));
  const requestTwinNarrative = useStore((s) => s.requestTwinNarrative);

  useEffect(() => {
    if (!focusedEventId || !focusedEvent) return;
    const cameraId = nearestCameraId(focusedEvent.road, focusedEvent.accidentKp);
    if (cameraId) setSelectedCameraId(cameraId);
  }, [focusedEvent, focusedEventId]);

  useEffect(() => {
    if (!focusedEventId || !focusedEvent) return;
    requestTwinNarrative(focusedEventId);
    const timer = window.setInterval(() => requestTwinNarrative(focusedEventId), TWIN_NARRATIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [focusedEvent, focusedEventId, requestTwinNarrative]);

  if (focusedPlanningGap && !focusedEvent) {
    return (
      <div className="app-main flex-1 min-h-0 relative" data-testid="intelligent-control-workspace">
        <section className="arco-card m-4 p-6" data-testid="control-planning-gap">
          <span className="arco-tag">已接收 · 待补充事实</span>
          <h2>事件已接管，暂不能生成可执行预案</h2>
          <p>{focusedPlanningGap.reason}</p>
          <dl>
            <div><dt>智能管控事件</dt><dd>{focusedPlanningGap.controlEventId}</dd></div>
            <div><dt>监测事件</dt><dd>{focusedPlanningGap.monitoringEventId}</dd></div>
            <div><dt>接管编号</dt><dd>{focusedPlanningGap.handoffId}</dd></div>
            <div><dt>待补充事实</dt><dd>{focusedPlanningGap.missingFacts.join('、')}</dd></div>
          </dl>
          <p>补齐事实后方可重新研判；系统未生成空参数措施，也未自动下发任何控制指令。</p>
        </section>
      </div>
    );
  }

  return (
    <div
      className={`app-main flex-1 min-h-0 relative ${triageCollapsed ? 'is-triage-collapsed' : ''}`}
      data-testid="intelligent-control-workspace"
    >
      <div className="app-triage min-h-0">
        <EventTriageList collapsed={triageCollapsed} onToggleCollapse={() => setTriageCollapsed((collapsed) => !collapsed)} />
      </div>
      <div className="app-map min-h-0">
        <div className="app-map-stack">
          <div className="app-map-canvas min-h-0">
            <GisNetworkMap
              selectedCameraId={selectedCameraId}
              focusedInfrastructureDeviceId={selectedInfrastructureDeviceId}
              onCameraSelect={setSelectedCameraId}
              onInfrastructureDeviceSelect={setSelectedInfrastructureDeviceId}
            />
          </div>
          <div className="app-infrastructure-monitor min-h-0">
            <InfrastructureMonitorGrid
              event={focusedEvent}
              selectedDeviceId={selectedInfrastructureDeviceId}
              onDeviceSelect={setSelectedInfrastructureDeviceId}
            />
          </div>
        </div>
      </div>
      <div
        className="app-narrative grid min-h-0 grid-rows-2 gap-3"
        style={trafficChartCollapsed ? { gridTemplateRows: 'minmax(0, 8fr) minmax(0, 2fr)' } : undefined}
      >
        <div className="min-h-0"><TwinNarrativePanel event={focusedEvent} /></div>
        <div className="min-h-0">
          <TrafficFlowMonitor event={focusedEvent} chartCollapsed={trafficChartCollapsed} onChartCollapsedChange={setTrafficChartCollapsed} />
        </div>
      </div>
      <div className="app-plan min-h-0"><PlanTracePanel /></div>
    </div>
  );
}
