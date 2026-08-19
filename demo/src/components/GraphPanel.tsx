// ============================================================
// GraphPanel 事理图谱可视化（开发规格 §7.3）
// 双区：上区类型层（手排固定坐标）+ 下区实例层（事件实例挂载）。
// 边按类型区分线型：因果实线 / 顺承实线+时延标签 / 条件虚线 / 知识边细实线。
// 推理联动：store.highlight.edgeKeys/nodeIds → 相关边加粗发光 + 流光动画。
// ============================================================

import {
  GRAPH_NODES,
  GRAPH_EDGES,
  GRAPH_VIEW,
  nodeById,
  type GNode,
  type EdgeType,
} from '../data/graphSchema';
import { useStore } from '../store';
import { tracePathForStep } from '../engine/trace';

const CAT_STYLE: Record<GNode['category'], { fill: string; stroke: string }> = {
  event: { fill: 'var(--color-brand-50)', stroke: 'var(--color-brand)' },
  measure: { fill: 'var(--color-graph-50)', stroke: 'var(--color-graph)' },
  resource: { fill: 'var(--color-pass-50)', stroke: 'var(--color-pass)' },
  constraint: { fill: 'var(--color-warn-50)', stroke: 'var(--color-warn)' },
};

const EDGE_STYLE: Record<EdgeType, { color: string; width: number; dash?: string }> = {
  因果: { color: 'var(--color-brand)', width: 1.6 },
  顺承: { color: '#5a6675', width: 1.6 },
  条件: { color: 'var(--color-warn)', width: 1.4, dash: '5 4' },
  关联: { color: '#9aa4b2', width: 1.2, dash: '2 3' },
  触发: { color: 'var(--color-graph)', width: 1.1 },
  需要: { color: 'var(--color-pass)', width: 1.1 },
  适用: { color: '#8a93a2', width: 1, dash: '4 3' },
  受约束: { color: 'var(--color-danger)', width: 1.1, dash: '4 3' },
};

function nodeWidth(label: string): number {
  return Math.max(52, label.length * 12 + 14);
}
const NODE_H = 24;

