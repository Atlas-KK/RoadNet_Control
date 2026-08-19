// ============================================================
// TodoQueue 统一待办队列（开发规格 §6.2 / §7.1）
// 控制类 → 「确认下发」，确认后展示确认耗时；
// 预测预警类 → 「一键确认」（视觉更轻）；
// 实况类 → 灰色留痕条目标注「自动+审计」；
// 待办按风险优先级排序；控制类条目带「目标 ≤3min」标签。
// 强制升级打断：store.forcedInterrupt 命中时以全屏模态弹出（S3 用）。
// ============================================================

import { useEffect, useState } from 'react';
import { useStore } from '../store';
import type { PlanMeasure } from '../domain/plan';
import { TIER_META } from '../engine/review';
import { confirmRemainingSec, confirmStatus } from '../engine/confirmTiming';
import { buildTriageRows, sortTriage } from '../engine/triage';
import { usePanelFullscreen } from './FullscreenPanel';
import PanelFrame from './PanelFrame';

const TIER_RISK: Record<string, number> = { 控制类: 0, 预测预警类: 1, 实况类: 2 };

/**
 * 单条待办卡片。
 * planId、version、measureId 会完整传回 store，确保确认操作不会误命中历史版本。
 * runtime 模式下控制类展示确认倒计时与超时/升级态（FR-E2），并可打回（FR-E3）。
 */
