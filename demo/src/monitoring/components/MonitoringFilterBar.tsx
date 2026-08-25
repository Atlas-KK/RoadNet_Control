import type { MonitoringEventType, MonitoringLevel, TravelDirection, VerificationStatus } from '../../domain/monitoring';
import { MONITORING_EVENT_TYPES } from '../../domain/monitoring';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
} from '../selectors';
import type { MonitoringFilters, MonitoringSort } from '../uiState';

interface MonitoringFilterBarProps {
  filters: MonitoringFilters;
  sort: MonitoringSort;
  roadCodes: readonly string[];
  deviceIds: readonly string[];
  resultCount: number;
  onFiltersChange: (patch: Partial<MonitoringFilters>) => void;
  onSortChange: (sort: MonitoringSort) => void;
  onReset: () => void;
}

function singleValue<T extends string>(value: string): T[] {
  return value ? [value as T] : [];
}

function activeFilterCount(filters: MonitoringFilters): number {
  return Number(Boolean(filters.quickMetric))
    + filters.eventTypes.length + filters.verificationStatuses.length + filters.levels.length
    + filters.roadCodes.length + filters.directions.length + filters.deviceIds.length
    + Number(filters.minimumConfidence !== undefined) + Number(Boolean(filters.detectedFrom)) + Number(Boolean(filters.detectedTo))
    + Number(filters.overdueOnly) + Number(filters.conflictsOnly) + Number(filters.takenOverOnly) + Number(Boolean(filters.keyword.trim()));
}

export default function MonitoringFilterBar(props: MonitoringFilterBarProps) {
  const { filters } = props;
  const filterCount = activeFilterCount(filters);
  return (
    <section className="monitoring-filter-bar arco-card" aria-label="视频事件筛选" data-testid="monitoring-filter-bar">
      <div className="monitoring-filter-primary">
        <label className="monitoring-search-field">
          <span className="sr-only">关键词</span>
          <input
            className="arco-input"
            value={filters.keyword}
            placeholder="搜索事件编号、道路、设施或摄像机"
            onChange={(event) => props.onFiltersChange({ keyword: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>事件类型</span>
          <select value={filters.eventTypes[0] ?? ''} onChange={(event) => props.onFiltersChange({ eventTypes: singleValue<MonitoringEventType>(event.currentTarget.value) })}>
            <option value="">全部类型</option>
            {MONITORING_EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType}>{MONITORING_EVENT_TYPE_LABELS[eventType]}</option>)}
          </select>
        </label>
        <label>
          <span>核实状态</span>
          <select value={filters.verificationStatuses[0] ?? ''} onChange={(event) => props.onFiltersChange({ verificationStatuses: singleValue<VerificationStatus>(event.currentTarget.value) })}>
            <option value="">全部状态</option>
            {(Object.keys(VERIFICATION_STATUS_LABELS) as VerificationStatus[]).map((status) => <option key={status} value={status}>{VERIFICATION_STATUS_LABELS[status]}</option>)}
          </select>
        </label>
        <label>
          <span>监测等级</span>
          <select value={filters.levels[0] ?? ''} onChange={(event) => props.onFiltersChange({ levels: singleValue<MonitoringLevel>(event.currentTarget.value) })}>
            <option value="">全部等级</option>
            {(Object.keys(MONITORING_LEVEL_LABELS) as MonitoringLevel[]).map((level) => <option key={level} value={level}>{MONITORING_LEVEL_LABELS[level]}</option>)}
          </select>
        </label>
        <label>
          <span>道路</span>
          <select value={filters.roadCodes[0] ?? ''} onChange={(event) => props.onFiltersChange({ roadCodes: singleValue(event.currentTarget.value) })}>
            <option value="">全部道路</option>
            {props.roadCodes.map((roadCode) => <option key={roadCode} value={roadCode}>{roadCode}</option>)}
          </select>
        </label>
        <label>
          <span>排序</span>
          <select value={props.sort} onChange={(event) => props.onSortChange(event.currentTarget.value as MonitoringSort)}>
            <option value="default_priority">默认优先级</option>
            <option value="detected_desc">检测时间倒序</option>
            <option value="level_desc">严重等级优先</option>
          </select>
        </label>
      </div>

      <details className="monitoring-advanced-filters">
        <summary>更多筛选{filterCount ? `（已启用 ${filterCount} 项）` : ''}</summary>
        <div className="monitoring-filter-secondary">
          <label><span>方向</span><select value={filters.directions[0] ?? ''} onChange={(event) => props.onFiltersChange({ directions: singleValue<TravelDirection>(event.currentTarget.value) })}><option value="">全部方向</option><option value="up">上行</option><option value="down">下行</option><option value="unknown">方向未知</option></select></label>
          <label><span>摄像机</span><select value={filters.deviceIds[0] ?? ''} onChange={(event) => props.onFiltersChange({ deviceIds: singleValue(event.currentTarget.value) })}><option value="">全部设备</option>{props.deviceIds.map((deviceId) => <option key={deviceId} value={deviceId}>{deviceId}</option>)}</select></label>
          <label><span>最低AI置信度</span><select value={filters.minimumConfidence ?? ''} onChange={(event) => props.onFiltersChange({ minimumConfidence: event.currentTarget.value ? Number(event.currentTarget.value) : undefined })}><option value="">不限</option><option value="0.6">60%</option><option value="0.75">75%</option><option value="0.9">90%</option></select></label>
          <label><span>检测起始</span><input type="datetime-local" value={filters.detectedFrom ?? ''} onChange={(event) => props.onFiltersChange({ detectedFrom: event.currentTarget.value || undefined })} /></label>
          <label><span>检测结束</span><input type="datetime-local" value={filters.detectedTo ?? ''} onChange={(event) => props.onFiltersChange({ detectedTo: event.currentTarget.value || undefined })} /></label>
          <label className="monitoring-check"><input type="checkbox" checked={filters.overdueOnly} onChange={(event) => props.onFiltersChange({ overdueOnly: event.currentTarget.checked })} />仅看核实超时</label>
          <label className="monitoring-check"><input type="checkbox" checked={filters.conflictsOnly} onChange={(event) => props.onFiltersChange({ conflictsOnly: event.currentTarget.checked })} />仅看事实冲突</label>
          <label className="monitoring-check"><input type="checkbox" checked={filters.takenOverOnly} onChange={(event) => props.onFiltersChange({ takenOverOnly: event.currentTarget.checked })} />仅看已接管</label>
        </div>
      </details>

      <div className="monitoring-filter-footer">
        <span>共 {props.resultCount} 起事件</span>
        {filters.quickMetric ? <span className="arco-tag monitoring-active-metric">指标筛选已生效</span> : undefined}
        <button type="button" className="arco-button arco-button-size-mini" onClick={props.onReset}>重置筛选</button>
      </div>
    </section>
  );
}
