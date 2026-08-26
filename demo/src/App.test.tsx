import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('全局应用壳层默认上下文', () => {
  it('首次进入驾驶舱并渲染左侧导航', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="app-sidebar"');
    expect(html).toContain('data-testid="cockpit-workspace"');
    expect(html).toContain('监测概览');
    expect(html).toContain('GIS态势感知');
    expect(html).toContain('事件监测');
    expect(html).toContain('智能管控');
    expect(html).not.toContain('data-testid="runtime-bar"');
    expect(html).not.toContain('data-testid="event-monitoring-workspace"');
    expect(html).not.toContain('data-testid="intelligent-control-workspace"');
  });
});