import { useEffect, useState } from 'react';
import AppHeader from './components/AppHeader';
import IntelligentControlWorkspace from './components/IntelligentControlWorkspace';
import RuntimeBar from './components/RuntimeBar';
import SimulatedUserSwitcher from './components/SimulatedUserSwitcher';
import EventMonitoringWorkspace from './monitoring/components/EventMonitoringWorkspace';
import { useClockDriver } from './engine/clock';
import {
  getBrowserSessionStorage,
  persistActiveModule,
  readActiveModule,
  type ActiveModule,
} from './appShellState';
import { useMonitoringStore } from './monitoring/store';
import { useMonitoringUiStore } from './monitoring/uiState';
import { useStore } from './store';
import './appShell.css';

function App() {
  useClockDriver();
  const [activeModule, setActiveModule] = useState<ActiveModule>(() => readActiveModule(getBrowserSessionStorage()));
  const activeMonitoringView = useMonitoringUiStore((state) => state.activeView);
  const setActiveMonitoringView = useMonitoringUiStore((state) => state.setActiveView);
  const initializeMonitoring = useMonitoringStore((state) => state.initialize);
  const focusControlEvent = useStore((state) => state.focusEvent);

  useEffect(() => {
    persistActiveModule(getBrowserSessionStorage(), activeModule);
  }, [activeModule]);

  useEffect(() => {
    void initializeMonitoring();
  }, [initializeMonitoring]);

  return (
    <div className="app-shell w-screen h-screen bg-[var(--color-canvas)] p-4 flex flex-col gap-3">
      <AppHeader
        activeModule={activeModule}
        onActiveModuleChange={setActiveModule}
        moduleActions={(
          <div className="flex items-center gap-2">
            <SimulatedUserSwitcher />
            {activeModule === 'intelligent_control' ? <RuntimeBar /> : undefined}
          </div>
        )}
      />
      {activeModule === 'event_monitoring' ? (
        <EventMonitoringWorkspace
          activeView={activeMonitoringView}
          onActiveViewChange={setActiveMonitoringView}
          onOpenIntelligentControl={(controlEventId) => {
            focusControlEvent(controlEventId);
            setActiveModule('intelligent_control');
          }}
        />
      ) : (
        <IntelligentControlWorkspace />
      )}
    </div>
  );
}

export default App;
