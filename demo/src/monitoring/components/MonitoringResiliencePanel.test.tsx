import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MONITORING_DEPENDENCY_HEALTH, degradeMonitoringDependency } from '../engine/degradation';
import { useMonitoringStore } from '../store';
import MonitoringResiliencePanel from './MonitoringResiliencePanel';

describe('阶段10 故障演练与降级提示', () => {
  beforeEach(() => useMonitoringStore.setState({ dependencyHealth: DEFAULT_MONITORING_DEPENDENCY_HEALTH }));

  it('正常状态只显示明确的本地模拟入口', () => {
    const html = renderToStaticMarkup(<MonitoringResiliencePanel />);
    expect(html).toContain('本地模拟，不代表生产服务');
    expect(html).not.toContain('部分服务已降级');
  });

  it('AI故障明确保留人工核实能力', () => {
    const health = degradeMonitoringDependency(DEFAULT_MONITORING_DEPENDENCY_HEALTH, 'ai', 'T1');
    const html = renderToStaticMarkup(<MonitoringResiliencePanel healthOverride={health} />);
    expect(html).toContain('AI辅助服务不可用');
    expect(html).toContain('人工补报和历史核实');
  });
});

