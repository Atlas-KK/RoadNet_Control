// ============================================================
// ReasoningPanel 推理轨迹（合并窗口）
// 窗口只展示「推理步骤」。用户点击某步的「查看图谱·计算」按钮，
// 弹窗展示该步走过的事理图谱推理路径 + 对应计算过程。
// ============================================================

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import GraphPanel from './GraphPanel';
import TracePanel from './TracePanel';
import { useStore } from './../store';
import { queueLength, queueTailKp } from '../engine/flowModel';
import type { CalcRecord } from '../engine/trace';
import { tracePathForStep } from '../engine/trace';
import { summarizeEventCalcs } from '../engine/calcSummary';
import { nodeById } from '../data/graphSchema';
import { usePanelFullscreen } from './FullscreenPanel';
import PanelFrame from './PanelFrame';

// 图表依赖体积较大，仅在用户打开详情弹窗时异步加载，缩小首屏代码包。
const CalcPanel = lazy(() => import('./CalcPanel'));

const PHASE_COLOR: Record<string, string> = {
  落图: 'var(--color-brand)',
  快照: 'var(--color-graph)',
  检索: 'var(--color-graph)',
  推演: 'var(--color-brand)',
  裁剪匹配: 'var(--color-pass)',
  撤销传导: 'var(--color-danger)',
};

const PROVIDER_LABEL: Record<string, string> = {
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  kimi: 'Kimi',
  custom: 'Custom',
};

function shortAiReason(reason: string): string {
  if (reason.length <= 72) return reason;
  return `${reason.slice(0, 71)}…`;
}

/**
 * 推理步骤详情弹窗：左侧展示本步高亮后的事理图谱，右侧展示关联计算过程。
 * 点击遮罩关闭；点击弹窗内容会阻止冒泡，避免误关闭。
 */
