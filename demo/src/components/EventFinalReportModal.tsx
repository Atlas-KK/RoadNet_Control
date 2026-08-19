import type { AuditEntry } from '../domain/audit';
import type { EventFinalReport, SimEvent } from '../domain/event';
import { formatSimClock } from '../utils/time';

interface EventFinalReportModalProps {
  event: SimEvent;
  report: EventFinalReport;
  audit: AuditEntry[];
  sceneBaseSec: number;
  onClose: () => void;
}

function Metric({ label, before, after, unit }: { label: string; before: number; after: number; unit: string }) {
  const improving = label === '行驶密度' ? after < before : after > before;
  return (
    <div className="border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2">
      <div className="text-[10px] text-[var(--color-ink-soft)]">{label}</div>
      <div className="mt-1 font-formula text-sm font-semibold text-[var(--color-ink)]">
        {before} <span className="mx-1 text-[var(--color-ink-soft)]">→</span> {after} <span className="text-[10px] font-normal text-[var(--color-ink-soft)]">{unit}</span>
      </div>
      <div className={`mt-1 text-[10px] ${improving ? 'text-[var(--color-pass)]' : 'text-[var(--color-warn)]'}`}>
        {improving ? '处置后指标改善' : '进入恢复观察'}
      </div>
    </div>
  );
}

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-line)] pb-2">
      <h3 className="text-[13px] font-semibold text-[var(--color-ink)]">{title}</h3>
      {detail && <span className="text-[10px] text-[var(--color-ink-soft)]">{detail}</span>}
    </div>
  );
}

