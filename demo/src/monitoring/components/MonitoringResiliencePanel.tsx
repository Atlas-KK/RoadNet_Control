import { degradedDependencyMessages, type MonitoringDependencyHealth } from '../engine/degradation';
import { useMonitoringStore } from '../store';

export default function MonitoringResiliencePanel({ healthOverride }: { healthOverride?: MonitoringDependencyHealth } = {}) {
  const storeHealth = useMonitoringStore((state) => state.dependencyHealth);
  const health = healthOverride ?? storeHealth;
  const messages = degradedDependencyMessages(health);

  if (!messages.length) return null;

  return (
    <section className="monitoring-resilience" data-testid="monitoring-resilience-panel">
      <div className="arco-alert arco-alert-warning" role="status"><strong>部分服务已降级</strong><span>{messages.join('；')}</span></div>
    </section>
  );
}
