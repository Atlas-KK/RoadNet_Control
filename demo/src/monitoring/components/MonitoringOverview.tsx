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
  hideHeading?: boolean;
}

function MetricIcon({ metric }: { metric: MonitoringMetricKey }) {
  const commonProps = { className: 'monitoring-metric-icon-svg', viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true } as const;
  if (metric === 'current_pending') return <svg {...commonProps}><path d="M7 3.5h10a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M9 8h6M9 12h4M12 15.5v2.5M12 20h.01" /></svg>;
  if (metric === 'current_verifying') return <svg {...commonProps}><circle cx="10.5" cy="10.5" r="5.5" /><path d="m15 15 4.5 4.5M8 10.5l1.6 1.6L13 8.8" /></svg>;
  if (metric === 'current_overdue') return <svg {...commonProps}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2M12 17.5h.01" /></svg>;
  if (metric === 'current_control_handling') return <svg {...commonProps}><circle cx="6" cy="7" r="2" /><circle cx="18" cy="7" r="2" /><circle cx="12" cy="17" r="2" /><path d="m7.7 8.1 3.1 6.6M16.3 8.1l-3.1 6.6M8 7h8" /></svg>;
  return null;
}

export default function MonitoringOverview({ metrics, activeMetric, onMetricClick, metricKeys, title = '监测概览', description = '点击指标可快速筛选对应事件', compact = false, hideHeading = false }: MonitoringOverviewProps) {
  const definitions = metricKeys ? MONITORING_METRIC_DEFINITIONS.filter((definition) => metricKeys.includes(definition.key)) : MONITORING_METRIC_DEFINITIONS;
  return (
    <section className={`monitoring-overview ${compact ? 'is-compact' : ''}`} aria-label={title} data-testid="monitoring-overview">
      {hideHeading ? undefined : <div className="monitoring-section-heading">
        <div><h2>{title}</h2>{description ? <p>{description}</p> : undefined}</div>
      </div>}
      <div className="monitoring-metric-grid">
        {definitions.map((definition) => (
          <button
            key={definition.key}
            type="button"
            className="monitoring-metric-card arco-card"
            data-metric={definition.key}
            data-active={activeMetric === definition.key}
            aria-pressed={activeMetric === definition.key}
            disabled={!metrics}
            onClick={() => onMetricClick(definition.key)}
          >
            {compact ? <span className="monitoring-metric-icon"><MetricIcon metric={definition.key} /></span> : undefined}
            <span className="monitoring-metric-kind">{definition.kind}</span>
            <strong>{metrics ? metrics[definition.valueKey] : '—'}</strong>
            <span className="monitoring-metric-label">{definition.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
