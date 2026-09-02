import type { MonitoringListItem } from '../selectors';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
  describeDetectedTime,
} from '../selectors';

interface VideoEventCardProps {
  item: MonitoringListItem;
  operationalNowMs?: number;
  selected?: boolean;
  onOpen?: (eventId: string) => void;
  variant?: 'interactive' | 'drawer-preview';
  onPlay?: () => void;
  videoUnavailableReason?: string;
}

function directionLabel(direction: MonitoringListItem['event']['location']['direction']): string {
  return direction === 'up' ? '上行' : direction === 'down' ? '下行' : '方向未知';
}

function kilometerLabel(kilometer: number | undefined): string {
  return kilometer === undefined ? '桩号待补充' : `K${kilometer.toFixed(1)}`;
}

const EVENT_IMAGE_FALLBACKS = {
  traffic_congestion: '/event-photos/generated/traffic-congestion-01.webp',
  traffic_accident: '/event-photos/generated/traffic-accident-01.webp',
  pedestrian_intrusion: '/event-photos/generated/pedestrian-intrusion-01.webp',
  wrong_way_driving: '/event-photos/generated/wrong-way-driving-01.webp',
  reversing: '/event-photos/generated/reversing-01.webp',
  abnormal_stop: '/event-photos/generated/abnormal-stop-01.webp',
  fire: '/event-photos/generated/fire-01.webp',
  road_debris: '/event-photos/generated/road-debris-01.webp',
} as const satisfies Record<MonitoringListItem['event']['eventType'], string>;

function eventImageSource(item: MonitoringListItem): string {
  const keyFrame = item.primaryAlarm?.evidence?.find((evidence) => (
    evidence.kind === 'key_frame'
    && evidence.available
    && evidence.controlledRef.startsWith('/event-photos/')
  ));
  return keyFrame?.controlledRef ?? EVENT_IMAGE_FALLBACKS[item.event.eventType];
}
function controlStatusLabel(status: NonNullable<MonitoringListItem['event']['controlSummary']>['eventLifecycleStatus']): string {
  return { handling: '处置中', resolved: '已解除', closed: '已关闭', correction_required: '待订正',
    false_positive_confirmed: '已确认误报' }[status];
}

export default function VideoEventCard({
  item,
  operationalNowMs,
  selected = false,
  onOpen,
  variant = 'interactive',
  onPlay,
  videoUnavailableReason,
}: VideoEventCardProps) {
  const { event, primaryAlarm } = item;
  const videoEvidence = primaryAlarm?.evidence?.find((evidence) => evidence.kind === 'video_clip');
  const hasVideo = !videoUnavailableReason && videoEvidence?.available !== false && primaryAlarm?.evidenceIds.some((id) => /VIDEO|CLIP/i.test(id));
  const coverImage = eventImageSource(item);
  const fallbackImage = EVENT_IMAGE_FALLBACKS[event.eventType];
  const interactive = variant === 'interactive' && Boolean(onOpen);
  const openEvent = () => onOpen?.(event.monitoringEventId);
  const displayNowMs = operationalNowMs ?? Date.parse(event.updatedAt);
  return (
    <article
      className="video-event-card arco-card"
      data-selected={selected}
      data-variant={variant}
      data-testid="video-event-card"
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? `查看${MONITORING_EVENT_TYPE_LABELS[event.eventType]}事件详情` : `${MONITORING_EVENT_TYPE_LABELS[event.eventType]}事件卡片`}
      onClick={interactive ? openEvent : undefined}
      onKeyDown={interactive ? (keyboardEvent) => {
        if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
          keyboardEvent.preventDefault();
          openEvent();
        }
      } : undefined}
    >
      <div className="video-event-cover" aria-label={`${MONITORING_EVENT_TYPE_LABELS[event.eventType]}模拟监控画面`}>
        <img
          className="video-event-cover-image"
          src={coverImage}
          alt={`${MONITORING_EVENT_TYPE_LABELS[event.eventType]}模拟监控画面`}
          loading="lazy"
          decoding="async"
          onError={(imageEvent) => {
            if (imageEvent.currentTarget.getAttribute('src') === fallbackImage) {
              imageEvent.currentTarget.hidden = true;
            } else {
              imageEvent.currentTarget.src = fallbackImage;
            }
          }}
        />
        <div className="video-event-cover-shade" aria-hidden="true" />
        {variant === 'interactive' ? (
          <>
            <div className="video-event-cover-top">
              <span className="arco-tag monitoring-simulation-tag">模拟画面</span>
              <span className={`monitoring-level-badge level-${item.displayLevel.toLowerCase()}`}>{MONITORING_LEVEL_LABELS[item.displayLevel]}</span>
            </div>
            <div className="video-event-cover-caption">
              <strong>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}</strong>
              <span>{hasVideo ? '模拟监控视频关键帧' : '关键帧降级画面'}</span>
            </div>
          </>
        ) : undefined}
        <span className="video-event-cover-time">{describeDetectedTime(event.detectedAt, displayNowMs)}</span>
        {variant === 'drawer-preview' ? (
          <button
            type="button"
            className="video-event-cover-play"
            aria-label={hasVideo ? `播放${MONITORING_EVENT_TYPE_LABELS[event.eventType]}事件视频` : '视频暂不可用'}
            disabled={!hasVideo}
            onClick={onPlay}
          >
            <span aria-hidden="true">▶</span>
          </button>
        ) : undefined}
      </div>

      <div className="video-event-card-body">
        {variant === 'interactive' ? (
          <div className="video-event-card-title">
            <strong>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}</strong>
            <span className={`verification-pill status-${event.verificationStatus}`}>{VERIFICATION_STATUS_LABELS[event.verificationStatus]}</span>
          </div>
        ) : undefined}
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
      </div>
    </article>
  );
}