function edgeMid(fromId: string, toId: string): { x: number; y: number } | null {
  const a = nodeById(fromId);
  const b = nodeById(toId);
  if (!a || !b) return null;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export default function GraphPanel({ embedded = false }: { embedded?: boolean }) {
  const highlight = useStore((s) => s.highlight);
  const activeStepId = useStore((s) => s.activeStepId);
  const tracePlayback = useStore((s) => s.tracePlayback);
  const trace = useStore((s) => s.trace);
  const events = useStore((s) => s.events);
  const activeConditions = useStore((s) => s.activeConditions);
  const tms = useStore((s) => s.tms);
  const liveEvents = events.filter((e) => !e.finalized);
  const hlEdge = new Set(highlight.edgeKeys);
  const hlNode = new Set(highlight.nodeIds);
  const activeCond = new Set(activeConditions);
  const reverseFlow = trace.find((s) => s.id === activeStepId)?.phase === '撤销传导';
  // S4 撤销传导：measureId → 结论色；撤回事实节点灰化
  const TMS_COLOR: Record<string, string> = { 保留: 'var(--color-pass)', 降级: 'var(--color-warn)', 撤销: 'var(--color-danger)' };
  const tmsOutcome = new Map((tms ?? []).map((r) => [r.measureId, r.outcome]));
  const retractedNode = tms ? 'E_危化泄漏' : null; // 撤回的「泄漏」事实节点
  const playbackStep = tracePlayback.stepId === activeStepId
    ? trace.find((step) => step.id === tracePlayback.stepId)
    : undefined;
  const playbackPath = playbackStep ? tracePathForStep(playbackStep) : [];
  const pathMode = Boolean(playbackStep && playbackPath.length > 0 && tracePlayback.status !== 'idle');
  const pathIndexById = new Map(playbackPath.map((node, index) => [node.id, index]));
  const currentPathNodeId = pathMode ? playbackPath[Math.min(tracePlayback.nodeIndex, playbackPath.length - 1)]?.id : undefined;
  const pathEdgeKeys = new Set((playbackStep?.edges ?? []).map((edge) => `${edge.from}->${edge.to}`));
  const currentPathIndex = currentPathNodeId ? pathIndexById.get(currentPathNodeId) ?? 0 : -1;

  return (
    <div className={embedded ? 'h-full flex flex-col overflow-hidden' : 'h-full flex flex-col bg-[var(--color-panel)] rounded-lg border border-[var(--color-line)] overflow-hidden'}>
      <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] border-b border-[var(--color-line)] bg-[var(--color-panel-2)] flex items-center justify-between">
        <span>事理图谱</span>
        <span className="text-[10px] font-normal text-[var(--color-ink-soft)]">
          {pathMode ? `逐节点 ${currentPathIndex + 1}/${playbackPath.length}` : '类型层 + 实例层'}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-1">
        <svg viewBox={`0 0 ${GRAPH_VIEW.w} ${GRAPH_VIEW.h + 90}`} className="w-full" style={{ minWidth: 760 }}>
          <defs>
            <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ---- 边 ---- */}
          <g>
            {GRAPH_EDGES.map((e) => {
              const a = nodeById(e.from);
              if (!a) return null;
              let bx: number, by: number;
              if (e.targetEdge) {
                const te = GRAPH_EDGES.find((x) => x.id === e.targetEdge);
                const mid = te && te.to ? edgeMid(te.from, te.to) : null;
                if (!mid) return null;
                bx = mid.x;
                by = mid.y;
              } else {
                const b = e.to ? nodeById(e.to) : undefined;
                if (!b) return null;
                bx = b.x;
                by = b.y;
              }
              const st = EDGE_STYLE[e.type];
              const key = `${e.from}->${e.to}`;
              const fromIndex = pathIndexById.get(e.from);
              const toIndex = e.to ? pathIndexById.get(e.to) : undefined;
              const isPathEdge = pathMode && pathEdgeKeys.has(key);
              const isCurrentEdge = pathMode && isPathEdge && (e.from === currentPathNodeId || e.to === currentPathNodeId);
              const isPassedEdge = pathMode && isPathEdge && fromIndex != null && toIndex != null && fromIndex <= currentPathIndex && toIndex <= currentPathIndex;
              const isHl = pathMode ? isCurrentEdge || isPassedEdge : hlEdge.has(key);
              return (
                <g key={e.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={bx}
                    y2={by}
                    stroke={isCurrentEdge ? 'var(--color-brand)' : isPassedEdge ? 'var(--color-pass)' : isHl ? 'var(--color-brand)' : st.color}
                    strokeWidth={isCurrentEdge ? st.width + 3 : isHl ? st.width + 2 : st.width}
                    strokeDasharray={st.dash}
                    opacity={pathMode ? (isPathEdge ? (isCurrentEdge ? 1 : isPassedEdge ? 0.9 : 0.3) : 0.18) : isHl ? 1 : 0.55}
                    filter={isCurrentEdge || (!pathMode && isHl) ? 'url(#glow)' : undefined}
                  >
                    {(isCurrentEdge || (!pathMode && isHl)) && (
                      <animate attributeName="stroke-dashoffset" values={reverseFlow ? '0;16' : '16;0'} dur="0.6s" repeatCount="indefinite" />
                    )}
                  </line>
                  {/* 顺承边时延/权重标签 */}
                  {e.type === '顺承' && (e.delayLabel || e.weight != null) && (
                    <text x={(a.x + bx) / 2} y={(a.y + by) / 2 - 3} fontSize={8} fill="#8a93a2" textAnchor="middle">
                      {e.weight != null ? `w=${e.weight}` : ''}
                      {e.delayLabel ? ` Δt~${e.delayLabel}` : ''}
                    </text>
                  )}
                  {/* 条件加权系数标签 */}
                  {e.type === '条件' && e.factor != null && (
                    <text x={(a.x + bx) / 2} y={(a.y + by) / 2 - 3} fontSize={8} fill="var(--color-warn)" textAnchor="middle">
                      ×{e.factor}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* ---- 类型层节点 ---- */}
          <g>
            {GRAPH_NODES.map((n) => {
              const w = nodeWidth(n.label);
              const st = CAT_STYLE[n.category];
              const isHl = hlNode.has(n.id);
              const isActiveCond = activeCond.has(n.id);
              const pathIndex = pathIndexById.get(n.id);
              const isPathNode = pathMode && pathIndex != null;
              const isCurrentPathNode = isPathNode && n.id === currentPathNodeId;
              const isPassedPathNode = isPathNode && pathIndex <= currentPathIndex;
              const outcome = tmsOutcome.get(n.id);
              const isRetracted = n.id === retractedNode;
              const outcomeColor = outcome ? TMS_COLOR[outcome] : undefined;
              return (
                <g key={n.id}>
                  <rect
                    x={n.x - w / 2}
                    y={n.y - NODE_H / 2}
                    width={w}
                    height={NODE_H}
                    rx={5}
                    fill={isRetracted ? '#d0d4da' : isCurrentPathNode ? 'var(--color-brand)' : isPassedPathNode ? 'var(--color-brand-50)' : outcomeColor ?? (isActiveCond ? 'var(--color-warn)' : st.fill)}
                    stroke={isCurrentPathNode ? 'var(--color-brand)' : outcomeColor ?? (isPathNode && isPassedPathNode ? 'var(--color-pass)' : isHl ? 'var(--color-brand)' : isActiveCond ? 'var(--color-warn)' : st.stroke)}
                    strokeWidth={isCurrentPathNode ? 3.5 : isHl || isActiveCond || outcomeColor || isPassedPathNode ? 2.5 : 1.2}
                    filter={isCurrentPathNode || (!pathMode && (isHl || isActiveCond || outcomeColor)) ? 'url(#glow)' : undefined}
                    opacity={isRetracted ? 0.6 : pathMode ? (isPathNode ? 1 : 0.26) : 1}
                  />
                  <text x={n.x} y={n.y + 4} fontSize={11} fill={isCurrentPathNode || outcomeColor ? '#fff' : 'var(--color-ink)'} textAnchor="middle" opacity={pathMode && !isPathNode ? 0.3 : 1} style={isRetracted ? { textDecoration: 'line-through' } : undefined}>
                    {n.label}
                  </text>
                </g>
              );
            })}
          </g>

          {/* ---- 实例层 ---- */}
          <g>
            <line x1={20} y1={GRAPH_VIEW.h + 20} x2={GRAPH_VIEW.w - 20} y2={GRAPH_VIEW.h + 20} stroke="var(--color-line)" strokeDasharray="4 4" />
            <text x={24} y={GRAPH_VIEW.h + 16} fontSize={10} fill="var(--color-ink-soft)">
              实例层（处置期临时入图）
            </text>
            {liveEvents.length === 0 && (
              <text x={24} y={GRAPH_VIEW.h + 48} fontSize={10} fill="var(--color-ink-soft)">
                （暂无在处置事件实例）
              </text>
            )}
            {liveEvents.map((ev, i) => {
              const cx = 130 + i * 200;
              const t = nodeById(ev.typeNodeId);
              const instanceId = `INST_${ev.id}`;
              const instanceIndex = pathIndexById.get(instanceId);
              const isInstancePathNode = pathMode && instanceIndex != null;
              const isCurrentInstance = isInstancePathNode && instanceId === currentPathNodeId;
              const isPassedInstance = isInstancePathNode && instanceIndex <= currentPathIndex;
              return (
                <g key={ev.id}>
                  <rect x={cx - 75} y={GRAPH_VIEW.h + 40} width={150} height={26} rx={5} fill={isCurrentInstance ? 'var(--color-brand)' : '#fff'} stroke={isCurrentInstance ? 'var(--color-brand)' : isPassedInstance ? 'var(--color-pass)' : 'var(--color-danger)'} strokeWidth={isCurrentInstance ? 3.5 : isPassedInstance ? 2.5 : 1.8} filter={isCurrentInstance ? 'url(#glow)' : undefined} opacity={pathMode ? (isInstancePathNode ? 1 : 0.35) : 1} />
                  <text x={cx} y={GRAPH_VIEW.h + 57} fontSize={10} fill={isCurrentInstance ? '#fff' : 'var(--color-ink)'} textAnchor="middle" opacity={pathMode && !isInstancePathNode ? 0.35 : 1}>
                    {ev.id} · K{ev.accidentKp}
                  </text>
                  {t && (
                    <line
                      x1={cx}
                      y1={GRAPH_VIEW.h + 40}
                      x2={t.x}
                      y2={t.y + NODE_H / 2}
                      stroke="var(--color-danger)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      opacity={0.6}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
