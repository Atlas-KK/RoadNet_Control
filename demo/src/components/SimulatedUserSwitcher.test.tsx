import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SimulatedUserSwitcher from './SimulatedUserSwitcher';

describe('FR-EM-012 模拟身份切换器', () => {
  it('展示四类确认角色并标记为模拟身份', () => {
    const html = renderToStaticMarkup(<SimulatedUserSwitcher />);
    expect(html).toContain('模拟身份');
    expect(html).toContain('路网监测员');
    expect(html).toContain('监控班长');
    expect(html).toContain('指挥调度人员');
    expect(html).toContain('系统管理员');
  });
});
