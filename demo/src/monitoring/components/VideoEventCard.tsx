import type { MonitoringListItem } from '../selectors';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
  describeDetectedTime,
} from '../selectors';

interface VideoEventCardProps {
  item: MonitoringListItem;
  operationalNowMs: number;
  selected: boolean;
  onOpen: (eventId: string) => void;
  videoUnavailableReason?: string;
}

function directionLabel(direction: MonitoringListItem['event']['location']['direction']): string {
  return direction === 'up' ? '上行' : direction === 'down' ? '下行' : '方向未知';
}

function kilometerLabel(kilometer: number | undefined): string {
  return kilometer === undefined ? '桩号待补充' : `K${kilometer.toFixed(1)}`;
}

function controlStatusLabel(status: NonNullable<MonitoringListItem['event']['controlSummary']>['eventLifecycleStatus']): string {
  return { handling: '处置中', resolved: '已解除', closed: '已关闭', correction_required: '待订正',
    false_positive_confirmed: '已确认误报' }[status];
}

export default function VideoEventCard({ item, operationalNowMs, selected, onOpen, videoUnavailableReason }: VideoEventCardProps) {
  const { event, primaryAlarm } = item;
  const videoEvidence = primaryAlarm?.evidence?.find((evidence) => evidence.kind === 'video_clip');
  const hasVideo = !videoUnavailableReason && videoEvidence?.available !== false && primaryAlarm?.evidenceIds.some((id) => /VIDEO|CLIP/i.test(id));
  return (
    <article className="video-event-card arco-card" data-selected={selected} data-testid={`video-event-card-${event.monitoringEventId}`}>
      <div className="video-event-cover" aria-label="模拟视频事件封面">
        <div className="video-event-road-lines" aria-hidden="true"><i /><i /><i /></div>
        <div className="video-event-cover-top">
          <span className="arco-tag monitoring-simulation-tag">模拟</span>
          <span className={`monitoring-level-badge level-${item.displayLevel.toLowerCase()}`}>{MONITORING_LEVEL_LABELS[item.displayLevel]}</span>
        </div>
        <div className="video-event-cover-center">
          <span className="video-event-camera-mark">▣</span>
          <strong>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}</strong>
          <span>{hasVideo ? '模拟短视频片段' : '模拟关键帧'}</span>
        </div>
        <span className="video-event-cover-time">{describeDetectedTime(event.detectedAt, operationalNowMs)}</span>
      </div>

      <div className="video-event-card-body">
        <div className="video-event-card-title">
          <div><strong>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}</strong><span>{event.monitoringEventId}</span></div>
          <span className={`verification-pill status-${event.verificationStatus}`}>{VERIFICATION_STATUS_LABELS[event.verificationStatus]}</span>
        </div>
        <dl className="video-event-card-meta">
          <div><dt>位置</dt><dd>{event.location.roadCode} · {directionLabel(event.location.direction)} · {kilometerLabel(event.location.kilometer)}</dd></div>
          <div><dt>摄像机</dt><dd>{primaryAlarm?.location.deviceId ?? '设备待关联'}</dd></div>
          <div><dt>AI置信度</dt><dd>{item.eventConfidence === undefined ? '暂无' : `${Math.round(item.eventConfidence * 100)}%`}</dd></div>
          <div><dt>关联告警</dt><dd>{item.alarms.length} 条</dd></div>
        </dl>
        <div className="video-event-card-flags">
          {item.overdue ? <span className="arco-tag flag-danger">核实超时</span> : undefined}
          {item.hasConflict ? <span className="arco-tag flag-warning">事实冲突</span> : undefined}
          {item.takenOver ? <span className="arco-tag flag-control">已接管</span> : undefined}
          {event.controlSummary ? <span className="arco-tag flag-control">管控：{controlStatusLabel(event.controlSummary.eventLifecycleStatus)}</span> : undefined}
          {event.controlSummary?.planVersion ? <span className="arco-tag">预案 V{event.controlSummary.planVersion} · {event.controlSummary.planState ?? '状态待回写'}</span> : undefined}
          {event.controlSummary?.pendingMeasureCount !== undefined ? <span className="arco-tag">待确认 {event.controlSummary.pendingMeasureCount} 项</span> : undefined}
          {!hasVideo ? <span className="arco-tag">关键帧降级</span> : undefined}
        </div>
        <button type="button" className="arco-button arco-button-outline video-event-open" onClick={() => onOpen(event.monitoringEventId)}>查看核实详情</button>
      </div>
    </article>
  );
}

