import type { ActiveModule } from '../appShellState';
import type { MonitoringView } from '../monitoring/uiState';

interface AppSidebarProps {
  activeModule: ActiveModule;
  activeCockpitView: MonitoringView;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onModuleChange: (module: ActiveModule) => void;
  onCockpitViewChange: (view: MonitoringView) => void;
}

const SIDER_ASSETS = {
  dashboard: '/figma/arco/dashboard.svg',
  event: '/figma/arco/event.svg',
  control: '/figma/arco/control.svg',
  arrowUp: '/figma/arco/caret-up.svg',
  arrowDown: '/figma/arco/caret-down.svg',
  menuFold: '/figma/arco/menu-fold.svg',
} as const;

function NavIcon({ src }: { src: string }) {
  return <span className="app-nav-icon" aria-hidden="true"><img src={src} alt="" /></span>;
}

export default function AppSidebar(props: AppSidebarProps) {
  const cockpitExpanded = props.activeModule === 'cockpit';
  const selectCockpit = (view: MonitoringView) => {
    props.onCockpitViewChange(view);
    props.onModuleChange('cockpit');
  };

  return (
    <aside className="app-sidebar" data-collapsed={props.collapsed} data-testid="app-sidebar" data-figma-node-id="1413:16368">
      <nav className="app-sidebar-nav" aria-label="主导航">
        <div className="app-nav-group" data-active={cockpitExpanded}>
          <button
            type="button"
            className="app-nav-item app-nav-parent"
            aria-expanded={cockpitExpanded}
            onClick={() => selectCockpit('video_monitoring')}
          >
            <NavIcon src={SIDER_ASSETS.dashboard} />
            <span className="app-nav-label">驾驶舱</span>
            <img className="app-nav-chevron" src={cockpitExpanded ? SIDER_ASSETS.arrowUp : SIDER_ASSETS.arrowDown} alt="" aria-hidden="true" />
          </button>
          {cockpitExpanded ? (
            <div className="app-nav-children" aria-label="驾驶舱子栏目">
              <button type="button" className="app-nav-child" aria-current={props.activeCockpitView === 'video_monitoring' ? 'page' : undefined} data-testid="nav-cockpit-overview" onClick={() => selectCockpit('video_monitoring')}>
                <span className="app-nav-label">监测概览</span>
              </button>
              <button type="button" className="app-nav-child" aria-current={props.activeCockpitView === 'gis_awareness' ? 'page' : undefined} data-testid="nav-cockpit-gis" onClick={() => selectCockpit('gis_awareness')}>
                <span className="app-nav-label">GIS态势感知</span>
              </button>
            </div>
          ) : undefined}
        </div>
        <button type="button" className="app-nav-item app-nav-leaf" aria-current={props.activeModule === 'event_monitoring' ? 'page' : undefined} data-testid="nav-event-monitoring" onClick={() => props.onModuleChange('event_monitoring')}>
          <NavIcon src={SIDER_ASSETS.event} /><span className="app-nav-label">事件监测</span>
        </button>
        <button type="button" className="app-nav-item app-nav-leaf" aria-current={props.activeModule === 'intelligent_control' ? 'page' : undefined} data-testid="nav-intelligent-control" onClick={() => props.onModuleChange('intelligent_control')}>
          <NavIcon src={SIDER_ASSETS.control} /><span className="app-nav-label">智能管控</span>
        </button>
      </nav>
      <button type="button" className="app-sidebar-collapse" aria-label={props.collapsed ? '展开导航' : '收起导航'} onClick={() => props.onCollapsedChange(!props.collapsed)}>
        <img src={SIDER_ASSETS.menuFold} alt="" aria-hidden="true" />
      </button>
    </aside>
  );
}
