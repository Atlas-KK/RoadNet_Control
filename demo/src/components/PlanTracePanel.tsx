import { useStore } from '../store';
import PanelFrame from './PanelFrame';
import { usePanelFullscreen } from './FullscreenPanel';
import UnifiedTimelineQueue from './UnifiedTimelineQueue';
import { eventTypePresentation } from '../gis/incidentPopup';

/** 智能体处置主窗口：推理、预案和管控确认使用同一条时序队列呈现。 */
export default function PlanTracePanel() {
  const fullscreen = usePanelFullscreen('plan-trace-panel', '统一处置时序');
  const events = useStore((s) => s.events);
  const plans = useStore((s) => s.plans);
  const trace = useStore((s) => s.trace);
  const focusedEventId = useStore((s) => s.focusedEventId);
  const focusedEvent = events.find((event) => event.id === focusedEventId);
  const focusedEventType = focusedEvent ? eventTypePresentation(focusedEvent.typeNodeId, focusedEvent.hazmat) : undefined;
  const focusedPlan = focusedEventId
    ? plans.filter((plan) => plan.id === `PLAN-${focusedEventId}` && !plan.archived).sort((a, b) => b.version - a.version)[0]
    : undefined;
  const pendingCount = focusedPlan?.measures.filter((measure) => measure.runState === '待确认' && measure.tier !== '实况类').length ?? 0;
  const measureCount = focusedPlan?.measures.length ?? 0;
  const visibleTraceCount = focusedEventId ? trace.filter((step) => step.eventId === focusedEventId).length : 0;

  return (
    <PanelFrame
      testId="plan-trace-panel"
      fullscreen={fullscreen}
      title="统一处置时序"
      customHeader={(
        <header className="plan-trace-header min-h-[64px] shrink-0 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--color-ink)]">智能处置时序队列</span>
              <span className="shrink-0 whitespace-nowrap rounded border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-1.5 py-0.5 text-[9px] text-[var(--color-brand-700)]">推理 → 预案 → 确认</span>
            </div>
            {fullscreen.button}
          </div>
          <div className="mt-1.5 flex min-w-0 items-center justify-between gap-2">
            {focusedEvent ? (
              <div className="flex min-w-0 items-center gap-1.5 text-[10px]">
                <span className="min-w-0 truncate font-semibold text-[var(--color-ink)]">{focusedEvent.id} · {focusedEvent.label}</span>
                <span className="shrink-0 rounded border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-1.5 py-0.5 text-[9px] text-[var(--color-brand-700)]">{focusedEventType?.label}</span>
                <span className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-soft)]">{focusedEvent.road} K{focusedEvent.accidentKp}</span>
              </div>
            ) : <div className="min-w-0 truncate text-[10px] text-[var(--color-ink-soft)]">请选择左侧事件进入处置时序</div>}
            <div className="shrink-0 flex items-center gap-1">
              <span className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-soft)]">推理 {visibleTraceCount}</span>
              <span className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[9px] text-[var(--color-ink-soft)]">措施 {measureCount}</span>
              <span className={`rounded border px-1.5 py-0.5 text-[9px] ${pendingCount > 0 ? 'border-[var(--color-warn-100)] bg-[var(--color-warn-50)] text-[var(--color-warn)]' : 'border-[var(--color-pass-100)] bg-[var(--color-pass-50)] text-[var(--color-pass)]'}`}>待确认 {pendingCount}</span>
            </div>
          </div>
        </header>
      )}
    >
      <UnifiedTimelineQueue />
    </PanelFrame>
  );
}
