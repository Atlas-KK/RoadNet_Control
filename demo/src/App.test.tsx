import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

describe('全局应用壳层默认上下文', () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it('恢复到智能管控模块时直接呈现四列工作区，不显示页面头', () => {
    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: () => 'intelligent_control',
        setItem: () => undefined,
      },
    });

    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="intelligent-control-module"');
    expect(html).toContain('data-testid="intelligent-control-workspace"');
    expect(html).not.toContain('class="monitoring-page-header arco-card"');
    expect(html).not.toContain('aria-label="面包屑"');
    expect(html).not.toContain('<h1>智能管控</h1>');
    expect(html).not.toContain('围绕已接管事件开展态势研判、资源协同与处置方案跟踪。');
  });
});
