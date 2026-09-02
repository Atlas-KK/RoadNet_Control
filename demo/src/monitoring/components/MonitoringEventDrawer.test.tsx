import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MonitoringDrawerTab } from '../uiState';
import { monitoringListItemFixture } from './componentTestFixtures';
import MonitoringEventDrawer from './MonitoringEventDrawer';

function renderTab(tab: MonitoringDrawerTab, withVideo = true): string {
  return renderToStaticMarkup(
    <MonitoringEventDrawer item={monitoringListItemFixture(withVideo)} activeTab={tab} onTabChange={() => undefined} onClose={() => undefined} onOpenIntelligentControl={() => undefined} />,
  );
}

describe('FR-EM-005 / FR-EM-006 宽幅事件核实详情', () => {
  it('合并为四个中文页签、全屏入口，查看不占用且显式提供开始核实', () => {
    const item = monitoringListItemFixture();
    const html = renderTab('video');
    for (const label of ['核实详情', '关联告警', '核实记录', '关联处置']) expect(html).toContain(label);
    expect(html).not.toContain('>视频核实<');
    expect(html).toContain('全屏查看');
    expect(html).toContain('/figma/arco/fullscreen.svg');
    expect(html).toContain('/figma/arco/close.svg');
    expect(html).toContain('打开详情不占用');
    expect(html).toContain('开始核实');
    expect(html).toContain('点击后才创建独占核实任务');
    expect(html).toContain('AI建议');
    expect(html).toContain('核实状态：');
    expect(html).toContain('系统信息');
    for (const label of ['事件状态', '所属设施', '最近更新']) expect(html).toContain(label);
    expect(html).not.toContain('>事件信息<');
    expect(html.split(item.event.monitoringEventId)).toHaveLength(2);
  });

  it('视频失败时以只读事件卡片降级，不展示算法信息和文字证据', () => {
    const html = renderTab('video', false);
    expect(html).toContain('视频暂不可用');
    expect(html).toContain('data-variant="drawer-preview"');
    expect(html).toContain('关键帧降级');
    expect(html).not.toContain('算法信息');
    expect(html).not.toContain('文字证据');
    expect(html).toContain('AI置信度');
    expect(html).not.toContain('准确率');
  });

  it('关联告警、核实记录和关联处置均有明确内容或空状态', () => {
    expect(renderTab('alarms')).toContain('来源告警ID');
    expect(renderTab('verification_history')).toContain('不会建立核实占用');
    expect(renderTab('control')).toContain('尚未接管至智能管控');
  });
});