function TodoRow({ planId, version, m, runtime, nowMs, decisionReady }: { planId: string; version: number; m: PlanMeasure; runtime: boolean; nowMs: number; decisionReady: boolean }) {
  const confirmMeasure = useStore((s) => s.confirmMeasure);
  const rejectMeasure = useStore((s) => s.rejectMeasure);
  const tier = TIER_META[m.tier];
  const done = m.runState === '已下发';
  const timing = runtime && decisionReady && !done && m.tier !== '实况类' ? confirmStatus(m.shownAtMs, nowMs) : null;

  // 实况类：灰色留痕
  if (m.tier === '实况类') {
    return (
      <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-1.5 mb-1.5 opacity-70">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-ink-soft)] text-white">实况类</span>
          <span className="text-xs text-[var(--color-ink)]">{m.title}</span>
          <span className="text-[9px] text-[var(--color-ink-soft)] ml-auto">自动+审计</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-md border px-2.5 py-2 mb-1.5 transition-colors ${
        done ? 'border-[var(--color-line)] bg-[var(--color-panel-2)] opacity-75' : 'border-[var(--color-line)] bg-[#0b1d31] hover:border-[#315372]'
      }`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[9px] px-1.5 py-0.5 rounded text-white" style={{ background: tier.color }}>
          {m.tier}
        </span>
        {m.tier === '控制类' && !timing && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-warn-50)] text-[var(--color-warn)] border border-[var(--color-warn-100)]">
            目标 ≤3min
          </span>
        )}
        {timing && (
          <span
            className={`text-[9px] px-1 py-0.5 rounded border ${
              timing === 'escalated'
                ? 'bg-[var(--color-danger-50)] text-[var(--color-danger)] border-[var(--color-danger)]'
                : timing === 'overdue'
                  ? 'bg-[var(--color-warn-50)] text-[var(--color-warn)] border-[var(--color-warn-100)]'
                  : 'bg-[var(--color-panel-2)] text-[var(--color-ink-soft)] border-[var(--color-line)]'
            }`}
          >
            {timing === 'escalated' ? '已升级·超时' : timing === 'overdue' ? '已超时' : `剩 ${Math.max(0, Math.round(confirmRemainingSec(m.shownAtMs, nowMs)))}s`}
          </span>
        )}
        <span className="text-xs font-semibold text-[var(--color-ink)]">{m.title}</span>
        {done ? (
          <span className="text-[9px] text-[var(--color-pass)] ml-auto">
            已下发 · 确认耗时 {((m.confirmMs ?? 0) / 1000).toFixed(1)}s
          </span>
        ) : !decisionReady ? (
          <span className="ml-auto text-[9px] text-[var(--color-ink-soft)]">请先在智能处置时序中确认方案</span>
        ) : (
          <div className="ml-auto flex items-center gap-1">
            {runtime && (
              <button
                type="button"
                onClick={() => { const r = prompt('打回理由（现场反馈不符/方案有误）'); if (r) rejectMeasure(planId, version, m.id, r); }}
                className="px-2 py-1 text-[10px] rounded border border-[var(--color-line)] text-[var(--color-ink-soft)]"
              >
                打回
              </button>
            )}
            <button
              type="button"
              onClick={() => confirmMeasure(planId, version, m.id)}
              className="px-2.5 py-1 text-xs rounded text-white font-medium transition-colors"
              style={{ background: tier.color }}
            >
              {tier.confirmLabel}
            </button>
          </div>
        )}
      </div>
      <div className="text-[10px] text-[var(--color-ink-soft)] mt-0.5">{m.summary}</div>
      {m.rejectReason && <div className="text-[10px] text-[var(--color-danger)] mt-0.5">已打回：{m.rejectReason}</div>}
    </div>
  );
}

/**
 * 强制升级打断全屏模态（§6.2 / S3）。
 * “稍后”仅关闭弹窗，不改变措施状态；“确认下发”先精确确认措施，再解除打断。
 */
function ForcedInterruptModal() {
  const forcedId = useStore((s) => s.forcedInterrupt);
  const setForcedInterrupt = useStore((s) => s.setForcedInterrupt);
  const plans = useStore((s) => s.plans);
  const confirmMeasure = useStore((s) => s.confirmMeasure);
  if (!forcedId) return null;
  const plan = plans.find((candidate) => candidate.measures.some((measure) => measure.id === forcedId));
  const m = plan?.measures.find((x) => x.id === forcedId);
  if (!plan || !m) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[var(--color-panel)] rounded-xl shadow-2xl border-2 border-[var(--color-danger)] p-6 max-w-md">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-2xl">⚠</span>
          <span className="text-lg font-bold text-[var(--color-danger)]">强制升级打断 · 高危事项</span>
        </div>
        <div className="text-sm text-[var(--color-ink)] mb-1">{m.title}</div>
        <div className="text-xs text-[var(--color-ink-soft)] mb-4">{m.summary}</div>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={() => setForcedInterrupt(null)}
            className="px-3 py-1.5 text-sm rounded border border-[var(--color-line)] text-[var(--color-ink)]"
          >
            稍后
          </button>
          <button
            type="button"
            onClick={() => {
              confirmMeasure(plan.id, plan.version, m.id);
              setForcedInterrupt(null);
            }}
            className="px-4 py-1.5 text-sm rounded bg-[var(--color-danger)] text-white font-medium"
          >
            确认下发
          </button>
        </div>
      </div>
    </div>
  );
}

/** 展示最新有效预案的统一待办，并按“未确认优先、风险优先”排序。 */
export default function TodoQueue({ embedded = false }: { embedded?: boolean }) {
  const fullscreen = usePanelFullscreen('todo-queue', '统一待办队列');
  const plans = useStore((s) => s.plans);
  const events = useStore((s) => s.events);
  const focusedEventId = useStore((s) => s.focusedEventId);
  const focusEvent = useStore((s) => s.focusEvent);
  const simSec = useStore((s) => s.simSec);
  const noteOverdueEscalation = useStore((s) => s.noteOverdueEscalation);
  // 运行模式下每秒刷新，驱动确认倒计时与超时态。
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const validPlans = plans.filter((candidate) => !['已被替换', '已完成', '已作废'].includes(candidate.state));
  const latestPlans = Array.from(
    validPlans.reduce((groups, candidate) => {
      const current = groups.get(candidate.id);
      if (!current || candidate.version > current.version) groups.set(candidate.id, candidate);
      return groups;
    }, new Map<string, typeof plans[number]>()),
  ).map(([, candidate]) => candidate);
  // 控制类持续超时（≥6min）→ 升级 + 最小安全动作留痕（每措施一次）。
  const escalatedMeasures = latestPlans.flatMap((candidate) => candidate.decisionConfirmedAt || !candidate.candidates?.length
    ? candidate.measures.filter((m) => m.tier === '控制类' && m.runState === '待确认' && confirmStatus(m.shownAtMs, nowMs) === 'escalated')
    : []);
  useEffect(() => {
    escalatedMeasures.forEach((m) => noteOverdueEscalation(m.id, m.title));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalatedMeasures.map((m) => m.id).join(','), noteOverdueEscalation]);

  const runtimeGroups = sortTriage(buildTriageRows(latestPlans.map((candidate) => {
    const eventId = candidate.id.replace('PLAN-', '');
    const event = events.find((item) => item.id === eventId);
    return event ? {
      event,
      pendingShownAtMs: candidate.measures.filter((m) => m.runState === '待确认').map((m) => m.shownAtMs),
      simSec,
    } : null;
  }).filter((input): input is NonNullable<typeof input> => input !== null), nowMs));
  const orderedRuntimePlans = runtimeGroups
    .map((row) => latestPlans.find((candidate) => candidate.id === `PLAN-${row.eventId}`))
    .filter((candidate): candidate is typeof plans[number] => candidate != null)
    .sort((a, b) => Number(b.id === `PLAN-${focusedEventId}`) - Number(a.id === `PLAN-${focusedEventId}`));
  const runtimePendingCount = orderedRuntimePlans.reduce(
    (total, candidate) => total + candidate.measures.filter((m) => m.runState === '待确认' && m.tier !== '实况类').length,
    0,
  );

  const queueTitle = <span className="text-sm font-semibold text-[var(--color-ink)] flex items-center gap-2"><span className="text-[var(--color-brand-700)]">◉</span> 统一待办队列</span>;
  const queueActions = <span className="text-[10px] font-normal text-[var(--color-ink-soft)]">待确认 {runtimePendingCount} 项 · 按风险排序</span>;
  const queueBody = (
    <div className="flex-1 min-h-0 overflow-y-auto p-2">
        {escalatedMeasures.length > 0 && (
          <div className="mb-1.5 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-50)] px-2.5 py-1.5 text-[11px] text-[var(--color-danger)]">
            ⚠ {escalatedMeasures.length} 项控制类措施确认超时 → 已升级通知值班长；已执行最小安全动作集（仅实况类自动执行，控制类维持待确认）
          </div>
        )}
        {orderedRuntimePlans.map((candidate) => {
          const eventId = candidate.id.replace('PLAN-', '');
          const focused = eventId === focusedEventId;
          const groupItems = [...candidate.measures].sort((a, b) => {
            const ad = a.runState === '待确认' ? 0 : 1;
            const bd = b.runState === '待确认' ? 0 : 1;
            return ad - bd || (TIER_RISK[a.tier] ?? 9) - (TIER_RISK[b.tier] ?? 9);
          });
          const groupPending = groupItems.filter((m) => m.runState === '待确认' && m.tier !== '实况类').length;
          const overdue = groupItems.some((m) => m.runState === '待确认' && confirmStatus(m.shownAtMs, nowMs) !== 'ontime');
          return focused ? (
            <div key={candidate.id}>{groupItems.map((m) => <TodoRow key={m.id} planId={candidate.id} version={candidate.version} m={m} runtime nowMs={nowMs} decisionReady={Boolean(candidate.decisionConfirmedAt) || !candidate.candidates?.length} />)}</div>
          ) : (
            <button
              key={candidate.id}
              type="button"
              data-testid={`todo-group-${eventId}`}
              onClick={() => focusEvent(eventId)}
              className="w-full mb-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2 text-left text-xs text-[var(--color-ink)] hover:border-[#315372]"
            >
              {eventId} · 待确认 {groupPending} 项{overdue ? ' · ⚠已超时' : ''}
            </button>
          );
        })}
    </div>
  );

  if (embedded) {
    return (
      <div data-testid="todo-queue" className="h-full min-h-0 flex flex-col bg-[var(--color-panel)]">
        <header className="h-[42px] shrink-0 px-3 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] flex items-center justify-between">
          <div className="min-w-0">{queueTitle}</div>
          <div className="shrink-0">{queueActions}</div>
        </header>
        {queueBody}
        <ForcedInterruptModal />
      </div>
    );
  }

  return (
    <PanelFrame
      testId="todo-queue"
      fullscreen={fullscreen}
      title={queueTitle}
      headerActions={queueActions}
    >
      {queueBody}
      <ForcedInterruptModal />
    </PanelFrame>
  );
}
