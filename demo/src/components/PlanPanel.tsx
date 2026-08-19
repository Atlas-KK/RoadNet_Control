// ============================================================
// PlanPanel 预案与版本面板（开发规格 §6.3 / §7.4）
// 版本 Tab（V1/V2/V3…）；措施清单含三档标记、参数、来源指针 hover、
// 依据链接（点击跳 Trace）、置信标注；版本 diff 三色渲染；顶部 StateMachineMini。
// 底部固定标注「文案由模板引擎兜底，配置 LLM 后增强…」。
// ============================================================

import { useStore } from '../store';
import type { Plan, PlanMeasure } from '../domain/plan';
import { TIER_META } from '../engine/review';
import { DIFF_STYLE } from '../engine/stateMachine';
import StateMachineMini from './StateMachineMini';
import { etaMinTo, RESOURCES, resourceById, type Resource } from '../data/resources';
import { tunnelAt, type RoadId } from '../data/network';
import { assessSeverity, SEVERITY_META } from '../engine/severity';
import { resolveResourceChain } from '../engine/resourceChain';
import { usePanelFullscreen } from './FullscreenPanel';
import PanelFrame from './PanelFrame';

const RESOURCE_STATUS = {
  idle: { label: '可用', color: 'var(--color-pass)' },
  enroute: { label: '在途', color: 'var(--color-brand-700)' },
  working: { label: '作业中', color: 'var(--color-warn)' },
} as const;

/** 将措施参数渲染为紧凑标签，并通过 title 暴露数据来源、备注和公式引用。 */
function SourceParamHover({ params }: { params: PlanMeasure['params'] }) {
  if (!params) return null;
  const keys = Object.keys(params);
  if (keys.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {keys.map((k) => {
        const sp = params[k];
        return (
          <span
            key={k}
            title={`来源：${sp.source}${sp.note ? '（' + sp.note + '）' : ''}${sp.formulaRef ? ' · ' + sp.formulaRef : ''}`}
            className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-panel-2)] text-[var(--color-ink-soft)] border border-[var(--color-line)] cursor-help"
          >
            {k}: {String(sp.value)}
          </span>
        );
      })}
    </div>
  );
}

function AiNarrativeBlock({ plan }: { plan: Plan }) {
  if (plan.aiNarrative) {
    return (
      <div className="mb-2 rounded-md border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-[var(--color-brand-700)]">Qwen 文案增强</span>
          <span className="text-[9px] text-[var(--color-ink-soft)]">{plan.aiNarrative.model}</span>
        </div>
        <div className="text-[11px] text-[var(--color-ink)] leading-relaxed">{plan.aiNarrative.summary}</div>
        {plan.aiNarrative.measureNotes.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {plan.aiNarrative.measureNotes.map((note) => (
              <div key={`${note.measureId}-${note.note}`} className="text-[10px] text-[var(--color-ink-soft)]">
                <span className="text-[var(--color-brand-700)]">{note.measureId}</span>：{note.note}
              </div>
            ))}
          </div>
        )}
        {plan.aiNarrative.riskNote && <div className="mt-1.5 text-[10px] text-[var(--color-warn)]">风险提示：{plan.aiNarrative.riskNote}</div>}
      </div>
    );
  }
  if (plan.aiStatus?.status === 'pending') {
    return <div className="mb-2 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)]">Qwen 正在生成文案...</div>;
  }
  if (plan.aiStatus?.status === 'rejected' || plan.aiStatus?.status === 'unavailable') {
    return <div className="mb-2 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)]">Qwen 文案未采用：{plan.aiStatus.reason}</div>;
  }
  return null;
}

/**
 * 清障措施的四步执行指引。
 *
 * 同时区分三个容易混淆的概念：
 * - nearest：空间距离最近的车辆，可能正在被其他事件占用；
 * - nearestAvailable：当前可立即调派且预计到达最快的车辆；
 * - assignedCandidate：预案实际指派车辆，用于联系人和调度指令展示。
 *
 * 该组件仅对清障车措施渲染，其他资源措施沿用普通措施卡片。
 */
