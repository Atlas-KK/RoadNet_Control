import type { ReactNode } from 'react';
import type { ActiveModule } from '../appShellState';

interface AppHeaderProps {
  activeModule: ActiveModule;
  onActiveModuleChange: (module: ActiveModule) => void;
  moduleActions?: ReactNode;
}

const MODULE_TABS: Array<{ id: ActiveModule; label: string }> = [
  { id: 'event_monitoring', label: '事件监测' },
  { id: 'intelligent_control', label: '智能管控' },
];

export default function AppHeader({ activeModule, onActiveModuleChange, moduleActions }: AppHeaderProps) {
  return (
    <header className="app-header timeline-shell arco-card flex h-[64px] shrink-0 items-center gap-3 px-4">
      <div className="app-brand shrink-0 flex items-center gap-2.5">
        <img src="/brand/shaanxi-highway-control.svg" alt="陕西交控" className="h-9 w-9 shrink-0" />
        <div className="text-sm font-bold tracking-wide text-[var(--color-ink)]">路网综合管控智能体</div>
      </div>

      <nav className="app-module-tabs" aria-label="一级模块" role="tablist">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeModule === tab.id}
            className="app-module-tab"
            data-testid={`module-tab-${tab.id}`}
            onClick={() => onActiveModuleChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="ml-auto flex min-w-0 items-center gap-3 pl-3">
        <span className="hidden 2xl:inline-flex items-center gap-1 whitespace-nowrap text-[10px] text-[var(--color-pass)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pass)] shadow-[0_0_8px_var(--color-pass)]" />
          系统在线
        </span>
        {moduleActions && (
          <>
            <div className="h-5 w-px shrink-0 bg-[var(--color-line)]" />
            <div className="app-module-actions min-w-0">{moduleActions}</div>
          </>
        )}
      </div>
    </header>
  );
}
