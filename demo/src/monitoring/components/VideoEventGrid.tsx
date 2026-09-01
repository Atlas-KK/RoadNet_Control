import { useEffect, useMemo, useRef, useState, type UIEvent } from 'react';
import { reconcileNewEventNotice } from '../newEventNotice';
import type { MonitoringListItem } from '../selectors';
import VideoEventCard from './VideoEventCard';

interface VideoEventGridProps {
  items: readonly MonitoringListItem[];
  allEventIds: readonly string[];
  operationalNowMs: number;
  selectedEventId?: string;
  scrollOffset: number;
  onScrollOffsetChange: (offset: number) => void;
  onOpen: (eventId: string) => void;
  onResetFilters: () => void;
  videoUnavailableReason?: string;
}

export default function VideoEventGrid(props: VideoEventGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const knownIdsRef = useRef(new Set(props.allEventIds));
  const [deferredIds, setDeferredIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const container = containerRef.current;
    if (container && Math.abs(container.scrollTop - props.scrollOffset) > 1) container.scrollTop = props.scrollOffset;
  }, [props.scrollOffset]);

  useEffect(() => {
    setDeferredIds((current) => {
      const next = reconcileNewEventNotice({
        knownIds: [...knownIdsRef.current],
        deferredIds: [...current],
      }, props.allEventIds, props.scrollOffset);
      knownIdsRef.current = new Set(next.knownIds);
      const unchanged = next.deferredIds.length === current.size
        && next.deferredIds.every((eventId) => current.has(eventId));
      return unchanged ? current : new Set(next.deferredIds);
    });
  }, [props.allEventIds, props.scrollOffset]);

  const visibleItems = useMemo(
    () => props.items.filter((item) => !deferredIds.has(item.event.monitoringEventId)),
    [deferredIds, props.items],
  );
  const deferredVisibleCount = props.items.filter((item) => deferredIds.has(item.event.monitoringEventId)).length;

  const revealNewEvents = () => {
    setDeferredIds(new Set());
    if (containerRef.current) containerRef.current.scrollTop = 0;
    props.onScrollOffsetChange(0);
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const offset = event.currentTarget.scrollTop;
    props.onScrollOffsetChange(offset);
    if (offset <= 8 && deferredIds.size) setDeferredIds(new Set());
  };

  return (
    <section className="video-event-list-shell arco-card" aria-label="实时视频事件列表">
      {deferredVisibleCount > 0 ? (
        <button type="button" className="monitoring-new-events" onClick={revealNewEvents}>新增 {deferredVisibleCount} 起事件，点击查看</button>
      ) : undefined}
      <div ref={containerRef} className="video-event-scroll" onScroll={handleScroll} data-testid="video-event-scroll">
        {visibleItems.length ? (
          <div className="video-event-grid" data-testid="video-event-grid">
            {visibleItems.map((item) => (
              <VideoEventCard
                key={item.event.monitoringEventId}
                item={item}
                operationalNowMs={props.operationalNowMs}
                selected={props.selectedEventId === item.event.monitoringEventId}
                onOpen={props.onOpen}
                videoUnavailableReason={props.videoUnavailableReason}
              />
            ))}
          </div>
        ) : (
          <div className="monitoring-empty-state" data-testid="monitoring-empty-state">
            <span aria-hidden="true"><img src="/figma/arco/empty.svg" alt="" /></span>
            <strong>暂无符合条件的视频事件</strong>
            <p>可以调整筛选条件，或等待模拟视频算法推送新的检测结果。</p>
            <button type="button" className="arco-button arco-button-outline" onClick={props.onResetFilters}>重置筛选</button>
          </div>
        )}
      </div>
    </section>
  );
}

