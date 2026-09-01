import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MONITORING_FILTERS } from '../uiState';
import MonitoringFilterBar from './MonitoringFilterBar';
import MonitoringOverview from './MonitoringOverview';

describe('FR-EM-001 / FR-EM-004 指标和筛选控件', () => {
  it('区分八项今日流量和当前存量指标', () => {
    const html = renderToStaticMarkup(<MonitoringOverview metrics={{
      todayDetected: 8, currentPending: 3, currentVerifying: 2, todayConfirmed: 1,
      todayFalsePositive: 1, currentOverdue: 1, todayTakenOver: 1, currentControlHandling: 1,
    }} onMetricClick={() => undefined} />);
    expect((html.match(/今日流量/g) ?? [])).toHaveLength(4);
    expect((html.match(/当前存量/g) ?? [])).toHaveLength(4);
    expect(html).toContain('今日检测');
    expect(html).toContain('当前接管处置中');
  });

  it('四项事件状态卡片使用不同语义图标', () => {
    const html = renderToStaticMarkup(<MonitoringOverview compact metricKeys={['current_pending', 'current_verifying', 'current_overdue', 'current_control_handling']} metrics={{
      todayDetected: 0, currentPending: 3, currentVerifying: 2, todayConfirmed: 0,
      todayFalsePositive: 0, currentOverdue: 1, todayTakenOver: 0, currentControlHandling: 1,
    }} onMetricClick={() => undefined} />);
    expect((html.match(/monitoring-metric-icon-svg/g) ?? [])).toHaveLength(4);
    for (const metric of ['current_pending', 'current_verifying', 'current_overdue', 'current_control_handling']) expect(html).toContain(`data-metric="${metric}"`);
  });

  it('筛选栏覆盖类型、状态、等级、道路、方向、设备、置信度和时间', () => {
    const html = renderToStaticMarkup(
      <MonitoringFilterBar
        filters={structuredClone(DEFAULT_MONITORING_FILTERS)} sort="default_priority" roadCodes={['G65']} deviceIds={['CAM-01']}
        resultCount={0} onFiltersChange={() => undefined} onSortChange={() => undefined} onReset={() => undefined}
      />,
    );
    for (const label of ['事件类型', '核实状态', '监测等级', '道路', '方向', '摄像机', '最低AI置信度', '检测起始', '检测结束']) {
      expect(html).toContain(label);
    }
    for (const removedLabel of ['仅看核实超时', '仅看事实冲突', '仅看已接管']) expect(html).not.toContain(removedLabel);
    expect(html).toContain('<details class="monitoring-advanced-filters"><summary>');
    expect(html).toContain('/figma/arco/search.svg');
    expect(html).toContain('/figma/arco/filter.svg');
    expect(html).toContain('/figma/arco/caret-down.svg');
    expect(html).toContain('<h2>事件筛选</h2>');
    const detailsStart = html.indexOf('<details class="monitoring-advanced-filters">');
    const detailsEnd = html.indexOf('</details>');
    const searchInput = html.indexOf('placeholder="搜索事件编号、道路、设施或摄像机"');
    expect(searchInput).toBeGreaterThan(detailsStart);
    expect(searchInput).toBeLessThan(detailsEnd);
    expect(html).not.toContain('按事件属性、位置与核实状态组合查询');
  });
});
