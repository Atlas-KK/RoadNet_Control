import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { monitoringListItemFixture } from './componentTestFixtures';
import VideoEventCard from './VideoEventCard';

describe('FR-EM-004 视频事件卡片', () => {
  it('展示PRD要求字段、模拟标识和AI置信度，不使用准确率措辞', () => {
    const html = renderToStaticMarkup(
      <VideoEventCard item={monitoringListItemFixture()} operationalNowMs={Date.parse('2026-08-25T02:01:00.000Z')} selected={false} onOpen={() => undefined} />,
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
    expect(html).toContain('模拟');
    expect(html).not.toContain('准确率');
    expect(html).not.toContain('车牌');
  });
});
