import { useEffect, useState } from 'react';
import GisNetworkMap from './components/GisNetworkMap';
import Timeline from './components/Timeline';
import PlanTracePanel from './components/PlanTracePanel';
import EventTriageList from './components/EventTriageList';
import TwinNarrativePanel from './components/TwinNarrativePanel';
import TrafficFlowMonitor from './components/TrafficFlowMonitor';
import InfrastructureMonitorGrid from './components/InfrastructureMonitorGrid';
import { useClockDriver } from './engine/clock';
import { nearestCameraId } from './data/devices';
import { TWIN_NARRATIVE_REFRESH_MS, useStore } from './store';

function App() {
  useClockDriver();
  const [selectedCameraId, setSelectedCameraId] = useState('CAM-1195');
  const [triageCollapsed, setTriageCollapsed] = useState(false);
  const [trafficChartCollapsed, setTrafficChartCollapsed] = useState(false);
  const [selectedInfrastructureDeviceId, setSelectedInfrastructureDeviceId] = useState<string>();
  const focusedEventId = useStore((s) => s.focusedEventId);
  const focusedEvent = useStore((s) => s.events.find((event) => event.id === s.focusedEventId));
  const requestTwinNarrative = useStore((s) => s.requestTwinNarrative);

  const handleCameraSelect = (cameraId: string) => {
    setSelectedCameraId(cameraId);
  };

  useEffect(() => {
    if (!focusedEventId || !focusedEvent) return;
    const cameraId = nearestCameraId(focusedEvent.road, focusedEvent.accidentKp);
    if (cameraId) setSelectedCameraId(cameraId);
  }, [focusedEvent, focusedEventId]);

  useEffect(() => {
    if (!focusedEventId) return;
    requestTwinNarrative(focusedEventId);
    const timer = window.setInterval(() => requestTwinNarrative(focusedEventId), TWIN_NARRATIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [focusedEventId, requestTwinNarrative]);

  return (
    <div className="app-shell w-screen h-screen bg-[var(--color-canvas)] p-4 flex flex-col gap-3">
      <Timeline />
      <div className={`app-main flex-1 min-h-0 relative ${triageCollapsed ? 'is-triage-collapsed' : ''}`}>
        <div className="app-triage min-h-0">
          <EventTriageList collapsed={triageCollapsed} onToggleCollapse={() => setTriageCollapsed((collapsed) => !collapsed)} />
        </div>
        <div className="app-map min-h-0">
          <div className="app-map-stack">
            <div className="app-map-canvas min-h-0">
              <GisNetworkMap
                selectedCameraId={selectedCameraId}
                focusedInfrastructureDeviceId={selectedInfrastructureDeviceId}
                onCameraSelect={handleCameraSelect}
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
          <div className="min-h-0">
            <TwinNarrativePanel event={focusedEvent} />
          </div>
          <div className="min-h-0">
            <TrafficFlowMonitor
              event={focusedEvent}
              chartCollapsed={trafficChartCollapsed}
              onChartCollapsedChange={setTrafficChartCollapsed}
            />
          </div>
        </div>
        <div className="app-plan min-h-0">
          <PlanTracePanel />
        </div>
      </div>
    </div>
  );
}

export default App;
