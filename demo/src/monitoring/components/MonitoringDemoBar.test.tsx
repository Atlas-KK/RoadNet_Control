import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MonitoringDemoBar from './MonitoringDemoBar';

describe('监测场景与人工补报入口', () => {
  it('只在打开时以本地演示工具抽屉呈现场景和人工操作', () => {
    expect(renderToStaticMarkup(<MonitoringDemoBar open={false} onClose={() => undefined} />)).toBe('');
    const html = renderToStaticMarkup(<MonitoringDemoBar open onClose={() => undefined} />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('本地演示工具');
    expect(html).toContain('模拟操作身份');
    for (const text of ['异常停车重复告警', '行人误报', '抛洒物持续观察', '隧道交通事故L3', '隧道火灾L4', '交通拥堵持续监测']) expect(html).toContain(text);
    for (const text of ['本地模拟', '加载场景', '人工补报', '清空监测数据']) expect(html).toContain(text);
    for (const text of ['故障演练', '故障模拟', '模拟断线', '模拟视频失败', '恢复并补拉', '恢复视频']) expect(html).not.toContain(text);
  });
});