import { degradedDependencyMessages, type MonitoringDependency, type MonitoringDependencyHealth } from '../engine/degradation';
import { useMonitoringStore } from '../store';

const DEPENDENCY_LABEL: Record<MonitoringDependency, string> = {
  gis: 'GIS', video: '视频', ai: 'AI辅助', control: '智能管控',
};

export default function MonitoringResiliencePanel({ healthOverride }: { healthOverride?: MonitoringDependencyHealth } = {}) {
  const storeHealth = useMonitoringStore((state) => state.dependencyHealth);
  const health = healthOverride ?? storeHealth;
  const degrade = useMonitoringStore((state) => state.degradeDependency);
  const restore = useMonitoringStore((state) => state.restoreDependency);
  const restoreAll = useMonitoringStore((state) => state.restoreAllDependencies);
  const messages = degradedDependencyMessages(health);
  return (
    <section className="monitoring-resilience" data-testid="monitoring-resilience-panel">
      {messages.length ? <div className="arco-alert arco-alert-warning" role="status"><strong>部分服务已降级</strong><span>{messages.join('；')}</span></div> : undefined}
      <details>
        <summary>故障演练 <small>本地模拟，不代表生产服务</small></summary>
        <div className="monitoring-resilience-actions">
          {(Object.keys(DEPENDENCY_LABEL) as MonitoringDependency[]).map((dependency) => {
            const failed = health[dependency].availability === 'degraded';
            return <button key={dependency} type="button" className={`arco-button arco-button-size-mini ${failed ? 'arco-button-outline' : ''}`}
              data-testid={`dependency-${dependency}-${failed ? 'restore' : 'degrade'}`}
              onClick={() => void (failed ? restore(dependency) : degrade(dependency))}>
              {DEPENDENCY_LABEL[dependency]}：{failed ? '恢复' : '模拟故障'}
            </button>;
          })}
          {messages.length ? <button type="button" className="arco-button arco-button-size-mini" onClick={() => void restoreAll()}>全部恢复</button> : undefined}
        </div>
      </details>
    </section>
  );
}


