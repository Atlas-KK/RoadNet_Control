import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('FR-EM-001 AppShell默认上下文', () => {
  it('首次进入事件监测且不渲染智能管控RuntimeBar', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('data-testid="event-monitoring-workspace"');
    expect(html).toContain('data-testid="monitoring-video-view"');
    expect(html).toContain('data-testid="monitoring-empty-state"');
    expect(html).not.toContain('data-testid="runtime-bar"');
    expect(html).not.toContain('data-testid="intelligent-control-workspace"');
  });
});
