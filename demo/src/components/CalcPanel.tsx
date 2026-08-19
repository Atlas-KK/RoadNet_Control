// ============================================================
// CalcPanel 计算过程面板（开发规格 §4.2 / §7.4）
// 每条 CalcRecord 渲染为公式(含符号) → 代入(实际数值) → 结果(含单位) → 结论，
// 并标注来源徽章；可展开「参数来源」子表；支持按事件过滤。
// M2：展示 flowModel 对运行事件算出的四条核心 CalcRecord + L(t) 动态记录。
// 传入 records 由上层（App/场景）注入，本组件只负责渲染与联动。
// ============================================================

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { CalcRecord } from '../engine/trace';
import { useStore } from '../store';
import type { ChartSpec } from '../domain/chart';

interface Props {
  records: CalcRecord[];
  /** 外部联动高亮的记录 id 集合（TraceStep 点击驱动）；首条滚入视野 */
  highlightIds?: string[];
  /** 嵌入模式：去掉外框，供合并到「推理轨迹」窗口 */
  embedded?: boolean;
}

/** CalcPanel 内嵌 recharts 图表（S2 双时间线 / S5 排队曲线，§7.4） */
function EmbeddedChart({ chart }: { chart: ChartSpec }) {
  if (chart.kind === 'gantt') {
    const data = chart.bars.map((b) => ({ name: b.name, end: b.end, fill: b.color, note: b.note }));
    const maxX = Math.max(...chart.bars.map((b) => b.end), ...chart.refLines.map((r) => r.x)) + 6;
    return (
      <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] p-2 mb-2">
        <div className="text-[11px] font-semibold text-[var(--color-ink)] mb-1">{chart.title}</div>
        <ResponsiveContainer width="100%" height={120}>
          <BarChart layout="vertical" data={data} margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" domain={[0, maxX]} tick={{ fontSize: 9 }} label={{ value: chart.xLabel, position: 'insideBottom', fontSize: 9 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={80} />
            <Tooltip contentStyle={{ fontSize: 10 }} />
            <Bar dataKey="end" radius={3} isAnimationActive={false} />
            {chart.refLines.map((r, i) => (
              <ReferenceLine key={i} x={r.x} stroke={r.color} strokeDasharray="4 3" label={{ value: r.label, fontSize: 8, fill: r.color, position: 'top' }} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  }
  // queueCurve（S5）
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] p-2 mb-2">
      <div className="text-[11px] font-semibold text-[var(--color-ink)] mb-1">{chart.title}</div>
      <ResponsiveContainer width="100%" height={140}>
        <LineChart data={chart.data} margin={{ top: 6, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" tick={{ fontSize: 9 }} label={{ value: 'min（模拟时间）', position: 'insideBottom', fontSize: 9, dy: 8 }} />
          <YAxis dataKey="tail" domain={['dataMin - 1', 'dataMax + 1']} tick={{ fontSize: 9 }} width={42} reversed label={{ value: '队尾桩号', angle: -90, position: 'insideLeft', fontSize: 9 }} />
          <Tooltip contentStyle={{ fontSize: 10 }} />
          <ReferenceLine y={chart.hubKp} stroke="var(--color-brand)" strokeDasharray="4 3" label={{ value: chart.hubLabel, fontSize: 8, fill: 'var(--color-brand)' }} />
          <ReferenceLine x={chart.crossT} stroke="var(--color-danger)" strokeDasharray="4 3" label={{ value: chart.crossLabel, fontSize: 8, fill: 'var(--color-danger)', position: 'top' }} />
          <Line type="monotone" dataKey="tail" stroke="var(--color-danger)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Badge({ text, from }: { text: string; from: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-brand-50)] text-[var(--color-brand-700)] border border-[var(--color-brand-100)] whitespace-nowrap">
      {text}←{from}
    </span>
  );
}

function CalcCard({ rec, highlighted }: { rec: CalcRecord; highlighted: boolean }) {
  const [open, setOpen] = useState(false);
  const conclusionToneClass = rec.conclusionTone === 'danger'
    ? 'border-[var(--color-danger)] bg-[var(--color-danger-50)] text-[var(--color-danger)]'
    : rec.conclusionTone === 'warning'
      ? 'border-[var(--color-warn)] bg-[var(--color-warn-50)] text-[var(--color-warn)]'
      : rec.conclusionTone === 'success'
        ? 'border-[var(--color-pass)] bg-[var(--color-pass-50)] text-[var(--color-pass)]'
        : 'border-[var(--color-brand-100)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]';
  return (
    <div
      id={`calc-${rec.id}`}
      className={`rounded-md border px-3 py-2 mb-2 bg-[var(--color-panel)] transition-colors ${
        highlighted ? 'border-[var(--color-brand)] ring-1 ring-[var(--color-brand)]' : 'border-[var(--color-line)]'
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-[var(--color-ink)]">{rec.label}</span>
        <span className="text-[10px] text-[var(--color-ink-soft)] font-formula">{rec.id}</span>
      </div>
      {/* 三行：公式 → 代入 → 结果 */}
      <div className="font-formula text-[13px] leading-relaxed">
        <div className="text-[var(--color-ink)]">{rec.formula}</div>
        <div className="text-[var(--color-ink-soft)]">{rec.substitution}</div>
        <div className="text-[var(--color-pass)] font-semibold">{rec.result}</div>
      </div>
      {rec.conclusion && (
        <div className={`mt-2 rounded border px-2 py-1.5 text-[11px] leading-snug ${conclusionToneClass}`}>
          <span className="mr-1 font-semibold">结论：</span>{rec.conclusion}
        </div>
      )}
      {/* 来源徽章 */}
      <div className="flex flex-wrap gap-1 mt-1.5">
        {rec.badges.map((b, i) => (
          <Badge key={i} text={b.text} from={b.from} />
        ))}
      </div>
      {/* 参数来源子表 */}
      {rec.paramTable && rec.paramTable.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-[10px] text-[var(--color-brand-700)] hover:underline"
          >
            {open ? '▾ 收起参数来源' : '▸ 参数来源'}
          </button>
          {open && (
            <table className="mt-1 w-full text-[10px] border-collapse">
              <tbody>
                {rec.paramTable.map((p, i) => (
                  <tr key={i} className="border-t border-[var(--color-line)]">
                    <td className="py-0.5 pr-2 text-[var(--color-ink-soft)]">{p.name}</td>
                    <td className="py-0.5 pr-2 font-formula text-[var(--color-ink)]">{p.value}</td>
                    <td className="py-0.5 text-[var(--color-ink-soft)]">{p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function CalcPanel({ records, highlightIds, embedded = false }: Props) {
  const [eventFilter, setEventFilter] = useState('ALL');
  const hlSet = new Set(highlightIds ?? []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstHl = highlightIds && highlightIds.length > 0 ? highlightIds[0] : undefined;
  const chart = useStore((s) => s.chart);
  const eventIds = useMemo(() => Array.from(new Set(records.map((r) => r.eventId))), [records]);
  const filteredRecords = eventFilter === 'ALL' ? records : records.filter((r) => r.eventId === eventFilter);
  const showEventFilter = !embedded || eventIds.length > 1;

  useEffect(() => {
    if (eventFilter !== 'ALL' && !eventIds.includes(eventFilter)) setEventFilter('ALL');
  }, [eventFilter, eventIds]);

  // 联动：首条关联计算滚入视野
  useEffect(() => {
    if (!firstHl || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`#calc-${CSS.escape(firstHl)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [firstHl]);

  return (
    <div className={embedded ? 'h-full flex flex-col bg-[var(--color-panel-2)] overflow-hidden' : 'h-full flex flex-col bg-[var(--color-panel-2)] rounded-lg border border-[var(--color-line)] overflow-hidden'}>
      <div className="px-3 py-1.5 text-xs font-semibold text-[var(--color-ink)] border-b border-[var(--color-line)] bg-[var(--color-panel)] flex items-center justify-between">
        <span>计算过程</span>
        <div className="flex items-center gap-2">
          {showEventFilter ? (
            <select
              aria-label="按事件过滤"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="max-w-28 rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-ink)]"
            >
              <option value="ALL">全部事件</option>
              {eventIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          ) : (
            <span className="rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-ink-soft)]">
              {eventIds[0] ?? '本次事件'}
            </span>
          )}
          <span className="text-[10px] font-normal text-[var(--color-ink-soft)]">公式 → 代入 → 结果 → 结论</span>
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-2">
        {chart && <EmbeddedChart chart={chart} />}
        {filteredRecords.length === 0 && !chart ? (
          <div className="text-xs text-[var(--color-ink-soft)] p-2">暂无计算记录</div>
        ) : (
          filteredRecords.map((rec) => <CalcCard key={rec.id} rec={rec} highlighted={hlSet.has(rec.id)} />)
        )}
      </div>
    </div>
  );
}
