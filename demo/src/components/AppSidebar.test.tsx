import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AppSidebar from './AppSidebar';

describe('Figma Ant Design sider/default', () => {
  it('驾驶舱激活时展示展开箭头和二级选中项', () => {
    const html = renderToStaticMarkup(
      <AppSidebar activeModule="cockpit" activeCockpitView="video_monitoring" collapsed={false} onCollapsedChange={() => undefined} onModuleChange={() => undefined} onCockpitViewChange={() => undefined} />,
    );
    expect(html).toContain('data-figma-node-id="1413:16368"');
    expect(html).toContain('/figma/ant-sider/dashboard.svg');
    expect(html).toContain('/figma/ant-sider/arrow-up.svg');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('监测概览');
    expect(html).toContain('GIS态势感知');
  });

  it('其他模块激活时收起驾驶舱子菜单并保留一级选中态', () => {
    const html = renderToStaticMarkup(
      <AppSidebar activeModule="event_monitoring" activeCockpitView="video_monitoring" collapsed={false} onCollapsedChange={() => undefined} onModuleChange={() => undefined} onCockpitViewChange={() => undefined} />,
    );
    expect(html).toContain('/figma/ant-sider/arrow-down.svg');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('nav-cockpit-overview');
    expect(html).toContain('data-testid="nav-event-monitoring"');
    expect(html).toContain('aria-current="page"');
  });
});