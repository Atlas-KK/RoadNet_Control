import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMonitoringStore } from '../store';
import { useMonitoringUiStore } from '../uiState';
import CockpitWorkspace from './CockpitWorkspace';
import EventMonitoringWorkspace from './EventMonitoringWorkspace';

describe('驾驶舱与事件监测职责拆分', () => {
  beforeEach(() => {
    useMonitoringStore.setState({
      alarmsById: {}, monitoringEventsById: {}, activeEventIds: [], verificationTasksById: {}, handoffLinksById: {},
      persistenceState: 'ready', persistenceMessage: undefined,
    });
    useMonitoringUiStore.getState().resetFilters();
    useMonitoringUiStore.getState().setSelectedMonitoringEventId(undefined);
  });

  it('事件监测只保留闭环待办、筛选和实时事件', () => {
    const html = renderToStaticMarkup(<EventMonitoringWorkspace onOpenIntelligentControl={() => undefined} />);
    expect(html).not.toContain('data-testid="monitoring-page-header"');
    expect(html).not.toContain('aria-label="面包屑"');
    expect(html).not.toContain('<h1>实时事件</h1>');
    expect(html).not.toContain('<h2>待办状态</h2>');
    expect(html).toContain('<h2>事件筛选</h2>');
    expect(html).not.toContain('仅展示当前事件闭环所需状态，点击后同步事件筛选');
    expect(html).not.toContain('按事件属性、位置与核实状态组合查询');
    expect(html).toContain('当前待核实');
    expect(html).toContain('当前核实中');
    expect(html).toContain('当前核实超时');
    expect(html).toContain('当前接管处置中');
    expect(html).toContain('data-testid="monitoring-filter-bar"');
    expect(html).toContain('data-testid="monitoring-empty-state"');
    expect(html).toContain('/figma/arco/empty.svg');
    expect(html).not.toContain('<h2>实时事件</h2>');
    expect(html).not.toContain('按默认优先级展示待核实与持续监测事件');
    expect(html).not.toContain('起可见');
    expect(html).not.toContain('GIS态势感知');
    expect(html).not.toContain('演示控制台');
    expect(html).not.toContain('<h2>监测概览</h2>');
  });

  it('驾驶舱监测概览承载八项宏观指标', () => {
    const html = renderToStaticMarkup(<CockpitWorkspace activeView="video_monitoring" onOpenEventMonitoring={() => undefined} onOpenIntelligentControl={() => undefined} />);
    expect(html).toContain('data-testid="cockpit-workspace"');
    expect(html).toContain('aria-current="page">监测概览');
    expect(html).toContain('<h1>监测概览</h1>');
    expect(html).toContain('今日检测');
    expect(html).toContain('当前接管处置中');
    expect(html).toContain('进入实时事件');
  });

  it('GIS态势感知归属于驾驶舱并复用空间事件能力', () => {
    const html = renderToStaticMarkup(<CockpitWorkspace activeView="gis_awareness" onOpenEventMonitoring={() => undefined} onOpenIntelligentControl={() => undefined} />);
    expect(html).toContain('data-testid="monitoring-gis-view"');
    expect(html).toContain('data-testid="monitoring-gis-map"');
    expect(html).toContain('monitoring-gis-map-fullscreen-toggle');
    expect(html).toContain('aria-current="page">GIS态势感知');
    expect(html).toContain('模拟路网降级视图');
  });
});
