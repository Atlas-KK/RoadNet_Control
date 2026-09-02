import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { monitoringListItemFixture } from './componentTestFixtures';
import VideoEventCard from './VideoEventCard';

describe('FR-EM-004 视频事件卡片', () => {
  it('展示PRD要求字段、模拟标识和AI置信度，不使用准确率措辞', () => {
    const item = monitoringListItemFixture();
    const html = renderToStaticMarkup(
      <VideoEventCard item={item} operationalNowMs={Date.parse('2026-08-25T02:01:00.000Z')} selected={false} onOpen={() => undefined} />,
    );
    expect(html).toContain('火灾');
    expect(html).toContain('L4 严重');
    expect(html).toContain('待核实');
    expect(html).toContain('G65');
    expect(html).toContain('CAM-G65-129-01');
    expect(html).toContain('AI置信度');
    expect(html).toContain('94%');
    expect(html).toContain('关联告警');
    expect(html).toContain('核实超时');
    expect(html).toContain('模拟画面');
    expect(html).toContain('src="/event-photos/generated/fire-01.webp"');
    expect(html).toContain('alt="火灾模拟监控画面"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="查看火灾事件详情"');
    expect(html).not.toContain('查看核实详情');
    expect(html).not.toContain(item.event.monitoringEventId);
    expect(html).not.toContain('准确率');
    expect(html).not.toContain('车牌');
  });

  it('抽屉预览复用同一事件卡片并仅在画面区域提供播放入口', () => {
    const item = monitoringListItemFixture();
    const html = renderToStaticMarkup(
      <VideoEventCard item={item} variant="drawer-preview" onPlay={() => undefined} />,
    );
    expect(html).toContain('data-variant="drawer-preview"');
    expect(html).toContain('aria-label="火灾事件卡片"');
    expect(html).toContain('aria-label="播放火灾事件视频"');
    expect(html).not.toContain('aria-label="查看火灾事件详情"');
    expect(html).toContain('src="/event-photos/generated/fire-01.webp"');
    expect(html).not.toContain('monitoring-simulation-tag');
    expect(html).not.toContain('video-event-cover-caption');
    expect(html).not.toContain('video-event-card-title');
    expect(html).toContain('AI置信度');
    expect(html).toContain('关联告警');
  });
});
