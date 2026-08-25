import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Plan, PlanMeasure } from '../domain/plan';
import type { EventFinalReport, EventProgressReport, SimEvent } from '../domain/event';
import type { TraceStep, CalcRecord } from '../engine/trace';
import { TIER_META } from '../engine/review';
import { confirmRemainingSec, confirmStatus } from '../engine/confirmTiming';
import { DetailModal } from './ReasoningPanel';
import EventFinalReportModal from './EventFinalReportModal';
import { dispatchTargetTypeLabel } from '../engine/commandDispatch';

const PHASE_COLOR: Record<TraceStep['phase'], string> = {
  落图: 'var(--color-brand)',
  快照: 'var(--color-graph)',
  检索: 'var(--color-graph)',
  推演: 'var(--color-brand)',
  裁剪匹配: 'var(--color-pass)',
  撤销传导: 'var(--color-danger)',
};

/** 技术推理阶段只保留在追溯数据中；主时序按监控员可理解的业务动作呈现。 */
const PHASE_BUSINESS: Record<TraceStep['phase'], { label: string; summary: string }> = {
  落图: { label: '事件定位', summary: '已确定事件类型、发生位置和受影响路段。' },
  快照: { label: '信息汇集', summary: '已汇总当前现场、路况、设备和资源信息。' },
  检索: { label: '依据匹配', summary: '已匹配适用的处置规则、联动资源和管控措施。' },
  推演: { label: '影响研判', summary: '已评估交通影响、风险演变和处置需求。' },
  裁剪匹配: { label: '方案校验', summary: '已校验措施与路网条件、资源状态是否匹配。' },
  撤销传导: { label: '方案调整', summary: '已根据现场订正结果调整相关管控措施。' },
};

const PROVIDER_LABEL: Record<string, string> = {
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  custom: 'AI',
};

type TimelineEntry =
  | { kind: 'trace'; key: string; index: number; step: TraceStep }
  | { kind: 'plan'; key: string; index: number; plan: Plan }
  | { kind: 'comparison'; key: string; index: number; plan: Plan }
  | { kind: 'measure'; key: string; index: number; plan: Plan; measure: PlanMeasure }
  | { kind: 'progress'; key: string; index: number; report: EventProgressReport }
  | { kind: 'report'; key: string; index: number; event: SimEvent; report: EventFinalReport };

function planDisplayLabel(plan: Plan) {
  return plan.label.replace(/^V(\d+)\s*(初报|续报|终报)/, 'V$1 管控预案');
}

function TimelineMarker({ index, color }: { index: number; color: string }) {
  return (
    <span
      className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 bg-[var(--color-panel)] text-[10px] font-bold"
      style={{ color, borderColor: color }}
    >
      {String(index + 1).padStart(2, '0')}
    </span>
  );
}

