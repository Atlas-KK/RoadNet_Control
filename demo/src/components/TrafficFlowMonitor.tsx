import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SimEvent } from '../domain/event';
import { resolveGantryTrafficReading, type GantryTrafficReading } from '../engine/gantryTraffic';
import { TWIN_NARRATIVE_REFRESH_MS, useStore } from '../store';

interface TrafficFlowMonitorProps {
  event?: SimEvent;
  chartCollapsed: boolean;
  onChartCollapsedChange: (collapsed: boolean) => void;
}

interface GantryTrafficSample {
  sampledAt: number;
  upstreamNormal?: number;
  upstreamRealtime?: number;
  downstreamNormal?: number;
  downstreamRealtime?: number;
  minRetentionRate?: number;
  congestionLevel?: string;
}

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

function stageLabel(stage: GantryTrafficReading['responseStage']): string {
  return ({ growing: '队列增长', stabilizing: '管控稳定', dissipating: '队列消散', recovered: '恢复通行' })[stage];
}

function percent(value?: number): string {
  return value == null ? '--' : `${(value * 100).toFixed(1)}%`;
}

function sampleFromReading(reading: GantryTrafficReading): Omit<GantryTrafficSample, 'sampledAt'> {
  return {
    upstreamNormal: reading.upstreamPoint?.normalCapacityVehPerHour,
    upstreamRealtime: reading.upstreamPoint?.realtimeCapacityVehPerHour,
    downstreamNormal: reading.downstreamPoint?.normalCapacityVehPerHour,
    downstreamRealtime: reading.downstreamPoint?.realtimeCapacityVehPerHour,
    minRetentionRate: reading.minRetentionRate ?? undefined,
    congestionLevel: reading.congestionLevel ?? undefined,
  };
}

function GateSummary({
  label,
  point,
}: {
  label: string;
  point: GantryTrafficReading['upstreamPoint'];
}) {
  return (
    <article className="min-w-0 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[9px] font-medium text-[var(--color-ink-soft)]">{label}</span>
        <span className="shrink-0 text-[9px] font-semibold text-[var(--color-ink)]">保持 {percent(point?.retentionRate)}</span>
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-1 font-formula">
        <span className="text-[10px] font-semibold text-[var(--color-brand-700)]">{point?.realtimeCapacityVehPerHour ?? '--'}</span>
        <span className="text-[8px] text-[var(--color-ink-soft)]">/ {point?.normalCapacityVehPerHour ?? '--'} veh/h</span>
      </div>
      <div className="mt-0.5 text-right text-[8px] text-[var(--color-danger)]">下降 {percent(point?.lossRate)}</div>
    </article>
  );
}