function ResourceDispatchGuide({ m, targetKp, targetRoad }: { m: PlanMeasure; targetKp?: number; targetRoad?: RoadId }) {
  const occupancy = useStore((s) => s.resourceOccupancy);
  const events = useStore((s) => s.events);
  const assigned = m.resource ? resourceById(m.resource.id) : undefined;
  if (!assigned || assigned.kind !== 'wrecker') return null;

  const destinationKp = targetKp ?? assigned.homeKp;
  // 被占用车辆以占用事件桩号作为当前位置；否则依次使用运行位置和驻点位置。
  const getPosition = (resource: Resource) => {
    const occupiedEvent = occupancy[resource.id]
      ? events.find((event) => event.id === occupancy[resource.id])
      : undefined;
    return occupiedEvent?.accidentKp ?? resource.currentKp ?? resource.homeKp;
  };
  // 候选表先按空间距离排序；距离相同时以 ETA 更短者优先。
  // 运行模式经 resolveResourceChain 取候选——该函数已按同路（或跨辖区）过滤，避免把 G65S 南段车辆当作 G65 事件的
  // “最近车辆”推荐（桩号数值相邻但物理上互不可达，见 engine/resourceChain.ts 头注）。
  const candidates = targetRoad
    ? resolveResourceChain({ resources: RESOURCES, occupancy, events, targetKp: destinationKp, targetRoad })
        .candidates.map((c) => {
          const positionKp = getPosition(c.resource);
          return {
            resource: c.resource,
            occupiedBy: c.occupiedByEventId,
            positionKp,
            available: c.mode !== 'waitRelease',
            etaMin: c.etaMin,
            distanceKm: Math.abs(destinationKp - positionKp),
          };
        })
        // resolveResourceChain 按 ETA 排序，此处重排为距离优先，保持下方“距离最近”
        // 标签与 candidates[0] 的语义在两种模式下一致。
        .sort((a, b) => a.distanceKm - b.distanceKm || a.etaMin - b.etaMin)
    : RESOURCES.filter((resource) => resource.kind === 'wrecker')
        .map((resource) => {
          const occupiedBy = occupancy[resource.id];
          const positionKp = getPosition(resource);
          const available = !occupiedBy && resource.status === 'idle';
          return {
            resource,
            occupiedBy,
            positionKp,
            available,
            etaMin: Math.round(etaMinTo(resource, destinationKp, positionKp, targetRoad)),
            distanceKm: Math.abs(destinationKp - positionKp),
          };
        })
        .sort((a, b) => a.distanceKm - b.distanceKm || a.etaMin - b.etaMin);
  // 分别保留“最近”“最快可用”“预案指派”三种选择，避免用可用性覆盖事实距离。
  const nearest = candidates[0];
  const nearestAvailable = [...candidates].filter((item) => item.available).sort((a, b) => a.etaMin - b.etaMin)[0];
  const assignedCandidate = candidates.find((item) => item.resource.id === assigned.id) ?? nearest;
  const dispatchState = m.runState === '已下发' ? '已下发' : '待确认';
  const nearestStatus = nearest.occupiedBy
    ? { label: `作业中 · ${nearest.occupiedBy}`, color: 'var(--color-danger)', bg: 'var(--color-danger-50)' }
    : { label: '可用', color: 'var(--color-pass)', bg: 'var(--color-pass-50)' };

  return (
    <div className="mt-2 rounded-md border border-[#2b4d68] bg-[#071827] overflow-hidden">
      <div className="px-2 py-1.5 flex items-center justify-between border-b border-[#213d55] bg-[#0b2135]">
        <span className="text-[10px] font-semibold text-[var(--color-ink)]">清障资源调度 · 操作指引</span>
        <span className="text-[9px] text-[var(--color-pass)]">资源位置与状态已核验</span>
      </div>

      <div className="p-2 space-y-2">
        <div className="flex gap-2">
          <span className="step-index">1</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-[var(--color-ink)] mb-1">核验最近车辆与可用状态</div>
            <div className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-brand-50)] text-[var(--color-brand-700)]">距离最近</span>
                <span className="text-[11px] font-semibold text-[var(--color-ink)]">{nearest.resource.label}</span>
                <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded border" style={{ color: nearestStatus.color, borderColor: nearestStatus.color, background: nearestStatus.bg }}>● {nearestStatus.label}</span>
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] text-[var(--color-ink-soft)]">
                <span>位置：{nearest.resource.road} K{nearest.positionKp}</span>
                <span>驻点：{nearest.resource.station}</span>
                <span>距事件：{nearest.distanceKm.toFixed(1)} km</span>
                <span>{nearest.available ? `预计到达：${nearest.resource.id === assigned.id ? m.resource?.etaMin : nearest.etaMin} min` : '需等待释放或改派'}</span>
              </div>
            </div>
            {nearestAvailable && nearestAvailable.resource.id !== nearest.resource.id && (
              <div className="mt-1 rounded border border-[var(--color-pass-100)] bg-[var(--color-pass-50)] px-2 py-1 flex items-center gap-2 text-[9px]">
                <span className="text-[var(--color-pass)]">即时可用</span>
                <span className="text-[var(--color-ink)] font-medium">{nearestAvailable.resource.id}</span>
                <span className="text-[var(--color-ink-soft)]">{nearestAvailable.resource.road} K{nearestAvailable.positionKp}</span>
                <span className="ml-auto text-[var(--color-pass)]">ETA {nearestAvailable.etaMin} min</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <span className="step-index">2</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-[var(--color-ink)]">联络预案指派车组并确认装备</div>
            <div className="text-[9px] text-[var(--color-ink-soft)] mt-0.5 flex flex-wrap gap-x-3">
              <span>联系人：<b className="text-[var(--color-ink)] font-medium">{assignedCandidate.resource.contact}</b></span>
              <span>电话：<b className="text-[var(--color-brand-700)] font-formula font-medium">{assignedCandidate.resource.phone}</b></span>
              <span className="text-[var(--color-warn)]">（样例号码）</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <span className="step-index">3</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-[var(--color-ink)]">下发调度指令</div>
            <div className="text-[9px] text-[var(--color-ink-soft)] mt-0.5">
              指派 {assigned.id} → {assigned.road} K{destinationKp}，目标 ETA {m.resource?.etaMin} min
            </div>
          </div>
          <span className={`h-fit text-[9px] px-1.5 py-0.5 rounded ${m.runState === '已下发' ? 'bg-[var(--color-pass-50)] text-[var(--color-pass)]' : 'bg-[var(--color-warn-50)] text-[var(--color-warn)]'}`}>{dispatchState}</span>
        </div>

        <div className="flex gap-2">
          <span className="step-index">4</span>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-medium text-[var(--color-ink)]">在途跟踪与到场反馈</div>
            <div className="text-[9px] text-[var(--color-ink-soft)] mt-0.5">每 5 分钟回传位置；到场后反馈清障车道、预计恢复时间和现场照片。</div>
          </div>
        </div>

        {candidates.length > 1 && (
          <details className="border-t border-[var(--color-line)] pt-1.5">
            <summary className="cursor-pointer text-[9px] text-[var(--color-brand-700)]">查看备选清障车（{candidates.length - 1}）</summary>
            <div className="mt-1 space-y-1">
              {candidates.filter((item) => item.resource.id !== nearest.resource.id).map((item) => {
                const baseStatus = RESOURCE_STATUS[item.resource.status];
                const status = item.occupiedBy ? { label: `占用中 · ${item.occupiedBy}`, color: 'var(--color-danger)' } : baseStatus;
                return (
                  <div key={item.resource.id} className="flex items-center gap-2 text-[9px] text-[var(--color-ink-soft)] rounded bg-[var(--color-panel-2)] px-2 py-1">
                    <span className="font-medium text-[var(--color-ink)]">{item.resource.id}</span>
                    <span>{item.resource.road} K{item.positionKp}</span>
                    <span>{item.available ? `ETA ${item.etaMin} min` : '需重新协调'}</span>
                    <span className="ml-auto" style={{ color: status.color }}>● {status.label}</span>
                  </div>
                );
              })}
            </div>
          </details>
        )}
        {assignedCandidate.occupiedBy && nearestAvailable && (
          <div className="text-[9px] text-[var(--color-warn)]">
            策略说明：预案选择等待 {assignedCandidate.resource.id} 释放并转场（ETA {m.resource?.etaMin} min）；即时可用 {nearestAvailable.resource.id} 跨区到位约 {nearestAvailable.etaMin} min，请人工复核后下发。
          </div>
        )}
      </div>
    </div>
  );
}

