// ============================================================
// TracePanel 推理轨迹面板（开发规格 §5.2 / §7.4）
// 步骤按 phase 分组；specRef 显示为角标（demo 与方案逐条对应的关键元素）。
// 点击 TraceStep → store.selectStep 驱动图谱、计算和 GIS 三端联动。
// ============================================================

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { TraceStep } from '../engine/trace';

const PHASE_ORDER: TraceStep['phase'][] = ['落图', '快照', '检索', '推演', '裁剪匹配', '撤销传导'];

const PHASE_COLOR: Record<TraceStep['phase'], string> = {
  落图: 'var(--color-brand)',
  快照: 'var(--color-graph)',
  检索: 'var(--color-graph)',
  推演: 'var(--color-brand)',
  裁剪匹配: 'var(--color-pass)',
  撤销传导: 'var(--color-danger)',
};

function StepCard({ step, onOpenDetail }: { step: TraceStep; onOpenDetail?: (id: string) => void }) {
  const activeStepId = useStore((s) => s.activeStepId);
  const selectStep = useStore((s) => s.selectStep);
  const active = activeStepId === step.id;
  const hasDetail = (step.edges && step.edges.length > 0) || (step.calcs && step.calcs.length > 0);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => selectStep(step.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectStep(step.id); }}
      className={`w-full text-left rounded-md border px-2.5 py-2 mb-1.5 transition-colors cursor-pointer ${
        active
          ? 'border-[var(--color-brand)] bg-[var(--color-brand-50)] ring-1 ring-[var(--color-brand)]'
          : 'border-[var(--color-line)] bg-[var(--color-panel)] hover:bg-[var(--color-panel-2)]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="flex items-center gap-1">
          <span
            className="text-[10px] px-1.5 py-0.5 rounded text-white"
            style={{ background: PHASE_COLOR[step.phase] }}
          >
            {step.phase}
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-panel-2)] text-[var(--color-ink-soft)]">{step.eventId}</span>
        </span>
        <span className="text-[10px] text-[var(--color-ink-soft)] font-formula">{step.specRef}</span>
      </div>
      <div className="text-xs text-[var(--color-ink)] leading-snug">{step.title}</div>
      {/* 数据来源徽章 + 详情按钮 */}
      <div className="flex flex-wrap items-center gap-1 mt-1.5">
        {step.dataSources.map((d, i) => (
          <span
            key={i}
            className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel-2)] text-[var(--color-ink-soft)] border border-[var(--color-line)]"
          >
            {d}
          </span>
        ))}
        {step.calcs && step.calcs.length > 0 && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            {step.calcs.length} 条计算
          </span>
        )}
        {(step.aiComprehensiveStatus?.status === 'pending' || step.aiGraphStatus?.status === 'pending' || step.aiCalcStatus?.status === 'pending' || step.aiStatus?.status === 'pending') && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel-2)] text-[var(--color-ink-soft)] border border-[var(--color-line)]">
            AI生成中
          </span>
        )}
        {step.aiComprehensiveConclusion && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-pass-50)] text-[var(--color-pass)]">
            图谱结论
          </span>
        )}
        {step.aiCalcInterpretation && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">
            计算解读
          </span>
        )}
        {onOpenDetail && hasDetail && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); selectStep(step.id); onOpenDetail(step.id); }}
            className="ml-auto text-[10px] px-2 py-0.5 rounded bg-[var(--color-brand)] text-white font-medium hover:bg-[var(--color-brand-700)]"
          >
            查看图谱·计算 ▤
          </button>
        )}
      </div>
    </div>
  );
}

export default function TracePanel({ embedded = false, onOpenDetail }: { embedded?: boolean; onOpenDetail?: (id: string) => void }) {
  const [collapsed, setCollapsed] = useState<Set<TraceStep['phase']>>(() => new Set());
  const trace = useStore((s) => s.trace);
  const activeStepId = useStore((s) => s.activeStepId);
  const selectStep = useStore((s) => s.selectStep);
  const mergeInfo = useStore((s) => s.mergeInfo);
  const focusedEventId = useStore((s) => s.focusedEventId);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // 聚焦新事件时恢复“仅看当前事件”，避免沿用上一事件的全量轨迹开关。
    // oxlint-disable-next-line react/set-state-in-effect
    setShowAll(false);
  }, [focusedEventId]);

  const visibleTrace = focusedEventId && !showAll
    ? trace.filter((step) => step.eventId === focusedEventId)
    : trace;

  const byPhase = PHASE_ORDER.map((ph) => ({
    phase: ph,
    steps: visibleTrace.filter((t) => t.phase === ph),
  })).filter((g) => g.steps.length > 0);

  return (
    <div className={embedded ? 'h-full flex flex-col bg-[var(--color-panel-2)] overflow-hidden' : 'h-full flex flex-col bg-[var(--color-panel-2)] rounded-lg border border-[var(--color-line)] overflow-hidden'}>
      <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] border-b border-[var(--color-line)] bg-[var(--color-panel)] flex items-center justify-between">
        <span>推理轨迹 · 步骤</span>
        <span className="flex items-center gap-2">
          {focusedEventId && (
            <span
              data-testid="trace-filter-toggle"
              className="inline-flex overflow-hidden rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[10px] font-normal"
            >
              <button
                type="button"
                onClick={() => setShowAll(false)}
                className={`px-2 py-0.5 transition-colors ${
                  !showAll
                    ? 'bg-[var(--color-brand)] text-white'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-brand-700)]'
                }`}
              >
                只看当前
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className={`px-2 py-0.5 transition-colors ${
                  showAll
                    ? 'bg-[var(--color-brand)] text-white'
                    : 'text-[var(--color-ink-soft)] hover:text-[var(--color-brand-700)]'
                }`}
              >
                全部事件
              </button>
            </span>
          )}
          {activeStepId && <button type="button" onClick={() => selectStep(null)} className="text-[10px] font-normal text-[var(--color-brand-700)] hover:underline">清除高亮</button>}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {/* 双源归并得分明细（§8 S0 / 方案 2.6） */}
        {mergeInfo && (
          <div className="rounded-md border border-[var(--color-graph)] bg-[var(--color-graph-50)] px-2.5 py-2 mb-2">
            <div className="text-xs font-semibold text-[var(--color-graph)] mb-1">
              事件归并 · 匹配得分明细
            </div>
            <div className="text-[10px] text-[var(--color-ink-soft)] mb-1">
              {mergeInfo.sources.join(' + ')} → {mergeInfo.targetId}
            </div>
            <table className="w-full text-[10px] border-collapse">
              <tbody>
                {mergeInfo.scoreRows.map((r, i) => (
                  <tr key={i} className="border-t border-[var(--color-graph-100)]">
                    <td className="py-0.5 pr-2 text-[var(--color-ink)]">{r.dim}</td>
                    <td className="py-0.5 pr-2 text-[var(--color-ink-soft)]">{r.detail}</td>
                    <td className="py-0.5 text-right font-formula text-[var(--color-graph)]">{r.score.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="border-t border-[var(--color-graph)]">
                  <td className="py-0.5 pr-2 font-semibold text-[var(--color-ink)]">综合</td>
                  <td className="py-0.5 pr-2 text-[var(--color-pass)]">{mergeInfo.decision}</td>
                  <td className="py-0.5 text-right font-formula font-bold text-[var(--color-graph)]">{mergeInfo.total.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {visibleTrace.length === 0 && !mergeInfo && (
          <div className="text-xs text-[var(--color-ink-soft)] p-2">
            请先上报事件或从顶部加载演示案例，推理轨迹会随接入生成
          </div>
        )}
        {byPhase.map((g) => (
          <div key={g.phase} className="mb-1">
            <button
              type="button"
              onClick={() =>
                setCollapsed((old) => {
                  const next = new Set(old);
                  if (next.has(g.phase)) next.delete(g.phase);
                  else next.add(g.phase);
                  return next;
                })
              }
              className="mb-1 flex w-full items-center justify-between rounded px-1.5 py-1 text-[10px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-panel)]"
            >
              <span>{collapsed.has(g.phase) ? '▸' : '▾'} {g.phase}</span>
              <span>{g.steps.length} 步</span>
            </button>
            {!collapsed.has(g.phase) && g.steps.map((s) => (
              <StepCard key={s.id} step={s} onOpenDetail={onOpenDetail} />
            ))}
          </div>
        ))}
        <div className="text-[10px] text-[var(--color-ink-soft)] mt-1 px-1">
          点击任一步高亮路网元素；点「查看图谱·计算」弹窗展示该步走过的图谱路径与计算过程
        </div>
      </div>
    </div>
  );
}
