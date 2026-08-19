import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { buildTriageRows, sortTriage } from '../engine/triage';
import { assessSeverity, SEVERITY_META } from '../engine/severity';
import { tunnelAt } from '../data/network';
import FactReviseModal from './FactReviseModal';
import ProgressReportModal from './ProgressReportModal';
import { EVENT_PHOTO_SHEET, eventTypePresentation } from '../gis/incidentPopup';
import { DEMO_CASES, demoCaseById, type DemoCaseId } from '../data/demoCases';

interface EventTriageListProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/** 运行模式事件列表：排序、聚焦和处置入口共用同一事件口径，并支持向左折叠。 */
export default function EventTriageList({ collapsed = false, onToggleCollapse }: EventTriageListProps) {
  const events = useStore((s) => s.events);
  const plans = useStore((s) => s.plans);
  const simSec = useStore((s) => s.simSec);
  const focusedEventId = useStore((s) => s.focusedEventId);
  const focusEvent = useStore((s) => s.focusEvent);
  const voidPlan = useStore((s) => s.voidPlan);
  const falsifyEvent = useStore((s) => s.falsifyEvent);
  const loadDemoCase = useStore((s) => s.loadDemoCase);
  const [reviseEventId, setReviseEventId] = useState<string | null>(null);
  const [progressReportEventId, setProgressReportEventId] = useState<string | null>(null);
  const [demoCaseId, setDemoCaseId] = useState<DemoCaseId>('cross-event-diversion');
  const hasFocusedEvent = focusedEventId != null;
  const rows = useMemo(() => sortTriage(buildTriageRows(events
    .filter((event) => !event.finalized && !event.falsePositive)
    .map((event) => {
      const latest = plans.filter((plan) => plan.id === `PLAN-${event.id}` && !['已被替换', '已完成', '已作废'].includes(plan.state))
        .sort((a, b) => b.version - a.version)[0];
      return { event, pendingShownAtMs: latest?.measures.filter((measure) => measure.runState === '待确认').map((measure) => measure.shownAtMs) ?? [], simSec };
    }), Date.now())), [events, plans, simSec]);
  const loadSelectedDemoCase = () => {
    if (events.length > 0 && !confirm('加载演示案例会清空当前运行库、事件和审计记录，是否继续？')) return;
    loadDemoCase(demoCaseById(demoCaseId));
  };

  if (collapsed) {
    return (
      <aside data-testid="event-triage-list" className="arco-card flex h-full min-h-0 flex-col overflow-hidden">
        <button
          type="button"
          aria-label="展开事件列表"
          aria-expanded={false}
          onClick={onToggleCollapse}
          className="flex h-full w-full min-h-[48px] flex-col items-center gap-2 py-3 text-[var(--color-brand-700)] hover:bg-[var(--color-brand-50)]"
        >
          <span aria-hidden="true" className="text-base leading-none">→</span>
          <span className="[writing-mode:vertical-rl] text-[11px] font-semibold tracking-wide">事件列表</span>
          <span className="rounded-full bg-[var(--color-brand-50)] px-1.5 py-0.5 text-[9px]">{rows.length}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside data-testid="event-triage-list" className="arco-card flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex h-[48px] shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4">
        <span className="text-sm font-semibold text-[var(--color-ink)]">活跃 {rows.length} 起</span>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => window.dispatchEvent(new Event('roadgov:open-event-entry'))} className="arco-button arco-button-primary arco-button-size-mini"><span aria-hidden="true" className="arco-icon">＋</span>上报</button>
          <button
            type="button"
            aria-label="向左折叠事件列表"
            aria-expanded={true}
            title="向左折叠事件列表"
            onClick={onToggleCollapse}
            className="arco-button arco-button-size-mini arco-icon-button"
          >
            <span aria-hidden="true" className="arco-icon">←</span>
          </button>
        </div>
      </header>
      <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2" data-testid="event-list-case-loader">
        <div className="mb-1 text-[9px] font-medium text-[var(--color-ink-soft)]">演示案例</div>
        <div className="flex items-center gap-1.5">
          <select
            aria-label="选择演示案例"
            value={demoCaseId}
            onChange={(e) => setDemoCaseId(e.target.value as DemoCaseId)}
            className="arco-input h-7 min-w-0 flex-1 px-2 py-1 text-[11px]"
            data-testid="demo-case-select"
          >
            {DEMO_CASES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          <button type="button" onClick={loadSelectedDemoCase} className="arco-button arco-button-outline arco-button-size-mini shrink-0" data-testid="demo-case-load">加载</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 space-y-1.5 overflow-y-auto p-2">
        {rows.map((row) => {
          const event = events.find((item) => item.id === row.eventId)!;
          const focused = row.eventId === focusedEventId;
          const typeMeta = eventTypePresentation(event.typeNodeId, event.hazmat);
          const severity = event.severity ?? '一般';
          const severityReason = assessSeverity({
            lanesTotal: event.lanesTotal,
            lanesClosed: event.lanesClosed,
            casualties: event.casualties,
            hazmat: event.hazmat,
            inTunnel: tunnelAt(event.road, event.accidentKp) != null,
            congested: event.congested,
          }).reasons.join('、');
          return (
            <div key={row.eventId} data-testid={`triage-row-${row.eventId}`} aria-current={focused ? 'true' : undefined} className={`group relative overflow-hidden rounded-lg border transition-colors ${focused ? 'border-[var(--color-brand)] bg-[var(--color-brand-50)] ring-1 ring-[var(--color-brand)] shadow-[0_0_0_1px_rgb(64_128_255/0.12)]' : 'border-[var(--color-line)] bg-[var(--color-panel)] hover:border-[var(--color-brand-100)]'} ${hasFocusedEvent && !focused ? 'grayscale opacity-60' : ''}`}>
              {focused && <span className="absolute bottom-1 top-1 left-0 w-[3px] rounded-r bg-[var(--color-brand)]" />}
              <button type="button" aria-pressed={focused} onClick={() => focusEvent(row.eventId)} className="relative z-10 block w-full text-left">
                <div className="relative h-[88px] overflow-hidden bg-[#0f1720]">
                  <div role="img" aria-label={`${typeMeta.label}现场照片`} className="absolute inset-0 bg-cover bg-no-repeat opacity-95 transition-transform duration-300 group-hover:scale-[1.02]" style={{ backgroundImage: `url(${EVENT_PHOTO_SHEET})`, backgroundSize: '200% 200%', backgroundPosition: typeMeta.photoPosition }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#000000e6] via-[#00000066] to-transparent" />
                  <div className="absolute right-2 bottom-1.5 left-2 flex items-center gap-1.5">
                    <span data-testid={`triage-type-${row.eventId}`} className="min-w-0 truncate rounded border border-[#ffffff33] bg-[#000000b3] px-1.5 py-0.5 text-[10px] font-semibold text-white">{typeMeta.label}</span>
                    <span data-testid={`triage-severity-${row.eventId}`} title={severityReason} className="ml-auto shrink-0 rounded border bg-[#000000b3] px-1.5 py-0.5 text-[9px] font-semibold" style={{ color: SEVERITY_META[severity].color, borderColor: SEVERITY_META[severity].color }}>{SEVERITY_META[severity].label}</span>
                  </div>
                </div>
                <div className="p-2 pt-1.5">
                  <div className="flex items-center gap-1.5 text-[11px]"><b className="text-[var(--color-ink)]">{row.eventId}</b>{row.overdue && <span className="text-[9px] text-[var(--color-danger)]">⚠超时</span>}{event.caseLinkGroup && <span className="text-[9px] text-[var(--color-warn)]">并案</span>}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">{event.road} K{event.accidentKp}</div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-[var(--color-ink-soft)]"><span>{event.congested ? `排队 ${row.queueKm.toFixed(1)}km` : '未成队'}</span><span className="rounded border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-1.5 py-0.5 text-[9px] text-[var(--color-brand-700)]">待办 {row.pendingCount}</span></div>
                </div>
              </button>
              <div className="absolute top-1.5 right-1.5 z-30 flex gap-1">
                <button type="button" data-testid={`triage-progress-report-${row.eventId}`} title="填报续报" onClick={() => setProgressReportEventId(row.eventId)} className="grid h-5 w-5 place-items-center rounded border border-[#ffffff33] bg-[#000000b3] text-[10px] text-white">续</button>
                {(event.hazmat === true || (event.casualties ?? 0) > 0) && <button type="button" data-testid={`triage-revise-${row.eventId}`} title="属性修正" onClick={() => setReviseEventId(row.eventId)} className="grid h-5 w-5 place-items-center rounded border border-[#ffffff33] bg-[#000000b3] text-[11px] text-white/70">✎</button>}
                <button type="button" title="作废预案" onClick={() => { const reason = prompt('作废理由（现场接管/方案有误）'); if (reason) voidPlan(`PLAN-${row.eventId}`, reason); }} className="grid h-5 w-5 place-items-center rounded border border-[#ffffff33] bg-[#000000b3] text-[11px] text-[var(--color-danger)]">×</button>
                <button type="button" title="事件证伪" onClick={() => { const reason = prompt('证伪理由（感知误报）'); if (reason) falsifyEvent(row.eventId, reason); }} className="grid h-5 w-5 place-items-center rounded border border-[#ffffff33] bg-[#000000b3] text-[11px] text-[var(--color-warn)]">⚠</button>
              </div>
              {hasFocusedEvent && !focused && <div className="pointer-events-none absolute inset-0 z-20 bg-[#020812]/45" aria-hidden="true" />}
            </div>
          );
        })}
      </div>
      {reviseEventId && <FactReviseModal eventId={reviseEventId} onClose={() => setReviseEventId(null)} />}
      {progressReportEventId && <ProgressReportModal eventId={progressReportEventId} onClose={() => setProgressReportEventId(null)} />}
    </aside>
  );
}
