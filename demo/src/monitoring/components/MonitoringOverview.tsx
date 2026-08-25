import {
  MONITORING_METRIC_DEFINITIONS,
  type MonitoringMetricKey,
  type MonitoringMetrics,
} from '../engine/monitoringMetrics';

interface MonitoringOverviewProps {
  metrics?: MonitoringMetrics;
  activeMetric?: MonitoringMetricKey;
  onMetricClick: (metric: MonitoringMetricKey) => void;
}

export default function MonitoringOverview({ metrics, activeMetric, onMetricClick }: MonitoringOverviewProps) {
  return (
    <section className="monitoring-overview" aria-label="事件监测工作指标" data-testid="monitoring-overview">
      {MONITORING_METRIC_DEFINITIONS.map((definition) => (
        <button
          key={definition.key}
          type="button"
          className="monitoring-metric-card arco-card"
          data-active={activeMetric === definition.key}
          aria-pressed={activeMetric === definition.key}
          disabled={!metrics}
          onClick={() => onMetricClick(definition.key)}
        >
          <span className="monitoring-metric-kind">{definition.kind}</span>
          <strong>{metrics ? metrics[definition.valueKey] : '—'}</strong>
          <span className="monitoring-metric-label">{definition.label}</span>
        </button>
      ))}
    </section>
  );
}