/** 事件处置闭环摘要的完整复盘视图，展示持久化快照及对应审计链。 */
export default function EventFinalReportModal({ event, report, audit, sceneBaseSec, onClose }: EventFinalReportModalProps) {
  const relatedAudit = audit.filter((entry) => entry.eventId === event.id || entry.planId === `PLAN-${event.id}`);

  return (
    <div className="fixed inset-0 z-[320] grid place-items-center p-4" data-testid="event-final-report-modal">
      <button type="button" aria-label="关闭事件处置闭环摘要" className="absolute inset-0 bg-[#020812]/60" onClick={onClose} />
      <article className="relative flex h-[min(860px,calc(100vh-32px))] w-[min(980px,96vw)] flex-col overflow-hidden border border-[var(--color-line)] bg-[var(--color-panel)] shadow-[0_24px_80px_rgb(0_0_0/0.25)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-5 py-4">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded bg-[var(--color-pass)] px-2 py-0.5 text-[10px] font-semibold text-[#06221a]">事件处置闭环摘要</span>
              <span className="font-formula text-[11px] text-[var(--color-ink-soft)]">{event.id}</span>
              <span className="text-[11px] text-[var(--color-pass)]">已完成</span>
            </div>
            <h2 className="text-[18px] font-semibold text-[var(--color-ink)]">{event.label}</h2>
            <p className="mt-1 text-[11px] text-[var(--color-ink-soft)]">{event.road} K{event.accidentKp} · 发生 {formatSimClock(sceneBaseSec, event.startSimSec)} · 闭环 {formatSimClock(sceneBaseSec, report.generatedSimSec)}</p>
          </div>
          <button type="button" onClick={onClose} className="arco-button arco-button-size-mini shrink-0" aria-label="关闭事件处置闭环摘要">关闭</button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <section className="pb-5">
            <SectionTitle title="处置结论" />
            <p className="mt-3 text-[13px] leading-6 text-[var(--color-ink)]">{report.summary}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
              <div className="border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2"><span className="block text-[10px] text-[var(--color-ink-soft)]">事件等级</span><b>{event.severity ?? '待研判'}</b></div>
              <div className="border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2"><span className="block text-[10px] text-[var(--color-ink-soft)]">涉事车辆</span><b>{event.vehicles ?? '--'} 辆</b></div>
              <div className="border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2"><span className="block text-[10px] text-[var(--color-ink-soft)]">完成措施</span><b>{report.completedMeasureCount} 项</b></div>
              <div className="border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 py-2"><span className="block text-[10px] text-[var(--color-ink-soft)]">排队状态</span><b className="text-[var(--color-pass)]">{report.queueCleared ? '已消散' : '恢复观察'}</b></div>
            </div>
          </section>

          <section className="pb-5">
            <SectionTitle title="事件演变过程" detail={`${report.evolution.length} 个时间片`} />
            <ol className="mt-3 space-y-2 border-l border-[var(--color-line)] pl-4">
              {report.evolution.map((phase) => (
                <li key={`${phase.simSec}-${phase.label}`} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[var(--color-brand)] ring-2 ring-[var(--color-panel)]" />
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <time className="font-formula text-[11px] font-semibold text-[var(--color-brand-700)]">{formatSimClock(sceneBaseSec, phase.simSec)}</time>
                    <span className="text-[12px] font-medium text-[var(--color-ink)]">{phase.label}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-[var(--color-ink-soft)]">
                    <span>车道 {phase.availableLanes} 条</span><span>队列 {phase.queuedVehicleCount} 辆</span><span>队速 {phase.queueSpeedKmh} km/h</span><span>能见度 {phase.visibilityMeters}m</span>
                    <span className={phase.closureActive ? 'text-[var(--color-danger)]' : 'text-[var(--color-pass)]'}>{phase.closureActive ? '封控生效' : '恢复通行'}</span>
                    {phase.ventilation && <span>风机 {phase.ventilation.fanId} {phase.ventilation.fanEnabled ? '运行' : '停用'} · {phase.ventilation.direction === 'increasing' ? '正向排风' : '反向排风'}</span>}
                    {phase.autoIssuedMeasureIds.length > 0 && <span className="text-[var(--color-brand-700)]">自动下发 {phase.autoIssuedMeasureIds.join('、')}</span>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {report.revisions.length > 0 && (
            <section className="pb-5">
              <SectionTitle title="事实修正与方案调整" />
              <div className="mt-3 space-y-2">
                {report.revisions.map((revision) => <div key={`${revision.simSec}-${revision.note}`} className="border border-[var(--color-warn)] bg-[var(--color-warn-50)] px-3 py-2 text-[11px] text-[var(--color-ink)]"><b className="mr-2 font-formula text-[var(--color-warn)]">{formatSimClock(sceneBaseSec, revision.simSec)}</b>{revision.note}<span className="ml-2 text-[var(--color-ink-soft)]">撤回事实：{revision.retractedFacts.join('、')}</span></div>)}
              </div>
            </section>
          )}

          <section className="pb-5">
            <SectionTitle title="研判与处置流程" detail={`${report.reasoning.length} 条推理 · ${report.planVersions.length} 个预案版本`} />
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <div className="text-[11px] font-medium text-[var(--color-ink)]">推理过程</div>
                {report.reasoning.map((step) => <div key={`${step.phase}-${step.title}`} className="border-l-2 border-[var(--color-brand)] pl-2"><div className="text-[10px] text-[var(--color-brand-700)]">{step.phase}</div><div className="text-[11px] font-medium text-[var(--color-ink)]">{step.title}</div><div className="text-[10px] leading-5 text-[var(--color-ink-soft)]">{step.conclusion}</div></div>)}
              </div>
              <div className="space-y-3">
                <div className="text-[11px] font-medium text-[var(--color-ink)]">预案与措施执行</div>
                {report.planVersions.map((plan) => (
                  <div key={plan.version} className="border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3">
                    <div className="flex items-center gap-2"><b className="text-[12px] text-[var(--color-ink)]">V{plan.version} · {plan.label}</b><span className="ml-auto text-[10px] text-[var(--color-pass)]">{plan.state}</span></div>
                    <div className="mt-1 text-[10px] text-[var(--color-ink-soft)]">责任主体：{plan.responsible}</div>
                    <ul className="mt-2 space-y-1.5">
                      {plan.measures.map((measure) => <li key={measure.measureId} className="border-t border-[var(--color-line)] pt-1.5"><div className="flex gap-2 text-[11px]"><b className="text-[var(--color-ink)]">{measure.title}</b><span className="ml-auto shrink-0 text-[var(--color-pass)]">{measure.runState}</span></div><div className="mt-0.5 text-[10px] leading-4 text-[var(--color-ink-soft)]">{measure.summary}</div>{measure.resource && <div className="mt-0.5 text-[10px] text-[var(--color-brand-700)]">资源 {measure.resource.id} · ETA {measure.resource.etaMin} min</div>}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="pb-5">
            <SectionTitle title="处置成效" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><Metric label="瓶颈通行能力" before={report.capacityBeforeVehPerHour} after={report.capacityAfterVehPerHour} unit="veh/h" /><Metric label="行驶密度" before={report.drivingDensityBeforeVehPerKm} after={report.drivingDensityAfterVehPerKm} unit="veh/km" /></div>
          </section>

          <section className="pb-1">
            <SectionTitle title="审计留痕" detail={`${relatedAudit.length} 条`} />
            <ol className="mt-3 space-y-1.5">
              {relatedAudit.length === 0 && <li className="text-[11px] text-[var(--color-ink-soft)]">暂无关联审计记录</li>}
              {relatedAudit.map((entry) => <li key={entry.seq} className="flex gap-2 border-b border-[var(--color-line)] pb-1.5 text-[10px]"><time className="w-[64px] shrink-0 font-formula text-[var(--color-ink-soft)]">{entry.tsSim == null ? '--:--:--' : formatSimClock(0, entry.tsSim)}</time><span className="w-[76px] shrink-0 text-[var(--color-brand-700)]">{entry.kind}</span><span className="text-[var(--color-ink)]">{entry.summary}</span></li>)}
            </ol>
          </section>
        </div>
      </article>
    </div>
  );
}
