import { useEffect, useState } from 'react';
import AppHeader from './components/AppHeader';
import AppSidebar from './components/AppSidebar';
import IntelligentControlWorkspace from './components/IntelligentControlWorkspace';
import RuntimeBar from './components/RuntimeBar';
import EventMonitoringWorkspace from './monitoring/components/EventMonitoringWorkspace';
import CockpitWorkspace from './monitoring/components/CockpitWorkspace';
import MonitoringDemoBar from './monitoring/components/MonitoringDemoBar';
import { useClockDriver } from './engine/clock';
import { getBrowserSessionStorage, persistActiveModule, readActiveModule, type ActiveModule } from './appShellState';
import { useMonitoringStore } from './monitoring/store';
import { monitoringDemoRuntime } from './monitoring/services/monitoringDemoRuntime';
import { useMonitoringUiStore } from './monitoring/uiState';
import { useStore } from './store';
import './appShell.css';

function App() {
  useClockDriver();
  const [activeModule, setActiveModule] = useState<ActiveModule>(() => readActiveModule(getBrowserSessionStorage()));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [demoToolsOpen, setDemoToolsOpen] = useState(false);
  const activeCockpitView = useMonitoringUiStore((state) => state.activeView);
  const setActiveCockpitView = useMonitoringUiStore((state) => state.setActiveView);
  const initializeMonitoring = useMonitoringStore((state) => state.initialize);
  const focusControlEvent = useStore((state) => state.focusEvent);
  const demoToolsEnabled = import.meta.env.DEV || import.meta.env.VITE_MONITORING_DEMO_TOOLS === 'true';

  useEffect(() => {
    persistActiveModule(getBrowserSessionStorage(), activeModule);
  }, [activeModule]);

  useEffect(() => {
    void initializeMonitoring().then(() => monitoringDemoRuntime.connect());
    return () => monitoringDemoRuntime.dispose();
  }, [initializeMonitoring]);

  const openIntelligentControl = (controlEventId: string) => {
    focusControlEvent(controlEventId);
    setActiveModule('intelligent_control');
  };

  return (
    <div className="app-shell w-screen h-screen bg-[var(--color-canvas)] flex flex-col">
      <AppHeader
        demoToolsEnabled={demoToolsEnabled}
        onDemoToolsOpen={() => setDemoToolsOpen(true)}
        moduleActions={activeModule === 'intelligent_control' ? <RuntimeBar /> : undefined}
      />
      <div className="app-shell-body">
        <AppSidebar
          activeModule={activeModule}
          activeCockpitView={activeCockpitView}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          onModuleChange={setActiveModule}
          onCockpitViewChange={setActiveCockpitView}
        />
        <section className="app-workspace" aria-label="业务工作区">
          {activeModule === 'cockpit' ? (
            <CockpitWorkspace activeView={activeCockpitView} onOpenEventMonitoring={() => setActiveModule('event_monitoring')} onOpenIntelligentControl={openIntelligentControl} />
          ) : activeModule === 'event_monitoring' ? (
            <EventMonitoringWorkspace onOpenIntelligentControl={openIntelligentControl} />
          ) : (
            <main className="intelligent-control-module flex min-h-0 flex-1 flex-col gap-3" data-testid="intelligent-control-module">
              <header className="monitoring-page-header arco-card">
                <nav className="monitoring-breadcrumb" aria-label="面包屑"><span>路网综合管控</span><i aria-hidden="true">/</i><strong aria-current="page">智能管控</strong></nav>
                <div className="monitoring-page-heading"><div><div className="monitoring-page-title-row"><h1>智能管控</h1></div><p>围绕已接管事件开展态势研判、资源协同与处置方案跟踪。</p></div></div>
              </header>
              <IntelligentControlWorkspace />
            </main>
          )}
        </section>
      </div>
      {demoToolsEnabled ? <MonitoringDemoBar open={demoToolsOpen} onClose={() => setDemoToolsOpen(false)} /> : undefined}
    </div>
  );
}

export default App;