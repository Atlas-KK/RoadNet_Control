import { useState } from 'react';
import type { MonitoringListItem } from '../selectors';
import { MONITORING_EVENT_TYPE_LABELS } from '../selectors';
import VideoEventCard from './VideoEventCard';

interface EvidencePanelProps {
  item: MonitoringListItem;
  videoUnavailableReason?: string;
}

export default function EvidencePanel({ item, videoUnavailableReason }: EvidencePanelProps) {
  const { event, primaryAlarm } = item;
  const video = primaryAlarm?.evidence?.find((evidence) => evidence.kind === 'video_clip');
  const videoId = video?.evidenceId ?? primaryAlarm?.evidenceIds.find((id) => /VIDEO|CLIP/i.test(id));
  const videoAvailable = Boolean(videoId) && video?.available !== false && !videoUnavailableReason;
  const archivedEvidenceCount = primaryAlarm?.evidence?.filter((evidence) => evidence.archived).length ?? 0;
  const [playing, setPlaying] = useState(false);
  return (
    <div className="monitoring-evidence-layout" data-testid="monitoring-evidence-panel">
      {playing && videoAvailable ? (
        <section className="monitoring-video-player" aria-label={`${MONITORING_EVENT_TYPE_LABELS[event.eventType]}模拟视频`}>
          <div className="monitoring-video-player-surface">
            <span className="video-play-symbol" aria-hidden="true">▶</span>
            <strong>模拟视频播放中</strong>
          </div>
          <footer>
            <div><strong>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}事件视频</strong><p>受控证据编号：{videoId}</p></div>
            <button type="button" className="arco-button" onClick={() => setPlaying(false)}>返回事件卡片</button>
          </footer>
        </section>
      ) : <VideoEventCard
        item={item}
        variant="drawer-preview"
        operationalNowMs={Date.parse(event.updatedAt)}
        videoUnavailableReason={videoUnavailableReason}
        onPlay={() => setPlaying(true)}
      />}

      {!videoAvailable ? (
        <section className="arco-alert arco-alert-warning monitoring-video-fallback" role="status">
          <span aria-hidden="true">!</span>
          <div><strong>视频暂不可用</strong><p>{videoUnavailableReason ?? '受控视频证据不可用'}；仍可通过事件卡片和受控证据引用完成人工核实。</p></div>
        </section>
      ) : undefined}

      {archivedEvidenceCount ? <div className="arco-alert arco-alert-warning" role="status">{archivedEvidenceCount}项证据已归档，仅保留受控引用和核实记录。</div> : undefined}
    </div>
  );
}