export function DetailModal({ stepId, records, onClose }: { stepId: string; records: CalcRecord[]; onClose: () => void }) {
  const step = useStore((s) => s.trace.find((t) => t.id === stepId));
  const event = useStore((s) => step ? s.events.find((item) => item.id === step.eventId) : undefined);
  const playback = useStore((s) => s.tracePlayback);
  const startTracePlayback = useStore((s) => s.startTracePlayback);
  const toggleTracePlayback = useStore((s) => s.toggleTracePlayback);
  const pauseTracePlayback = useStore((s) => s.pauseTracePlayback);
  const advanceTracePlayback = useStore((s) => s.advanceTracePlayback);
  const previousTraceNode = useStore((s) => s.previousTraceNode);
  const nextTraceNode = useStore((s) => s.nextTraceNode);
  const restartTracePlayback = useStore((s) => s.restartTracePlayback);
  const requestTraceExplanation = useStore((s) => s.requestTraceExplanation);
  const eventId = step?.eventId;

  useEffect(() => {
    if (!eventId) return;
    startTracePlayback(stepId);
    requestTraceExplanation(eventId);
    return () => pauseTracePlayback();
  }, [eventId, pauseTracePlayback, requestTraceExplanation, startTracePlayback, stepId]);

  useEffect(() => {
    if (playback.stepId !== stepId || playback.status !== 'playing') return;
    const timer = window.setInterval(advanceTracePlayback, 900);
    return () => window.clearInterval(timer);
  }, [advanceTracePlayback, playback.status, playback.stepId, stepId]);

  if (!step) return null;
  const stepCalcIds = step.calcs ?? [];
  const eventRecords = records.filter((r) => r.eventId === step.eventId);
  // 该步关联的计算记录（无则回退展示本次事件计算，避免跨事件串扰）
  const focused = eventRecords.filter((r) => stepCalcIds.includes(r.id));
  const shown = focused.length > 0 ? focused : eventRecords;
  const calcSummary = summarizeEventCalcs(eventRecords, step.eventId);
  const path = tracePathForStep(step);
  const currentPathIndex = Math.min(playback.nodeIndex, Math.max(0, path.length - 1));
  const currentPathNode = path[currentPathIndex];
  const pathLabel = (node: typeof currentPathNode) => node?.label ?? (node ? nodeById(node.id)?.label ?? node.id : '');
  const playbackLabel = playback.status === 'complete' ? '播放完成' : playback.status === 'paused' ? '已暂停' : '播放中';
  const calcInterpretation = step.aiCalcInterpretation;
  const comprehensiveConclusion = event?.aiTraceConclusion ?? step.aiComprehensiveConclusion;
  const comprehensiveStatus = event?.aiTraceStatus ?? step.aiComprehensiveStatus ?? step.aiStatus;
  const calcProvider = calcInterpretation ? `${PROVIDER_LABEL[calcInterpretation.provider] ?? 'AI'} · ${calcInterpretation.model}` : 'DeepSeek / Qwen / Kimi';
  const comprehensiveProvider = comprehensiveConclusion ? `${PROVIDER_LABEL[comprehensiveConclusion.provider] ?? 'AI'} · ${comprehensiveConclusion.model}` : 'DeepSeek / Qwen / Kimi';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div
        className="bg-[var(--color-panel)] rounded-xl shadow-2xl border border-[var(--color-line)] flex flex-col overflow-hidden"
        style={{ width: '86vw', height: '82vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗标题：所选推理步 */}
        <div className="px-4 py-3 border-b border-[var(--color-line)] bg-[var(--color-panel-2)] flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[11px] px-1.5 py-0.5 rounded text-white" style={{ background: PHASE_COLOR[step.phase] ?? 'var(--color-brand)' }}>
                {step.phase}
              </span>
              <span className="text-[11px] text-[var(--color-ink-soft)] font-formula">{step.specRef}</span>
            </div>
            <div className="text-sm font-semibold text-[var(--color-ink)]">{step.title}</div>
            <div className="mt-1 text-[11px] leading-snug text-[var(--color-ink-soft)]">规则推理结论：{step.conclusion}</div>
            {comprehensiveConclusion ? (
              <div className="mt-2 rounded border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-2 py-1.5 text-[11px] leading-snug text-[var(--color-brand-700)]">
                <div className="mb-0.5 flex items-center gap-2 font-semibold">
                  <span>{comprehensiveConclusion.title}</span>
                  <span className="text-[9px] font-normal text-[var(--color-ink-soft)]">{comprehensiveProvider}</span>
                </div>
                <div>{comprehensiveConclusion.summarySentence}</div>
                <div className="mt-1 text-[10px] text-[var(--color-ink)]">因果链说明：{comprehensiveConclusion.chainExplanation}</div>
                <div className="mt-1 text-[10px] text-[var(--color-ink)]">综合结论：{comprehensiveConclusion.integratedConclusion}</div>
                {comprehensiveConclusion.indicatorFindings.length > 0 && (
                  <div className="mt-1 grid gap-1">
                    {comprehensiveConclusion.indicatorFindings.slice(0, 5).map((item) => (
                      <div key={item.calcId} className="rounded border border-[var(--color-brand-100)] bg-white/40 px-1.5 py-1">
                        <span className="font-semibold">{item.metric}</span>
                        <span className="font-formula text-[var(--color-brand-700)]"> {item.value}</span>
                        <span className="text-[var(--color-ink-soft)]">：{item.plainMeaning}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-1 text-[10px] text-[var(--color-warn)]">处置含义：{comprehensiveConclusion.operatorImplication}</div>
                {comprehensiveConclusion.nodeStatements.length > 0 && (
                  <div className="mt-1 grid gap-1">
                    {comprehensiveConclusion.nodeStatements.slice(0, 4).map((node) => (
                      <div key={node.nodeId} className="rounded border border-[var(--color-brand-100)] bg-white/40 px-1.5 py-1">
                        <span className="font-semibold">{node.nodeLabel}</span>
                        <span className="text-[var(--color-ink-soft)]">（{node.roleInChain}）：</span>
                        <span className="text-[var(--color-ink)]">{node.plainLanguage}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">置信度：{comprehensiveConclusion.confidence}；{comprehensiveConclusion.uncertainty}</div>
              </div>
            ) : step.aiExplanation ? (
              <div className="mt-2 rounded border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-2 py-1.5 text-[11px] leading-snug text-[var(--color-brand-700)]">
                <div className="mb-0.5 font-semibold">因果顺成推演结论（兼容旧版）</div>
                <div>{step.aiExplanation.plainLanguage}</div>
                <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">推理依据：{step.aiExplanation.why}</div>
              </div>
            ) : comprehensiveStatus?.status === 'pending' ? (
              <div className="mt-2 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)]">正在后台生成图谱与交通流综合结论…</div>
            ) : comprehensiveStatus?.reason && (
              <div className="mt-2 rounded border border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-2 py-1.5 text-[11px] leading-snug text-[var(--color-brand-700)]">
                <div className="mb-0.5 flex items-center gap-2 font-semibold">
                  <span>因果顺成推演结论</span>
                  <span className="text-[9px] font-normal text-[var(--color-ink-soft)]">规则生成</span>
                </div>
                <div>
                  系统已沿当前高亮节点完成图谱推理，本步结论为“{step.conclusion}”。
                </div>
                <div className="mt-1 text-[10px] text-[var(--color-ink)]">
                  结论声明：该判断来自事理图谱链路，用于说明当前节点如何顺成推导，不替代右侧交通流计算指标判断。
                </div>
                <div className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
                  大模型未采用：{shortAiReason(comprehensiveStatus.reason)}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 ml-3 px-3 py-1 text-sm rounded border border-[var(--color-line)] text-[var(--color-ink)] hover:bg-[var(--color-panel)]"
          >
            ✕ 关闭
          </button>
        </div>
        {/* 弹窗主体：左图谱 + 右计算 */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-[3] min-w-0 border-r border-[var(--color-line)] flex flex-col">
            <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] bg-[var(--color-panel-2)] border-b border-[var(--color-line)]">
              事理图谱 · 推理路径（本步走过的边高亮）
            </div>
            {path.length > 0 && (
              <div className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2">
                <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--color-ink-soft)]">
                  <span>{playbackLabel} · 当前节点 {currentPathIndex + 1}/{path.length}</span>
                  <span className="font-semibold text-[var(--color-brand-700)]">{pathLabel(currentPathNode)}</span>
                </div>
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto pb-0.5">
                  {path.map((node, index) => (
                    <span key={`${node.id}-${index}`} className="flex shrink-0 items-center gap-1">
                      <span className={`rounded border px-1.5 py-0.5 text-[9px] ${index === currentPathIndex ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white' : index < currentPathIndex ? 'border-[var(--color-pass)] bg-[var(--color-pass-50)] text-[var(--color-pass)]' : 'border-[var(--color-line)] text-[var(--color-ink-soft)]'}`}>
                        {pathLabel(node)}
                      </span>
                      {index < path.length - 1 && <span className="text-[var(--color-ink-soft)]">→</span>}
                    </span>
                  ))}
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <button type="button" onClick={previousTraceNode} disabled={currentPathIndex <= 0} className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40">上一步</button>
                  <button type="button" onClick={toggleTracePlayback} className="rounded bg-[var(--color-brand)] px-2.5 py-0.5 text-[10px] font-semibold text-white">
                    {playback.status === 'playing' ? '暂停' : playback.status === 'complete' ? '播放' : '继续播放'}
                  </button>
                  <button type="button" onClick={nextTraceNode} disabled={currentPathIndex >= path.length - 1} className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-40">下一步</button>
                  <button type="button" onClick={restartTracePlayback} className="ml-auto rounded border border-[var(--color-line)] px-2 py-0.5 text-[10px] text-[var(--color-ink-soft)]">重新播放</button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <GraphPanel embedded />
            </div>
          </div>
          <div className="flex-[2] min-w-0 flex flex-col">
            <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] bg-[var(--color-panel-2)] border-b border-[var(--color-line)]">
              计算过程 · {step.eventId}{focused.length > 0 ? `（本步 ${focused.length} 条）` : ''} · 交通流计算综合解读
            </div>
            <div className="shrink-0 border-b border-[var(--color-brand-100)] bg-[var(--color-brand-50)] px-3 py-2 text-[11px] leading-snug">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold text-[var(--color-brand-700)]">交通流计算综合解读</span>
                <span className="rounded border border-[var(--color-brand-100)] bg-white/60 px-1.5 py-0.5 text-[9px] text-[var(--color-ink-soft)]">
                  {calcProvider}
                </span>
              </div>
              {comprehensiveConclusion ? (
                <div className="text-[var(--color-ink-soft)]">本次事件的图谱推理与交通流指标已合并为上方一条综合结论；下方保留公式、代入值和结果作为可追溯依据。</div>
              ) : calcInterpretation ? (
                <div className="space-y-1">
                  <div className="text-[var(--color-ink)]">{calcInterpretation.summarySentence}</div>
                  <div className="grid gap-1">
                    {calcInterpretation.indicatorFindings.slice(0, 5).map((item) => (
                      <div key={item.calcId} className="rounded border border-[var(--color-brand-100)] bg-white/40 px-1.5 py-1">
                        <span className="font-semibold">{item.metric}</span>
                        <span className="font-formula text-[var(--color-brand-700)]"> {item.value}</span>
                        <span className="text-[var(--color-ink-soft)]">：{item.plainMeaning}</span>
                      </div>
                    ))}
                  </div>
                  <div className="text-[10px] text-[var(--color-ink)]">综合结论：{calcInterpretation.integratedConclusion}</div>
                  <div className="text-[10px] text-[var(--color-warn)]">处置含义：{calcInterpretation.operatorImplication}</div>
                  <div className="text-[10px] text-[var(--color-ink-soft)]">{calcInterpretation.uncertainty}</div>
                </div>
              ) : calcSummary ? (
                <div className="space-y-1">
                  <div className="text-[var(--color-ink)]">{calcSummary.text}</div>
                  <div className="text-[10px] text-[var(--color-ink-soft)]">规则兜底：大模型未采用时，仍只基于当前事件计算记录生成交通流结论。</div>
                </div>
              ) : comprehensiveStatus?.status === 'pending' ? (
                <div className="text-[var(--color-ink-soft)]">正在后台生成图谱与交通流综合结论，公式和规则结果已可查看。</div>
              ) : comprehensiveStatus?.reason ? (
                <div className="text-[var(--color-ink-soft)]">综合结论未生成：{comprehensiveStatus.reason}</div>
              ) : (
                <div className="text-[var(--color-ink-soft)]">打开详情后会自动尝试生成交通流计算综合解读；未配置 API Key 时显示规则兜底结论。</div>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <Suspense fallback={<div className="h-full grid place-items-center text-xs text-[var(--color-ink-soft)]">正在加载计算过程…</div>}>
                <CalcPanel records={shown} highlightIds={stepCalcIds} embedded />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 推理轨迹主面板，负责组合步骤列表、实时计算记录和按需详情弹窗。 */
export default function ReasoningPanel({ embedded = false }: { embedded?: boolean }) {
  const fullscreen = usePanelFullscreen('reasoning-panel', '推理轨迹');
  const [detailStepId, setDetailStepId] = useState<string | null>(null);
  const events = useStore((s) => s.events);
  const simSec = useStore((s) => s.simSec);
  const staticCalcs = useStore((s) => s.calcs);

  // 固定计算记录来自统一事件接入；排队长度记录随模拟时钟动态追加并覆盖实时态势。
  const records = useMemo<CalcRecord[]>(() => {
    const list = [...staticCalcs];
    for (const ev of events) {
      if (ev.finalized || !ev.congested) continue;
      const elapsedMin = Math.max(0, (simSec - ev.startSimSec) / 60);
      const len = queueLength(ev.w, elapsedMin);
      const tail = queueTailKp(ev.accidentKp, ev.w, elapsedMin);
      list.push({
        id: `C-${ev.id}-05`,
        eventId: ev.id,
        label: `${ev.id} 排队长度 L(t) / 队尾桩号（随时钟）`,
        formula: 'L(t) = w × t ；队尾 = 事故点 − L(t)',
        substitution: `= ${ev.w.toFixed(1)} × ${elapsedMin.toFixed(1)}min ÷ 60 = ${len.toFixed(2)} km`,
        result: `队尾 = K${tail.toFixed(1)}（已回溯 ${len.toFixed(2)} km）`,
        conclusion: `从事件发生至今，排队已向上游回溯约 ${len.toFixed(2)} 公里，当前队尾位于 K${tail.toFixed(1)}。`,
        conclusionTone: 'warning',
        summaryRole: 'queueLength',
        summaryValue: `已回溯 ${len.toFixed(2)} km，当前队尾 K${tail.toFixed(1)}`,
        badges: [
          { text: 'w', from: '本面板#4' },
          { text: 't', from: '模拟时钟' },
        ],
      });
    }
    return list;
  }, [events, simSec, staticCalcs]);

  const bodyContent = (
    <>
      <div className="flex-1 min-h-0">
        <TracePanel embedded onOpenDetail={setDetailStepId} />
      </div>
      {detailStepId && <DetailModal key={detailStepId} stepId={detailStepId} records={records} onClose={() => setDetailStepId(null)} />}
    </>
  );

  if (embedded) {
    return (
      <div data-testid="reasoning-panel" className="h-full min-h-0 flex flex-col">
        {bodyContent}
      </div>
    );
  }

  return (
    <PanelFrame
      testId="reasoning-panel"
      fullscreen={fullscreen}
      headerClassName="h-[42px]"
      title={<span className="text-sm font-semibold text-[var(--color-ink)] flex items-center gap-2"><span className="text-[var(--color-brand-700)]">◫</span> 推理轨迹</span>}
      headerActions={<span className="text-[10px] font-normal text-[var(--color-ink-soft)]">点「查看图谱·计算」弹窗看推理路径与计算</span>}
    >
      {bodyContent}
    </PanelFrame>
  );
}