/** 渲染单条预案措施，包括复核档位、版本差异、资源信息和推理依据。 */
function MeasureRow({ m, targetKp, targetRoad }: { m: PlanMeasure; targetKp?: number; targetRoad?: RoadId }) {
  const selectStep = useStore((s) => s.selectStep);
  const tier = TIER_META[m.tier];
  const diff = m.diff ? DIFF_STYLE[m.diff] : null;
  return (
    <div
      className="rounded-md border px-2.5 py-1.5 mb-1.5"
      style={{
        borderColor: 'var(--color-line)',
        background: diff ? diff.bg : 'var(--color-panel)',
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className="text-[9px] px-1.5 py-0.5 rounded text-white shrink-0"
          style={{ background: tier.color }}
        >
          {m.tier}
        </span>
        {diff && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
            style={{ background: diff.bg, color: diff.color, border: `1px solid ${diff.color}` }}
          >
            {diff.label}
          </span>
        )}
        <span
          className="text-xs font-semibold text-[var(--color-ink)]"
          style={diff?.strike ? { textDecoration: 'line-through', color: 'var(--color-ink-soft)' } : undefined}
        >
          {m.title}
        </span>
        {/* 执行态 */}
        <span className="text-[9px] text-[var(--color-ink-soft)] ml-auto">{m.runState}</span>
      </div>
      <div className="text-[11px] text-[var(--color-ink-soft)] mt-0.5">{m.summary}</div>
      {m.resource && (
        <div className="text-[10px] text-[var(--color-pass)] mt-0.5">
          资源 {m.resource.id} · ETA {m.resource.etaMin} min
        </div>
      )}
      <ResourceDispatchGuide m={m} targetKp={targetKp} targetRoad={targetRoad} />
      <SourceParamHover params={m.params} />
      {/* 依据链接：点击跳 Trace */}
      {m.supports.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {m.supports.map((sid) => (
            <button
              key={sid}
              type="button"
              onClick={() => selectStep(sid)}
              className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-brand-50)] text-[var(--color-brand-700)] hover:underline"
            >
              依据 {sid}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 预案版本主面板。
 * 历史版本可查看但确认动作由 TodoQueue 绑定最新有效版本，避免回改历史快照。
 */
export default function PlanPanel({ embedded = false, showMeasures = true }: { embedded?: boolean; showMeasures?: boolean }) {
  const fullscreen = usePanelFullscreen('plan-panel', '预案与版本');
  const plans = useStore((s) => s.plans);
  const activeVersion = useStore((s) => s.activePlanVersion);
  const setActivePlanVersion = useStore((s) => s.setActivePlanVersion);
  const focusedEventId = useStore((s) => s.focusedEventId);
  // 版本 Tab 只作用于「当前事件」的预案：多事件并发时不同事件各有 V1，
  // 若对全部 plans 直接按 version 出 Tab 会产生 key 冲突并串档，故先按最新事件的 planId 归组。
  const latestPlan = plans[plans.length - 1];
  const focusedPlans = focusedEventId
    ? plans.filter((p) => p.id === `PLAN-${focusedEventId}`)
    : [];
  const eventPlans = focusedPlans.length > 0 ? focusedPlans : latestPlan ? plans.filter((p) => p.id === latestPlan.id) : [];
  const plan = eventPlans.find((p) => p.version === activeVersion) ?? eventPlans.at(-1) ?? latestPlan;
  const events = useStore((s) => s.events);
  // 预案 id 采用 PLAN-{eventId} 约定，可据此取得调度目标桩号。
  const targetEvent = plan ? events.find((event) => `PLAN-${event.id}` === plan.id) : undefined;
  const severityReason = targetEvent?.severity
    ? assessSeverity({
        lanesTotal: targetEvent.lanesTotal,
        lanesClosed: targetEvent.lanesClosed,
        casualties: targetEvent.casualties,
        hazmat: targetEvent.hazmat,
        inTunnel: tunnelAt(targetEvent.road, targetEvent.accidentKp) != null,
        congested: targetEvent.congested,
      }).reasons.join('、')
    : '';

  const headerContent = (
    <div className="px-3 py-2 border-b border-[var(--color-line)] bg-[var(--color-panel-2)]">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold text-[var(--color-ink)] flex items-center gap-2"><span className="text-[var(--color-brand-700)]">▤</span> 预案与版本</span>
        <div className="flex items-center gap-1">
          {/* 版本 Tab（仅当前事件） */}
          {eventPlans.map((p) => (
            <button
              key={p.version}
              type="button"
              onClick={() => setActivePlanVersion(p.version)}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                p.version === activeVersion
                  ? 'bg-[var(--color-brand)] text-white border-[var(--color-brand)]'
                  : 'border-[var(--color-line)] text-[var(--color-ink)] hover:bg-[var(--color-panel)]'
              }`}
            >
              V{p.version}
            </button>
          ))}
          {!embedded && fullscreen.button}
        </div>
      </div>
      {plan && <StateMachineMini state={plan.state} />}
    </div>
  );

  const bodyContent = (
    <>
      {embedded && headerContent}
      {!plan && (
        <div className="flex-1 min-h-0 flex items-center justify-center text-xs text-[var(--color-ink-soft)] p-4 text-center">
          请先上报事件或从顶部加载演示案例
        </div>
      )}

      {plan && (
        <div className="flex-1 min-h-0 overflow-y-auto p-2">
          {/* 预案头：责任主体 + 置信 */}
          <div className="mb-2 text-[11px]">
            <div className="flex items-center gap-2">
              <span className="text-[var(--color-ink)] font-semibold">{plan.label}</span>
              {targetEvent?.severity && (
                <span
                  title={severityReason}
                  className="text-[9px] px-1.5 py-0.5 rounded border"
                  style={{
                    color: SEVERITY_META[targetEvent.severity].color,
                    borderColor: SEVERITY_META[targetEvent.severity].color,
                  }}
                >
                  {SEVERITY_META[targetEvent.severity].label}
                </span>
              )}
              {plan.archived && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--color-pass-50)] text-[var(--color-pass)] border border-[var(--color-pass-100)]">
                  24h 内归档
                </span>
              )}
            </div>
            <div className="text-[var(--color-ink-soft)]">责任主体：{plan.responsible}</div>
            <div className="text-[var(--color-ink-soft)]">置信：{plan.confidence}</div>
          </div>
          <AiNarrativeBlock plan={plan} />
          {/* 统一工作台由待办区显示措施并负责确认，独立预案页仍保留完整措施清单。 */}
          {showMeasures && plan.measures.map((m) => (
            <MeasureRow key={m.id} m={m} targetKp={targetEvent?.accidentKp} targetRoad={targetEvent?.road} />
          ))}
        </div>
      )}

      {/* 底部固定标注 */}
      <div className="shrink-0 px-3 py-1.5 border-t border-[var(--color-line)] bg-[var(--color-panel-2)] text-[9px] text-[var(--color-ink-soft)] leading-tight">
        当前文案由模板引擎兜底；配置 Qwen 后由 LLM 增强，并经值级溯源校验（方案 3.5）
      </div>
    </>
  );

  if (embedded) {
    return (
      <div data-testid="plan-panel" className="h-full min-h-0 flex flex-col">
        {bodyContent}
      </div>
    );
  }

  return (
    <PanelFrame
      testId="plan-panel"
      fullscreen={fullscreen}
      title="预案与版本"
      customHeader={headerContent}
    >
      {bodyContent}
    </PanelFrame>
  );
}
