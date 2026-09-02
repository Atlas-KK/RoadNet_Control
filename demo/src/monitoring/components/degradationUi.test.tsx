import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { freezeAlarm } from '../../domain/monitoring';
import { DEFAULT_MONITORING_DEPENDENCY_HEALTH } from '../engine/degradation';
import { useMonitoringStore } from '../store';
import { DEFAULT_MONITORING_FILTERS } from '../uiState';
import { monitoringListItemFixture } from './componentTestFixtures';
import EvidencePanel from './EvidencePanel';
import MonitoringGisView from './MonitoringGisView';

describe('阶段10 AC16/17 页面降级', () => {
  beforeEach(() => useMonitoringStore.setState({ dependencyHealth: DEFAULT_MONITORING_DEPENDENCY_HEALTH }));

  it('视频不可用和证据归档时仍展示事件卡片及归档提示', () => {
    const base = monitoringListItemFixture();
    const alarm = freezeAlarm({ ...base.primaryAlarm!, evidence: [
      { evidenceId: 'FRAME-1', kind: 'key_frame', capturedAt: base.event.detectedAt, controlledRef: 'controlled://frame', available: true, archived: true, simulation: true },
      { evidenceId: 'VIDEO-1', kind: 'video_clip', capturedAt: base.event.detectedAt, controlledRef: 'controlled://video', available: false, archived: false, simulation: true },
    ], evidenceIds: ['FRAME-1', 'VIDEO-1'] });
    const html = renderToStaticMarkup(<EvidencePanel item={{ ...base, primaryAlarm: alarm, alarms: [alarm] }} />);
    expect(html).toContain('视频暂不可用');
    expect(html).toContain('data-variant="drawer-preview"');
    expect(html).not.toContain('算法信息');
    expect(html).not.toContain('文字证据');
    expect(html).toContain('1项证据已归档');
  });

  it('GIS强制故障时保留筛选、事件索引和可点击示意点', () => {
    const html = renderToStaticMarkup(<MonitoringGisView
      items={[monitoringListItemFixture()]} filters={DEFAULT_MONITORING_FILTERS} sort="default_priority"
      roadCodes={['G65']} deviceIds={['CAM-G65-129-01']} onFiltersChange={() => undefined}
      onSortChange={() => undefined} onResetFilters={() => undefined} onSelectEvent={() => undefined}
      forceUnavailableReason="GIS服务故障演练" />);
    expect(html).toContain('GIS底图降级');
    expect(html).toContain('GIS服务故障演练');
    expect(html).toContain('data-testid="monitoring-filter-bar"');
    expect(html).toContain('定位事件ME-UI-001');
  });
});
