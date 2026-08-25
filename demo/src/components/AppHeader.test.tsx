import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppHeader from './AppHeader';

describe('FR-EM-001 AppHeader', () => {
  it('渲染一级Tab并标识当前模块', () => {
    const html = renderToStaticMarkup(
      <AppHeader activeModule="event_monitoring" onActiveModuleChange={() => undefined} />,
    );
    expect(html).toContain('事件监测');
    expect(html).toContain('智能管控');
    expect(html).toContain('data-testid="module-tab-event_monitoring"');
    expect(html).toContain('aria-selected="true"');
  });

  it('只在调用方传入时渲染模块操作区', () => {
    const withoutActions = renderToStaticMarkup(
      <AppHeader activeModule="event_monitoring" onActiveModuleChange={() => undefined} />,
    );
    const withActions = renderToStaticMarkup(
      <AppHeader
        activeModule="intelligent_control"
        onActiveModuleChange={() => undefined}
        moduleActions={<span data-testid="control-actions">管控操作</span>}
      />,
    );
    expect(withoutActions).not.toContain('app-module-actions');
    expect(withActions).toContain('data-testid="control-actions"');
  });
});
