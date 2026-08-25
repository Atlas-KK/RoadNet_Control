import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMonitoringStore } from '../store';
import { useMonitoringUiStore } from '../uiState';
import EventMonitoringWorkspace from './EventMonitoringWorkspace';

describe('FR-EM-001 / FR-EM-004 / FR-EM-008 事件监测工作台', () => {
  beforeEach(() => {
    useMonitoringStore.setState({
      alarmsById: {}, monitoringEventsById: {}, activeEventIds: [], verificationTasksById: {}, handoffLinksById: {},
      persistenceState: 'ready', persistenceMessage: undefined,
    });
    useMonitoringUiStore.getState().resetFilters();
    useMonitoringUiStore.getState().setSelectedMonitoringEventId(undefined);
  });

  it('视频视图包含工作指标、筛选和明确空状态', () => {
    const html = renderToStaticMarkup(
      <EventMonitoringWorkspace activeView="video_monitoring" onActiveViewChange={() => undefined} onOpenIntelligentControl={() => undefined} />,
    );
    expect(html).toContain('视频事件监测');
    expect(html).toContain('GIS态势感知');
    expect(html).toContain('data-testid="monitoring-overview"');
    expect(html).toContain('data-testid="monitoring-filter-bar"');
    expect(html).toContain('data-testid="monitoring-empty-state"');
  });

  it('GIS视图完成P0事件点、聚合、筛选、定位和全屏结构，不渲染旧占位', () => {
    const html = renderToStaticMarkup(
      <EventMonitoringWorkspace activeView="gis_awareness" onActiveViewChange={() => undefined} onOpenIntelligentControl={() => undefined} />,
    );
    expect(html).toContain('data-testid="monitoring-gis-view"');
    expect(html).toContain('data-testid="monitoring-gis-map"');
    expect(html).toContain('data-testid="monitoring-filter-bar"');
    expect(html).toContain('monitoring-gis-map-fullscreen-toggle');
    expect(html).toContain('热力/排行/趋势：P1');
    expect(html).not.toContain('monitoring-placeholder-gis_awareness');
  });

  it('GIS视图与视频视图隔离，GIS未就绪不影响视频列表和核实入口', () => {
    const gis = renderToStaticMarkup(<EventMonitoringWorkspace activeView="gis_awareness" onActiveViewChange={() => undefined} onOpenIntelligentControl={() => undefined} />);
    const video = renderToStaticMarkup(<EventMonitoringWorkspace activeView="video_monitoring" onActiveViewChange={() => undefined} onOpenIntelligentControl={() => undefined} />);
    expect(gis).toContain('模拟路网降级视图');
    expect(video).toContain('视频事件监测');
    expect(video).not.toContain('GIS底图降级');
  });
});
