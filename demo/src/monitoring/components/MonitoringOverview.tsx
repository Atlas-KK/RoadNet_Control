import {
  MONITORING_METRIC_DEFINITIONS,
  type MonitoringMetricKey,
  type MonitoringMetrics,
} from '../engine/monitoringMetrics';

interface MonitoringOverviewProps {
  metrics?: MonitoringMetrics;
  activeMetric?: MonitoringMetricKey;
  onMetricClick: (metric: MonitoringMetricKey) => void;
  metricKeys?: readonly MonitoringMetricKey[];
  title?: string;
  description?: string;
  compact?: boolean;
}

export default function MonitoringOverview({ metrics, activeMetric, onMetricClick, metricKeys, title = '监测概览', description = '点击指标可快速筛选对应事件', compact = false }: MonitoringOverviewProps) {
  const definitions = metricKeys ? MONITORING_METRIC_DEFINITIONS.filter((definition) => metricKeys.includes(definition.key)) : MONITORING_METRIC_DEFINITIONS;
  return (
    <section className={`monitoring-overview ${compact ? 'is-compact' : ''}`} aria-label={title} data-testid="monitoring-overview">
      <div className="monitoring-section-heading">
        <div><h2>{title}</h2><p>{description}</p></div>
      </div>
      <div className="monitoring-metric-grid">
        {definitions.map((definition) => (
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
      </div>
    </section>
  );
}