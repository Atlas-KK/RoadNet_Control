import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MONITORING_FILTERS } from '../uiState';
import { monitoringListItemFixture } from './componentTestFixtures';
import MonitoringGisView from './MonitoringGisView';

function renderGis(): string {
  return renderToStaticMarkup(
    <MonitoringGisView
      items={[monitoringListItemFixture()]}
      filters={DEFAULT_MONITORING_FILTERS}
      sort="default_priority"
      roadCodes={['G65']}
      deviceIds={['CAM-G65-129-01']}
      onFiltersChange={() => undefined}
      onSortChange={() => undefined}
      onResetFilters={() => undefined}
      onSelectEvent={() => undefined}
    />,
  );
}

describe('FR-EM-008 GIS事件态势UI', () => {
  it('复用视频筛选条件并展示事件索引、地图、定位控制和图例', () => {
    const html = renderGis();
    expect(html).toContain('data-testid="monitoring-filter-bar"');
    expect(html).toContain('空间事件');
    expect(html).toContain('火灾');
    expect(html).toContain('全路网');
    expect(html).toContain('L4 严重');
  });

  it('模拟事件在索引、降级地图点和图例中均显式标识', () => {
    const html = renderGis();
    expect((html.match(/模拟/g) ?? []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('定位事件ME-UI-001');
  });

  it('只声明P1热力排行趋势边界，不渲染伪造的排行或趋势图', () => {
    const html = renderGis();
    expect(html).toContain('热力/排行/趋势：P1');
    expect(html).not.toContain('事件热力图');
    expect(html).not.toContain('区域事件排行');
  });
});
