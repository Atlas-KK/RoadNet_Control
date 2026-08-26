import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MONITORING_DEPENDENCY_HEALTH, degradeMonitoringDependency } from '../engine/degradation';
import { useMonitoringStore } from '../store';
import MonitoringResiliencePanel from './MonitoringResiliencePanel';

describe('阶段10 服务降级提示', () => {
  beforeEach(() => useMonitoringStore.setState({ dependencyHealth: DEFAULT_MONITORING_DEPENDENCY_HEALTH }));

  it('正常状态不显示降级区域和故障演练入口', () => {
    const html = renderToStaticMarkup(<MonitoringResiliencePanel />);
    expect(html).not.toContain('monitoring-resilience-panel');
    expect(html).not.toContain('故障演练');
    expect(html).not.toContain('模拟故障');
    expect(html).not.toContain('部分服务已降级');
  });

  it('AI故障明确保留人工核实能力，但不提供演练控件', () => {
    const health = degradeMonitoringDependency(DEFAULT_MONITORING_DEPENDENCY_HEALTH, 'ai', 'T1');
    const html = renderToStaticMarkup(<MonitoringResiliencePanel healthOverride={health} />);
    expect(html).toContain('AI辅助服务不可用');
    expect(html).toContain('人工补报和历史核实');
    expect(html).not.toContain('故障演练');
    expect(html).not.toContain('模拟故障');
    expect(html).not.toContain('全部恢复');
  });
});
