import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import IntelligentControlWorkspace from './IntelligentControlWorkspace';

describe('FR-EM-001 智能管控工作台', () => {
  it('提取后仍可渲染原四列容器', () => {
    const html = renderToStaticMarkup(<IntelligentControlWorkspace />);
    expect(html).toContain('data-testid="intelligent-control-workspace"');
    expect(html).toContain('app-triage');
    expect(html).toContain('app-map');
    expect(html).toContain('app-narrative');
    expect(html).toContain('app-plan');
  });
});