function TraceTimelineItem({ step, index, onOpenDetail }: { step: TraceStep; index: number; onOpenDetail: (id: string) => void }) {
  const activeStepId = useStore((s) => s.activeStepId);
  const selectStep = useStore((s) => s.selectStep);
  const active = activeStepId === step.id;
  const hasDetail = (step.edges?.length ?? 0) > 0 || (step.calcs?.length ?? 0) > 0;
  const business = PHASE_BUSINESS[step.phase];

  return (
    <li className="relative flex gap-2.5 pb-2.5">
      <TimelineMarker index={index} color={PHASE_COLOR[step.phase]} />
      <div
        role="button"
        tabIndex={0}
        onClick={() => selectStep(step.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') selectStep(step.id); }}
        className={`min-w-0 flex-1 rounded-md border px-2.5 py-2 text-left transition-colors cursor-pointer ${
          active
            ? 'border-[var(--color-brand)] bg-[var(--color-brand-50)] ring-1 ring-[var(--color-brand)]'
            : 'border-[var(--color-brand-100)] bg-[var(--color-brand-50)] hover:border-[var(--color-brand)]'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-white" style={{ background: PHASE_COLOR[step.phase] }}>智能研判</span>
          <span className="min-w-0 truncate text-[9px] text-[var(--color-ink-soft)]">系统自动完成</span>
          {hasDetail && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); selectStep(step.id); onOpenDetail(step.id); }}
              className="ml-auto shrink-0 rounded bg-[var(--color-brand)] px-2 py-0.5 text-[9px] font-medium text-white hover:bg-[var(--color-brand-700)]"
            >
              图谱·计算
            </button>
          )}
        </div>
        <div className="mt-1 text-[11px] font-semibold leading-snug text-[var(--color-ink)]">{business.label}</div>
        <div className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-soft)]">{business.summary}</div>
        <div className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-soft)]">当前结论：{step.conclusion}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {step.dataSources.map((source) => <span key={source} className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1 py-0.5 text-[9px] text-[var(--color-ink-soft)]">{source}</span>)}
          {step.calcs && step.calcs.length > 0 && <span className="rounded bg-[var(--color-brand-50)] px-1 py-0.5 text-[9px] text-[var(--color-brand-700)]">{step.calcs.length} 条计算</span>}
        </div>
      </div>
    </li>
  );
}

function PlanTimelineItem({ plan, index, versions, activeVersion, onVersionChange }: { plan: Plan; index: number; versions: Plan[]; activeVersion: number; onVersionChange: (version: number) => void }) {
  return (
    <li className="relative flex gap-2.5 pb-2.5">
      <TimelineMarker index={index} color="var(--color-graph)" />
      <div className="min-w-0 flex-1 rounded-md border border-[var(--color-graph)] bg-[var(--color-graph-50)] px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[var(--color-graph)] px-1.5 py-0.5 text-[9px] font-semibold text-white">预案生成</span>
          <span className="text-[9px] text-[var(--color-ink-soft)]">{plan.measures.length} 项管控措施</span>
          <div className="ml-auto flex items-center gap-1">
            {versions.map((version) => (
              <button
                key={version.version}
                type="button"
                onClick={() => onVersionChange(version.version)}
                className={`rounded border px-1.5 py-0.5 text-[9px] ${version.version === activeVersion ? 'border-[var(--color-graph)] bg-[var(--color-graph)] text-white' : 'border-[var(--color-line)] text-[var(--color-ink-soft)]'}`}
              >
                V{version.version}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{planDisplayLabel(plan)}</span>
          <span className="rounded border border-[var(--color-graph)] px-1.5 py-0.5 text-[9px] text-[var(--color-graph)]">{plan.state}</span>
        </div>
        <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">责任主体：{plan.responsible} · 置信：{plan.confidence}</div>
        {plan.aiNarrative ? (
          <div className="mt-1.5 border-t border-[var(--color-graph-100)] pt-1.5 text-[10px] leading-snug text-[var(--color-ink)]">
            <span className="mr-1 text-[var(--color-graph)]">{PROVIDER_LABEL[plan.aiNarrative.provider] ?? 'AI'}:</span>{plan.aiNarrative.summary}
            {plan.aiNarrative.riskNote && <span className="ml-1 text-[var(--color-warn)]">风险：{plan.aiNarrative.riskNote}</span>}
          </div>
        ) : plan.aiStatus?.status === 'pending' ? (
          <div className="mt-1 text-[10px] text-[var(--color-ink-soft)]">AI 正在补充预案说明…</div>
        ) : null}
      </div>
    </li>
  );
}

function ProgressReportTimelineItem({ report, index }: { report: EventProgressReport; index: number }) {
  const changeLabels: Partial<Record<keyof EventProgressReport['changes'], string>> = { casualties: '伤亡', hazmat: '危化品', lanesClosed: '占道车道', q: '交通量', stage: '处置进展' };
  const changed = Object.keys(report.changes).map((key) => changeLabels[key as keyof EventProgressReport['changes']]);
  return (
    <li className="relative flex gap-2.5 pb-2.5" data-testid="event-progress-report">
      <TimelineMarker index={index} color="var(--color-warn)" />
      <div className="min-w-0 flex-1 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-50)] px-2.5 py-2">
        <div className="flex items-center gap-1.5"><span className="rounded bg-[var(--color-warn)] px-1.5 py-0.5 text-[9px] font-semibold text-[#3b2400]">{report.kind}</span><span className="font-formula text-[9px] text-[var(--color-ink-soft)]">{report.id}</span><span className="ml-auto text-[9px] text-[var(--color-ink-soft)]">{report.source} · {report.reporter}</span></div>
        <div className="mt-1 text-[10px] leading-snug text-[var(--color-ink)]">{report.description}</div>
        <div className="mt-1 text-[9px] text-[var(--color-ink-soft)]">{changed.length > 0 ? `更新字段：${changed.join('、')}` : '补充描述，未改变研判事实'}{report.triggeredPlanVersion ? ` · 已触发 V${report.triggeredPlanVersion} 管控预案` : ''}</div>
      </div>
    </li>
  );
}

function CandidateComparisonTimelineItem({ plan, index }: { plan: Plan; index: number }) {
  const selectPlanCandidate = useStore((s) => s.selectPlanCandidate);
  const confirmPlanCandidate = useStore((s) => s.confirmPlanCandidate);
  const candidates = plan.candidates ?? [];
  const selected = candidates.find((candidate) => candidate.id === plan.selectedCandidateId) ?? candidates[0];
  if (candidates.length === 0 || !selected) return null;

  return (
    <li className="relative flex gap-2.5 pb-2.5" data-testid="plan-candidate-comparison">
      <TimelineMarker index={index} color="var(--color-warn)" />
      <section className="min-w-0 flex-1 rounded-md border border-[var(--color-warn)] bg-[var(--color-warn-50)] px-2.5 py-2" aria-label="决策方案对比">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[var(--color-warn)] px-1.5 py-0.5 text-[9px] font-semibold text-[#3b2400]">决策对比</span>
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">候选方案与预测效果</span>
          <span className="ml-auto text-[9px] text-[var(--color-ink-soft)]">统一预测窗口 {selected.effect.horizonMin} min</span>
        </div>
        <div className="mt-1 text-[9px] leading-snug text-[var(--color-ink-soft)]">A/B/C 为同一事实快照下的策略选项，不等同于 V{plan.version} 预案版本。</div>
        <div className="mt-2 space-y-1.5">
          {candidates.map((candidate) => {
            const active = candidate.id === selected.id;
            return (
              <div key={candidate.id} className={`rounded border px-2 py-1.5 ${active ? 'border-[var(--color-warn)] bg-[var(--color-panel)]' : 'border-[var(--color-line)] bg-[var(--color-panel-2)]'}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-[var(--color-ink)]">{candidate.label}</span>
                  {candidate.recommended && <span className="rounded bg-[var(--color-brand-50)] px-1 py-0.5 text-[8px] text-[var(--color-brand-700)]">推荐</span>}
                  <span className={`ml-auto rounded px-1 py-0.5 text-[8px] ${candidate.confidence.level === '高' ? 'bg-[var(--color-pass-50)] text-[var(--color-pass)]' : candidate.confidence.level === '中' ? 'bg-[var(--color-warn-50)] text-[var(--color-warn)]' : 'bg-[var(--color-danger-50)] text-[var(--color-danger)]'}`}>置信 {candidate.confidence.score} · {candidate.confidence.level}</span>
                </div>
                <div className="mt-0.5 text-[9px] leading-snug text-[var(--color-ink-soft)]">{candidate.summary}</div>
                <div className="mt-1 grid grid-cols-3 gap-1 text-[8px] text-[var(--color-ink-soft)]">
                  <span>最大排队 <b className="font-formula text-[var(--color-ink)]">{candidate.effect.maxQueueKm} km</b></span>
                  <span>预计消散 <b className="font-formula text-[var(--color-ink)]">{candidate.effect.queueDissipateMin} min</b></span>
                  <span>能力改善 <b className="font-formula text-[var(--color-ink)]">+{candidate.effect.capacityIncreasePct}%</b></span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <details className="min-w-0 flex-1 text-[8px] text-[var(--color-ink-soft)]">
                    <summary className="cursor-pointer text-[var(--color-brand-700)]">预测依据与置信构成</summary>
                    <div className="mt-1 leading-snug">{candidate.effect.basisRefs.join('；')}。{candidate.confidence.note}。{candidate.risks.length > 0 ? `风险：${candidate.risks.join('；')}` : '未发现新增执行风险。'}</div>
                  </details>
                  {!plan.decisionConfirmedAt && (
                    <button type="button" onClick={() => selectPlanCandidate(plan.id, plan.version, candidate.id)} className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] ${active ? 'border-[var(--color-warn)] text-[var(--color-warn)]' : 'border-[var(--color-line)] text-[var(--color-ink-soft)]'}`}>
                      {active ? '已选择' : '选择'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {!plan.decisionConfirmedAt ? (
          <button type="button" data-testid="confirm-plan-candidate" onClick={() => confirmPlanCandidate(plan.id, plan.version)} className="mt-2 w-full rounded bg-[var(--color-warn)] px-2 py-1 text-[10px] font-semibold text-[#3b2400]">确认选用 {selected.label}，进入措施确认</button>
        ) : (
          <div className="mt-2 text-[9px] text-[var(--color-pass)]">已确认选用 {selected.label}，可继续确认管控措施</div>
        )}
      </section>
    </li>
  );
}

function MeasureTimelineItem({ plan, measure, index, nowMs, canConfirm, decisionReady }: { plan: Plan; measure: PlanMeasure; index: number; nowMs: number; canConfirm: boolean; decisionReady: boolean }) {
  const confirmMeasure = useStore((s) => s.confirmMeasure);
  const rejectMeasure = useStore((s) => s.rejectMeasure);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const tier = TIER_META[measure.tier];
  const dispatch = measure.dispatch;
  const done = measure.runState === '已下发' || measure.runState === '已完成';
  const timing = decisionReady && !done && measure.tier !== '实况类' ? confirmStatus(measure.shownAtMs, nowMs) : null;
  const timingLabel = timing === 'escalated'
    ? '已升级·超时'
    : timing === 'overdue'
      ? '已超时'
      : timing
        ? `剩 ${Math.max(0, Math.round(confirmRemainingSec(measure.shownAtMs, nowMs)))}s`
        : null;

  return (
    <li className="relative flex gap-2.5 pb-2.5">
      <TimelineMarker index={index} color={measure.tier === '实况类' ? 'var(--color-ink-soft)' : tier.color} />
      <div className={`min-w-0 flex-1 rounded-md border px-2.5 py-2 ${done ? 'border-[var(--color-pass-100)] bg-[var(--color-pass-50)] opacity-85' : measure.tier === '实况类' ? 'border-[var(--color-line)] bg-[var(--color-panel-2)] opacity-70' : 'border-[var(--color-pass-100)] bg-[var(--color-pass-50)]'}`}>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[var(--color-pass)] px-1.5 py-0.5 text-[9px] font-semibold text-[#06221a]">管控</span>
          <span className="rounded px-1.5 py-0.5 text-[9px] text-white" style={{ background: measure.tier === '实况类' ? 'var(--color-ink-soft)' : tier.color }}>{measure.tier}</span>
          {timingLabel && <span className={`rounded border px-1.5 py-0.5 text-[9px] ${timing === 'escalated' ? 'border-[var(--color-danger)] bg-[var(--color-danger-50)] text-[var(--color-danger)]' : timing === 'overdue' ? 'border-[var(--color-warn)] bg-[var(--color-warn-50)] text-[var(--color-warn)]' : 'border-[var(--color-line)] text-[var(--color-ink-soft)]'}`}>{timingLabel}</span>}
          <span className={`ml-auto text-[9px] ${dispatch?.status === 'failed' || dispatch?.status === 'partial_success' ? 'text-[var(--color-danger)]' : dispatch?.status === 'success' ? 'text-[var(--color-pass)]' : 'text-[var(--color-ink-soft)]'}`}>{measure.runState === '自动执行' ? '自动+审计' : measure.runState === '已完成' ? '已完成 · 效果已回写' : dispatch?.status === 'success' ? `下发成功 · ${dispatch.elapsedSec.toFixed(1)}s` : dispatch?.status === 'partial_success' ? `部分成功 · ${dispatch.targets.filter((target) => target.status === 'failed').length} 项失败` : dispatch?.status === 'failed' ? '下发失败' : done ? `已下发 · ${(measure.confirmMs ?? 0) / 1000 < 0.1 ? '<0.1' : ((measure.confirmMs ?? 0) / 1000).toFixed(1)}s` : '待人工确认'}</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">{measure.title}</span>
          {!done && measure.tier !== '实况类' && canConfirm && (
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <button
                type="button"
                data-testid={`timeline-reject-${measure.id}`}
                onClick={() => { const reason = prompt('打回理由（现场反馈不符/方案有误）'); if (reason) rejectMeasure(plan.id, plan.version, measure.id, reason); }}
                className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)]"
              >
                打回
              </button>
              <button
                type="button"
                data-testid={`timeline-confirm-${measure.id}`}
                onClick={() => confirmMeasure(plan.id, plan.version, measure.id)}
                className="rounded px-2.5 py-1 text-[10px] font-semibold text-white"
                style={{ background: tier.color }}
              >
                {tier.confirmLabel}
              </button>
            </div>
          )}
          {!done && measure.tier !== '实况类' && !canConfirm && <span className="ml-auto text-[9px] text-[var(--color-ink-soft)]">{decisionReady ? '历史版本 · 仅查看' : '请先确认方案'}</span>}
        </div>
        <div className="mt-0.5 text-[10px] leading-snug text-[var(--color-ink-soft)]">{measure.summary}</div>
        {dispatch && (
          <div className="mt-1.5 rounded border border-[var(--color-brand-100)] bg-[var(--color-panel)] px-1.5 py-1 text-[9px] text-[var(--color-ink-soft)]">
            <div className="flex items-center gap-1">
              <span className="truncate">下发至：{dispatch.targets.slice(0, 3).map((target) => target.name).join('、')}{dispatch.targets.length > 3 ? ` 等 ${dispatch.targets.length} 项` : ''}</span>
              <button type="button" onClick={() => setReceiptOpen((open) => !open)} className="ml-auto shrink-0 text-[var(--color-brand-700)]">{receiptOpen ? '收起回执' : '查看回执'}</button>
            </div>
            {receiptOpen && <div className="mt-1 space-y-1 border-t border-[var(--color-line)] pt-1">
              {dispatch.targets.map((target) => <div key={target.id} className="flex items-center gap-1"><span className="rounded bg-[var(--color-panel-2)] px-1 py-0.5 text-[8px]">{dispatchTargetTypeLabel(target.type)}</span><span className="min-w-0 flex-1 truncate">{target.name}</span><span className={target.status === 'success' ? 'text-[var(--color-pass)]' : 'text-[var(--color-danger)]'}>{target.status === 'success' ? `已确认 · ${dispatch.elapsedSec.toFixed(1)}s` : target.failureReason ?? '下发失败'}</span></div>)}
            </div>}
          </div>
        )}
        {measure.resource && <div className="mt-1 text-[9px] text-[var(--color-pass)]">资源 {measure.resource.id} · ETA {measure.resource.etaMin} min</div>}
        {measure.supports.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {measure.supports.map((support) => <button key={support} type="button" onClick={() => useStore.getState().selectStep(support)} className="rounded bg-[var(--color-brand-50)] px-1 py-0.5 text-[9px] text-[var(--color-brand-700)]">依据 {support}</button>)}
          </div>
        )}
        {measure.rejectReason && <div className="mt-1 text-[10px] text-[var(--color-danger)]">已打回：{measure.rejectReason}</div>}
      </div>
    </li>
  );
}

function FinalReportTimelineItem({ report, index, onOpen }: { report: EventFinalReport; index: number; onOpen: () => void }) {
  return (
    <li className="relative flex gap-2.5 pb-2.5" data-testid="event-final-report">
      <TimelineMarker index={index} color="var(--color-pass)" />
      <div className="min-w-0 flex-1 rounded-md border border-[var(--color-pass)] bg-[var(--color-pass-50)] px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-[var(--color-pass)] px-1.5 py-0.5 text-[9px] font-semibold text-[#06221a]">处置闭环</span>
          <span className="text-[11px] font-semibold text-[var(--color-ink)]">事件处置完成</span>
          <span className="ml-auto text-[9px] text-[var(--color-pass)]">已生成</span>
        </div>
        <div className="mt-1 text-[10px] leading-snug text-[var(--color-ink)]">{report.summary}</div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[9px]">
          <span className="rounded border border-[var(--color-pass-100)] bg-[var(--color-panel)] px-1.5 py-1 text-[var(--color-ink-soft)]">通行能力 <b className="font-formula text-[var(--color-pass)]">{report.capacityBeforeVehPerHour} → {report.capacityAfterVehPerHour}</b> veh/h</span>
          <span className="rounded border border-[var(--color-pass-100)] bg-[var(--color-panel)] px-1.5 py-1 text-[var(--color-ink-soft)]">行驶密度 <b className="font-formula text-[var(--color-pass)]">{report.drivingDensityBeforeVehPerKm} → {report.drivingDensityAfterVehPerKm}</b> veh/km</span>
        </div>
        <div className="mt-1 text-[9px] text-[var(--color-ink-soft)]">已完成措施 {report.completedMeasureCount} 项 · {report.queueCleared ? '排队已消散，现场恢复通行' : '现场进入恢复观察'}</div>
        <button
          type="button"
          data-testid="open-event-final-report"
          onClick={onOpen}
          className="mt-2 rounded border border-[var(--color-pass)] bg-[var(--color-panel)] px-2 py-1 text-[10px] font-medium text-[var(--color-pass)] hover:bg-[var(--color-pass-50)]"
        >
          查看闭环摘要
        </button>
      </div>
    </li>
  );
}

function ForcedInterruptModal() {
  const forcedId = useStore((s) => s.forcedInterrupt);
  const setForcedInterrupt = useStore((s) => s.setForcedInterrupt);
  const plans = useStore((s) => s.plans);
  const confirmMeasure = useStore((s) => s.confirmMeasure);
  if (!forcedId) return null;
  const plan = plans.find((candidate) => candidate.measures.some((measure) => measure.id === forcedId));
  const measure = plan?.measures.find((item) => item.id === forcedId);
  if (!plan || !measure) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-w-md rounded-xl border-2 border-[var(--color-danger)] bg-[var(--color-panel)] p-6 shadow-2xl">
        <div className="mb-3 flex items-center gap-2"><span className="text-2xl">⚠</span><span className="text-lg font-bold text-[var(--color-danger)]">强制升级打断 · 高危事项</span></div>
        <div className="mb-1 text-sm text-[var(--color-ink)]">{measure.title}</div>
        <div className="mb-4 text-xs text-[var(--color-ink-soft)]">{measure.summary}</div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setForcedInterrupt(null)} className="rounded border border-[var(--color-line)] px-3 py-1.5 text-sm text-[var(--color-ink)]">稍后</button>
          <button type="button" onClick={() => { confirmMeasure(plan.id, plan.version, measure.id); setForcedInterrupt(null); }} className="rounded bg-[var(--color-danger)] px-4 py-1.5 text-sm font-medium text-white">确认下发</button>
        </div>
      </div>
    </div>
  );
}

function latestPlans(plans: Plan[]) {
  const valid = plans.filter((plan) => !['已被替换', '已作废'].includes(plan.state));
  return Array.from(valid.reduce((groups, plan) => {
    const current = groups.get(plan.id);
    if (!current || plan.version > current.version) groups.set(plan.id, plan);
    return groups;
  }, new Map<string, Plan>()).values());
}

/** 把推理步骤、预案生成和管控措施串成一条事件处置时序队列。 */
export default function UnifiedTimelineQueue() {
  const plans = useStore((s) => s.plans);
  const trace = useStore((s) => s.trace);
  const focusedEventId = useStore((s) => s.focusedEventId);
  const focusedEvent = useStore((s) => s.events.find((event) => event.id === s.focusedEventId));
  const activeVersion = useStore((s) => s.activePlanVersion);
  const setActivePlanVersion = useStore((s) => s.setActivePlanVersion);
  const noteOverdueEscalation = useStore((s) => s.noteOverdueEscalation);
  const calcs = useStore((s) => s.calcs);
  const audit = useStore((s) => s.audit);
  const sceneBaseSec = useStore((s) => s.sceneBaseSec);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [detailStepId, setDetailStepId] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentPlans = useMemo(() => latestPlans(plans), [plans]);
  const focusedVersions = focusedEventId ? plans.filter((plan) => plan.id === `PLAN-${focusedEventId}`) : [];
  const focusedLatestPlan = currentPlans.find((plan) => plan.id === `PLAN-${focusedEventId}`);
  const focusedPlan = focusedVersions.find((plan) => plan.version === activeVersion) ?? focusedLatestPlan;
  const visibleTrace = useMemo(() => (focusedEventId ? trace.filter((step) => step.eventId === focusedEventId) : []), [focusedEventId, trace]);

  const escalatedMeasures = currentPlans.flatMap((plan) => plan.measures.filter((measure) => measure.tier === '控制类' && measure.runState === '待确认' && confirmStatus(measure.shownAtMs, nowMs) === 'escalated'));
  useEffect(() => {
    escalatedMeasures.forEach((measure) => noteOverdueEscalation(measure.id, measure.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalatedMeasures.map((measure) => measure.id).join(','), noteOverdueEscalation]);

  const entries = useMemo<TimelineEntry[]>(() => {
    const result: TimelineEntry[] = visibleTrace.map((step, index) => ({ kind: 'trace', key: `trace-${step.id}`, index, step }));
    (focusedEvent?.progressReports ?? []).forEach((report) => result.push({ kind: 'progress', key: `progress-${report.id}`, index: result.length, report }));
    if (focusedPlan) {
      result.push({ kind: 'plan', key: `plan-${focusedPlan.id}-${focusedPlan.version}`, index: result.length, plan: focusedPlan });
      if (focusedPlan.candidates?.length) result.push({ kind: 'comparison', key: `comparison-${focusedPlan.id}-${focusedPlan.version}`, index: result.length, plan: focusedPlan });
      focusedPlan.measures.forEach((measure) => result.push({ kind: 'measure', key: `measure-${measure.id}`, index: result.length, plan: focusedPlan, measure }));
    }
    if (focusedEvent?.finalReport) result.push({ kind: 'report', key: `report-${focusedEventId}-${focusedEvent.finalReport.generatedSimSec}`, index: result.length, event: focusedEvent, report: focusedEvent.finalReport });
    return result;
  }, [focusedEvent, focusedEventId, focusedPlan, visibleTrace]);

  const records = useMemo<CalcRecord[]>(() => calcs.filter((record) => !record.eventId || record.eventId === focusedEventId), [calcs, focusedEventId]);

  return (
    <div data-testid="unified-timeline-queue" className="h-full min-h-0 flex flex-col bg-[var(--color-panel)]">
      <div className="h-[42px] shrink-0 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--color-ink)]">统一处置时序</span>
        <span className="text-[10px] text-[var(--color-ink-soft)]">推理 → 人工续报 → 管控预案 → 管控确认</span>
      </div>
      {escalatedMeasures.length > 0 && <div className="arco-alert arco-alert-error mx-2 mt-2 text-[10px]" role="alert">⚠ {escalatedMeasures.length} 项控制措施确认超时，已升级通知值班长</div>}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
        {!focusedEventId && <div className="grid h-full place-items-center text-xs text-[var(--color-ink-soft)]">请选择左侧事件，查看完整处置时序</div>}
        {focusedEventId && entries.length === 0 && <div className="grid h-full place-items-center text-xs text-[var(--color-ink-soft)]">事件正在生成推理轨迹和预案…</div>}
        {entries.length > 0 && (
          <ol className="relative">
            <span className="absolute bottom-5 left-[13px] top-4 w-px bg-[var(--color-line)]" aria-hidden="true" />
            {entries.map((entry) => entry.kind === 'trace'
              ? <TraceTimelineItem key={entry.key} step={entry.step} index={entry.index} onOpenDetail={setDetailStepId} />
              : entry.kind === 'plan'
                ? <PlanTimelineItem key={entry.key} plan={entry.plan} index={entry.index} versions={focusedVersions} activeVersion={activeVersion} onVersionChange={setActivePlanVersion} />
                : entry.kind === 'comparison'
                  ? <CandidateComparisonTimelineItem key={entry.key} plan={entry.plan} index={entry.index} />
                  : entry.kind === 'measure'
                  ? <MeasureTimelineItem key={entry.key} plan={entry.plan} measure={entry.measure} index={entry.index} nowMs={nowMs} decisionReady={!entry.plan.candidates?.length || Boolean(entry.plan.decisionConfirmedAt)} canConfirm={entry.plan.version === focusedLatestPlan?.version && (!entry.plan.candidates?.length || Boolean(entry.plan.decisionConfirmedAt))} />
                  : entry.kind === 'progress'
                    ? <ProgressReportTimelineItem key={entry.key} report={entry.report} index={entry.index} />
                    : <FinalReportTimelineItem key={entry.key} report={entry.report} index={entry.index} onOpen={() => setReportOpen(true)} />)}
          </ol>
        )}
      </div>
      {detailStepId && <DetailModal key={detailStepId} stepId={detailStepId} records={records} onClose={() => setDetailStepId(null)} />}
      {reportOpen && focusedEvent?.finalReport && <EventFinalReportModal event={focusedEvent} report={focusedEvent.finalReport} audit={audit} sceneBaseSec={sceneBaseSec} onClose={() => setReportOpen(false)} />}
      <ForcedInterruptModal />
    </div>
  );
}
