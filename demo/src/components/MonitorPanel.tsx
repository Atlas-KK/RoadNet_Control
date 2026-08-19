import { useMemo, useState } from 'react';
import { DEVICES } from '../data/devices';
import { useStore } from '../store';
import { formatSimClock } from '../utils/time';
import { usePanelFullscreen } from './FullscreenPanel';
import PanelFrame from './PanelFrame';

type VideoSource = 'roadside' | 'drone';

const VIDEO_SOURCES: Record<VideoSource, { label: string; description: string; src: string }> = {
  roadside: {
    label: '路侧监控',
    description: '固定路侧摄像机画面',
    src: '/现场视频/路侧监控视角.mp4',
  },
  drone: {
    label: '无人机画面',
    description: '无人机现场巡查画面',
    src: '/现场视频/无人机视角.mp4',
  },
};

interface MonitorPanelProps {
  selectedCameraId: string;
  /** 嵌入 GIS Tab 时复用视频内容，不再渲染第二层 PanelFrame。 */
  embedded?: boolean;
}

/** 现场视频模块：通过按钮切换路侧监控和无人机两路本地视频占位素材。 */
export default function MonitorPanel({ selectedCameraId, embedded = false }: MonitorPanelProps) {
  const fullscreen = usePanelFullscreen('monitor-panel', '现场视频');
  const [videoSource, setVideoSource] = useState<VideoSource>('roadside');
  const baseSec = useStore((s) => s.sceneBaseSec);
  const simSec = useStore((s) => s.simSec);
  const camera = useMemo(
    () => DEVICES.find((device) => device.id === selectedCameraId && device.kind === 'camera') ?? DEVICES.find((device) => device.id === 'CAM-1195')!,
    [selectedCameraId],
  );
  const clock = formatSimClock(baseSec, simSec);
  const activeVideo = VIDEO_SOURCES[videoSource];

  const content = (
    <>
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 rounded bg-[var(--color-pass-50)] px-1.5 py-0.5 text-[9px] text-[var(--color-pass)]">现场视频</span>
          <span className="truncate text-[9px] text-[var(--color-ink-soft)]">{camera.id} · K{camera.kp}</span>
        </div>
        <time className="shrink-0 text-[9px] text-[var(--color-ink-soft)] font-formula">{clock}</time>
      </div>

      <div className="mx-3 grid h-7 shrink-0 grid-cols-2 gap-1 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] p-0.5">
        {(Object.keys(VIDEO_SOURCES) as VideoSource[]).map((source) => {
          const item = VIDEO_SOURCES[source];
          return (
            <button
              key={source}
              type="button"
              aria-pressed={videoSource === source}
              onClick={() => setVideoSource(source)}
              className={`rounded text-[10px] transition-colors ${videoSource === source ? 'bg-[var(--color-brand)] text-white' : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="relative mx-3 mt-1.5 min-h-0 flex-1 overflow-hidden rounded-md border border-[var(--color-line)] bg-[#020812]">
        <video
          key={activeVideo.src}
          data-testid={`现场视频-${videoSource}`}
          className="h-full w-full object-cover"
          src={activeVideo.src}
          controls
          autoPlay
          muted
          loop
          playsInline
          aria-label={`${activeVideo.label}：${activeVideo.description}`}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent px-2 py-1.5 text-[9px] text-white">
          <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />{activeVideo.label}</span>
          <span>K{camera.kp} · {clock}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-[9px] text-[var(--color-ink-soft)]">
        <span>{activeVideo.description}</span>
        <span className="rounded border border-[var(--color-line)] px-1.5 py-0.5">MP4 演示占位</span>
      </div>
    </>
  );

  if (embedded) {
    return <div data-testid="monitor-panel" className="flex h-full min-h-0 flex-col bg-[var(--color-panel)]">{content}</div>;
  }

  return (
    <PanelFrame
      testId="monitor-panel"
      fullscreen={fullscreen}
      title={
        <>
          <h2 className="truncate text-[12px] font-semibold text-[var(--color-ink)]">现场视频</h2>
          <div className="truncate text-[9px] text-[var(--color-ink-soft)]">{camera.id} · {camera.note ?? '路网视频监测点'}</div>
        </>
      }
      headerActions={
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-pass)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-pass)] shadow-[0_0_8px_var(--color-pass)]" />
          视频占位
        </span>
      }
    >
      {content}
    </PanelFrame>
  );
}
