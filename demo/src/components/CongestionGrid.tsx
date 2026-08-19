// ============================================================
// 事故上下游实时拥堵网格。
// 组件只负责选择待展示事件和渲染，等级计算集中在 engine/congestionGrid.ts，
// 以保证业务规则可独立测试且不会散落在 JSX 中。
// ============================================================

import { buildCongestionGrid, type CongestionLevel } from '../engine/congestionGrid';
import { useStore } from '../store';
import { formatSimClock } from '../utils/time';
import { MAP_THEME_CONFIG } from '../gis/mapTheme';

/** 拥堵等级的唯一视觉映射，图例与格子共用，避免颜色语义不一致。 */
const LEVEL_META: Record<CongestionLevel, { label: string; color: string; text: string }> = {
  free: { label: '畅通', color: '#19b982', text: '#eafff7' },
  slow: { label: '缓行', color: '#e4b13f', text: '#241a00' },
  congested: { label: '拥堵', color: '#ef7f3b', text: '#fff6ec' },
  severe: { label: '严重拥堵', color: '#ef4e50', text: '#fff' },
  incident: { label: '事故点', color: '#ff2f54', text: '#fff' },
  recovered: { label: '已恢复', color: '#2f7df6', text: '#fff' },
};

/** 21 个公里格只在关键里程显示标签，兼顾方向表达和有限横向空间。 */
const AXIS_LABELS = new Map([
  [-10, '上游 10km'],
  [-5, '-5'],
  [0, '事故点'],
  [5, '+5'],
  [10, '下游 10km'],
]);

/** 渲染最多两个活动事件的上下游各 10km 实时态势。 */
export default function CongestionGrid() {
  const events = useStore((state) => state.events);
  const simSec = useStore((state) => state.simSec);
  const plans = useStore((state) => state.plans);
  const baseSec = useStore((state) => state.sceneBaseSec);
  const focusedEventId = useStore((state) => state.focusedEventId);
  const mapTheme = useStore((state) => state.mapTheme);
  const themeConfig = MAP_THEME_CONFIG[mapTheme];
  // 运行工作台只展示当前聚焦事件的拥堵网格。
  const activeEvents = [...events]
    .filter((event) => event.id === focusedEventId && !event.finalized && !event.falsePositive)
    .sort((a, b) => Number(b.congested) - Number(a.congested) || b.startSimSec - a.startSimSec)
    .slice(0, 1);

  return (
    <section data-testid="congestion-grid" className="shrink-0 border-t border-[var(--color-line)] px-3 py-2" style={{ backgroundColor: themeConfig.gridBackground }}>
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <div className="min-w-0 flex items-center gap-2">
          <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: themeConfig.gridText }}>事故点上下游 10km · 实时拥堵态势</span>
          <span className="text-[9px] whitespace-nowrap font-formula" style={{ color: themeConfig.gridText }}>更新 {formatSimClock(baseSec, simSec)}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(['free', 'slow', 'congested', 'severe', 'incident'] as CongestionLevel[]).map((level) => (
            <span key={level} className="inline-flex items-center gap-1 text-[8px]" style={{ color: themeConfig.gridText }}>
              <span className="w-2 h-2 rounded-sm" style={{ background: LEVEL_META[level].color }} />{LEVEL_META[level].label}
            </span>
          ))}
        </div>
      </div>

      {activeEvents.length === 0 ? (
        // 无事件时保留同样的 21 格骨架，防止面板高度随场景切换发生跳变。
        <div className="grid grid-cols-[76px_1fr] items-center gap-2">
          <span className="text-[9px]" style={{ color: themeConfig.gridText }}>等待事件</span>
          <div className="grid grid-cols-[repeat(21,minmax(0,1fr))] gap-1">
            {Array.from({ length: 21 }, (_, index) => <span key={index} className="h-5 rounded-sm border opacity-70" style={{ backgroundColor: themeConfig.gridEmpty, borderColor: themeConfig.gridBorder }} />)}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeEvents.map((event) => {
            // 每次模拟时钟更新都会重新计算等级，从而驱动网格颜色平滑演变。
            const grid = buildCongestionGrid(event, simSec, 10, plans);
            return (
              <div key={event.id} className="grid grid-cols-[76px_1fr] items-end gap-2" data-testid={`congestion-row-${event.id}`}>
                <div className="min-w-0 pb-0.5">
                  <div className="text-[9px] font-semibold truncate" style={{ color: themeConfig.gridText }} title={event.label}>{event.id}</div>
                  <div className="text-[8px] whitespace-nowrap" style={{ color: themeConfig.gridText }}>{event.road} K{event.accidentKp}</div>
                </div>
                <div className="min-w-0">
                  <div className="grid grid-cols-[repeat(21,minmax(0,1fr))] gap-1 mb-0.5">
                    {grid.cells.map((cell) => (
                      <span key={cell.offsetKm} className="text-[7px] text-center h-2.5 leading-none truncate" style={{ color: themeConfig.gridText }}>
                        {AXIS_LABELS.get(cell.offsetKm) ?? ''}
                      </span>
                    ))}
                  </div>
                  <div className="grid grid-cols-[repeat(21,minmax(0,1fr))] gap-1">
                    {grid.cells.map((cell) => {
                      const meta = LEVEL_META[cell.level];
                      return (
                        <span
                          key={cell.offsetKm}
                          data-testid={`congestion-cell-${event.id}-${cell.offsetKm}`}
                          data-level={cell.level}
                          className={`relative h-5 rounded-sm border grid place-items-center text-[7px] font-formula transition-colors duration-500 ${cell.level === 'incident' ? 'ring-1 ring-red-300 animate-pulse' : ''}`}
                          style={{ background: meta.color, color: meta.text, borderColor: themeConfig.gridBorder }}
                          title={`${event.road} K${cell.kp.toFixed(1)} · ${meta.label} · 估算速度 ${cell.speedKph} km/h`}
                          aria-label={`${event.id} ${cell.offsetKm < 0 ? `上游 ${Math.abs(cell.offsetKm)} 公里` : cell.offsetKm > 0 ? `下游 ${cell.offsetKm} 公里` : '事故点'}，${meta.label}，估算速度 ${cell.speedKph} 公里每小时`}
                        >
                          {cell.offsetKm === 0 ? '!' : ''}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-0.5 text-[8px] text-right" style={{ color: themeConfig.gridText }}>
                    {grid.responseStage === 'recovered'
                      ? '管控生效 · 排队已消散'
                      : event.congested
                        ? `${grid.responseStage === 'dissipating' ? '消散中 · ' : ''}排队 ${grid.queueLengthKm.toFixed(1)}km · 队尾 K${grid.queueTailKp.toFixed(1)}`
                        : '未形成持续排队'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