/** 对比事故点上下游门架正常历史基线与动态演示实时流量，反映当前拥堵水平。 */
export default function TrafficFlowMonitor({ event, chartCollapsed, onChartCollapsedChange }: TrafficFlowMonitorProps) {
  const plans = useStore((state) => state.plans);
  const simSec = useStore((state) => state.simSec);
  const activeDemoTwin = useStore((state) => state.activeDemoTwin);
  const reading = useMemo(
    () => event ? resolveGantryTrafficReading(event, plans, simSec, activeDemoTwin) : undefined,
    [activeDemoTwin, event, plans, simSec],
  );
  const readingRef = useRef<GantryTrafficReading | undefined>(reading);
  readingRef.current = reading;
  const [samples, setSamples] = useState<GantryTrafficSample[]>([]);
  const sampleKey = event
    ? `${event.id}:${event.road}:${event.accidentKp}:${event.startSimSec}:${activeDemoTwin?.script.id ?? 'manual'}`
    : 'none';

  useEffect(() => {
    if (sampleKey === 'none' || !readingRef.current) {
      setSamples([]);
      return;
    }
    const append = () => {
      const latest = readingRef.current;
      if (!latest) return;
      setSamples((history) => [...history, { sampledAt: Date.now(), ...sampleFromReading(latest) }].slice(-20));
    };
    append();
    const timer = window.setInterval(append, TWIN_NARRATIVE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [sampleKey]);

  const latest = samples.at(-1);
  const hasGantryPair = Boolean(reading?.upstream || reading?.downstream);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink)]" data-testid="traffic-flow-monitor">
      <header className="flex h-[48px] shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold">上下游通行能力</div>
          <div className="mt-0.5 truncate text-[9px] text-[var(--color-ink-soft)]">
            {event
              ? `${event.road} K${event.accidentKp} · ${reading?.upstream?.gantry.label ?? '上游无门架'} / ${reading?.downstream?.gantry.label ?? '下游无门架'}`
              : '聚焦事件后显示上下游门架能力对比曲线'}
          </div>
        </div>
        <div className="shrink-0 text-right text-[8px] text-[var(--color-ink-soft)]">
          <div className="text-[var(--color-brand-700)]">每30秒采样</div>
          <div>{latest ? `更新 ${formatClock(latest.sampledAt)}` : '等待采样'}</div>
        </div>
        {event && hasGantryPair && <button
          type="button"
          aria-expanded={!chartCollapsed}
          aria-label={chartCollapsed ? '展开通行能力图表' : '收起通行能力图表'}
          onClick={() => onChartCollapsedChange(!chartCollapsed)}
          className="arco-button arco-button-size-mini shrink-0 text-[var(--color-brand-700)]"
        >
          {chartCollapsed ? '展开图表 ⌃' : '收起图表 ⌄'}
        </button>}
      </header>

      {!event ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-[11px] leading-5 text-[var(--color-ink-soft)]">聚焦事件后，将展示事故点位上下游门架的正常与实时通行能力对比。</div>
      ) : !hasGantryPair ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-[11px] leading-5 text-[var(--color-ink-soft)]">事故点上下游 20km 内暂无同干线门架数据。</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {!chartCollapsed && (
            <div className="shrink-0 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-1.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[9px] text-[var(--color-ink-soft)]">正常基线 vs 实时能力（veh/h）</span>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-[var(--color-warn-50)] px-1 py-0.5 text-[8px] text-[var(--color-warn)]">动态演示数据</span>
                  <span className="rounded bg-[var(--color-danger-50)] px-1 py-0.5 text-[8px] text-[var(--color-danger)]">{reading?.congestionLevel ?? '--'}</span>
                </div>
              </div>
              <div className="h-[168px] min-h-[140px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={samples} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e6eb" />
                    <XAxis dataKey="sampledAt" tickFormatter={(timestamp) => formatClock(Number(timestamp)).slice(3, 8)} tick={{ fontSize: 8, fill: '#86909c' }} minTickGap={18} />
                    <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 8, fill: '#86909c' }} width={34} domain={['auto', 'auto']} />
                    <Tooltip
                      labelFormatter={(timestamp) => `采样 ${formatClock(Number(timestamp))}`}
                      formatter={(value, name) => [`${Math.round(Number(value))} veh/h`, name]}
                      contentStyle={{ borderRadius: 4, borderColor: 'var(--color-line)', fontSize: 10 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 8, paddingTop: 2 }} />
                    <Line type="monotone" dataKey="upstreamNormal" name="上游正常" stroke="#8ab4ff" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="upstreamRealtime" name="上游实时" stroke="#165dff" strokeWidth={2} dot={{ r: 2, fill: '#165dff', strokeWidth: 0 }} isAnimationActive={false} />
                    <Line type="monotone" dataKey="downstreamNormal" name="下游正常" stroke="#78d6ce" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="downstreamRealtime" name="下游实时" stroke="#14a9a0" strokeWidth={2} dot={{ r: 2, fill: '#14a9a0', strokeWidth: 0 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid shrink-0 grid-cols-2 gap-2">
            <GateSummary label={`上游 · ${reading?.upstream?.gantry.label ?? '暂无'}`} point={reading?.upstreamPoint ?? null} />
            <GateSummary label={`下游 · ${reading?.downstream?.gantry.label ?? '暂无'}`} point={reading?.downstreamPoint ?? null} />
          </div>
          {!chartCollapsed && <div className="flex shrink-0 items-center justify-between rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-[9px]">
            <span className="text-[var(--color-ink-soft)]">综合保持率（取上下游较小值）</span>
            <span className="font-formula font-semibold text-[var(--color-danger)]">{percent(reading?.minRetentionRate ?? undefined)} · {stageLabel(reading?.responseStage ?? 'growing')}</span>
          </div>}
        </div>
      )}
    </section>
  );
}
