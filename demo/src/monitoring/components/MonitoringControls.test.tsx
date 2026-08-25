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

  it('筛选栏覆盖类型、状态、等级、道路、方向、设备、置信度、时间和三个快捷条件', () => {
    const html = renderToStaticMarkup(
      <MonitoringFilterBar
        filters={structuredClone(DEFAULT_MONITORING_FILTERS)} sort="default_priority" roadCodes={['G65']} deviceIds={['CAM-01']}
        resultCount={0} onFiltersChange={() => undefined} onSortChange={() => undefined} onReset={() => undefined}
      />,
    );
    for (const label of ['事件类型', '核实状态', '监测等级', '道路', '方向', '摄像机', '最低AI置信度', '检测起始', '检测结束', '仅看核实超时', '仅看事实冲突', '仅看已接管']) {
      expect(html).toContain(label);
    }
  });
});
