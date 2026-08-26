import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppHeader from './AppHeader';

describe('全局顶部状态栏', () => {
  it('只呈现产品、系统状态和演示环境入口', () => {
    const html = renderToStaticMarkup(<AppHeader demoToolsEnabled onDemoToolsOpen={() => undefined} />);
    expect(html).toContain('路网综合管控智能体');
    expect(html).toContain('系统在线');
    expect(html).toContain('data-testid="demo-tools-trigger"');
    expect(html).toContain('本地模拟');
    expect(html).not.toContain('module-tab-event_monitoring');
  });

  it('正式环境隐藏演示入口并按需渲染模块操作', () => {
    const html = renderToStaticMarkup(<AppHeader moduleActions={<span data-testid="control-actions">管控操作</span>} />);
    expect(html).toContain('正式环境');
    expect(html).not.toContain('data-testid="demo-tools-trigger"');
    expect(html).toContain('data-testid="control-actions"');
  });
});