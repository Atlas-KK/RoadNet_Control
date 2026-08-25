import type { MonitoringListItem } from '../selectors';
import { MONITORING_EVENT_TYPE_LABELS } from '../selectors';

interface EvidencePanelProps {
  item: MonitoringListItem;
  videoUnavailableReason?: string;
}

export default function EvidencePanel({ item, videoUnavailableReason }: EvidencePanelProps) {
  const { event, primaryAlarm } = item;
  const keyFrame = primaryAlarm?.evidence?.find((evidence) => evidence.kind === 'key_frame');
  const video = primaryAlarm?.evidence?.find((evidence) => evidence.kind === 'video_clip');
  const keyFrameId = keyFrame?.evidenceId ?? primaryAlarm?.evidenceIds.find((id) => /FRAME/i.test(id)) ?? primaryAlarm?.evidenceIds[0];
  const videoId = video?.evidenceId ?? primaryAlarm?.evidenceIds.find((id) => /VIDEO|CLIP/i.test(id));
  const videoAvailable = Boolean(videoId) && video?.available !== false && !videoUnavailableReason;
  const archivedEvidenceCount = primaryAlarm?.evidence?.filter((evidence) => evidence.archived).length ?? 0;
  return (
    <div className="monitoring-evidence-layout" data-testid="monitoring-evidence-panel">
      <section className="monitoring-keyframe" aria-label="模拟关键帧">
        <div className="monitoring-keyframe-scene" aria-hidden="true">
          <span className="keyframe-horizon" />
          <span className="keyframe-road" />
          <span className="keyframe-target">检测区域</span>
        </div>
        <div className="monitoring-keyframe-overlay">
          <span className="arco-tag monitoring-simulation-tag">模拟关键帧</span>
          <strong>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}</strong>
          <span>{event.location.roadCode} · {primaryAlarm?.location.deviceId ?? '设备待关联'}</span>
          <small>{keyFrameId ?? '暂无关键帧编号'}</small>
        </div>
      </section>

      {videoAvailable ? (
        <section className="monitoring-video-placeholder">
          <span className="video-play-symbol" aria-hidden="true">▶</span>
          <div><strong>模拟短视频占位</strong><p>受控证据编号：{videoId}</p></div>
        </section>
      ) : (
        <section className="arco-alert arco-alert-warning monitoring-video-fallback" role="status">
          <span aria-hidden="true">!</span>
          <div><strong>视频暂不可用</strong><p>{videoUnavailableReason ?? '受控视频证据不可用'}；已降级展示关键帧、算法信息和文字证据，不影响人工核实。</p></div>
        </section>
      )}

      {archivedEvidenceCount ? <div className="arco-alert arco-alert-warning" role="status">{archivedEvidenceCount}项证据已归档，仅保留受控引用和核实记录。</div> : undefined}

      <section className="monitoring-evidence-facts arco-surface-subtle">
        <h3>算法信息</h3>
        <dl>
          <div><dt>算法名称</dt><dd>{primaryAlarm?.modelName ?? '模拟视频事件检测算法'}</dd></div>
          <div><dt>算法版本</dt><dd>{primaryAlarm?.algorithmVersion ?? '版本待记录'}</dd></div>
          <div><dt>AI置信度</dt><dd>{primaryAlarm?.confidence === undefined ? '暂无' : `${Math.round(primaryAlarm.confidence * 100)}%`}</dd></div>
          <div><dt>受控载荷引用</dt><dd>{primaryAlarm?.rawPayloadRef ?? '暂无'}</dd></div>
        </dl>
      </section>

      <section className="monitoring-text-evidence arco-surface-subtle">
        <h3>文字证据</h3>
        <p>视频算法在指定检测区域发现“{MONITORING_EVENT_TYPE_LABELS[event.eventType]}”特征。当前仅展示脱敏事件摘要，不展示车牌、人脸或其他敏感个人信息。</p>
      </section>
    </div>
  );
}

