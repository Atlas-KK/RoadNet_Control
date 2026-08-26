import type { ReactNode } from 'react';

interface AppHeaderProps {
  moduleActions?: ReactNode;
  demoToolsEnabled?: boolean;
  onDemoToolsOpen?: () => void;
}

export default function AppHeader({ moduleActions, demoToolsEnabled = false, onDemoToolsOpen }: AppHeaderProps) {
  return (
    <header className="app-header flex h-[56px] shrink-0 items-center gap-3 px-4">
      <div className="app-brand shrink-0 flex items-center gap-2.5">
        <img src="/brand/shaanxi-highway-control.svg" alt="陕西交控" className="h-8 w-8 shrink-0" />
        <div className="text-sm font-bold tracking-wide text-[var(--color-ink)]">路网综合管控智能体</div>
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-3 pl-3">
        <span className="app-system-health inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-[var(--color-pass)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pass)] shadow-[0_0_8px_var(--color-pass)]" />
          系统在线
        </span>
        {demoToolsEnabled ? (
          <button type="button" className="app-environment-trigger" data-testid="demo-tools-trigger" onClick={onDemoToolsOpen}>
            <span>演示环境</span><strong>本地模拟</strong><span aria-hidden="true">›</span>
          </button>
        ) : <span className="app-production-tag">正式环境</span>}
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