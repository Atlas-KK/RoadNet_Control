import { useMemo, useState } from 'react';
import type { DeviceKind } from '../data/devices';
import type { SimEvent } from '../domain/event';
import {
  INFRASTRUCTURE_KIND_LABEL,
  INFRASTRUCTURE_KINDS,
  INFRASTRUCTURE_RANGE_OPTIONS,
  resolveInfrastructureMonitor,
  type InfrastructureRangeKm,
} from '../engine/infrastructureMonitor';
import { useStore } from '../store';
import { resolveDeviceCommandEffects } from '../engine/commandDispatch';
import { formatSimClock } from '../utils/time';
import { usePanelFullscreen } from './FullscreenPanel';
import PanelFrame from './PanelFrame';

interface ChainageCell {
  startKp: number;
  endKp: number;
  isAccidentCell: boolean;
}

interface InfrastructureMonitorGridProps {
  event?: SimEvent;
  selectedDeviceId?: string;
  onDeviceSelect: (deviceId: string) => void;
}

function statusStyle(status: 'online' | 'offline' | 'normal' | 'issued' | 'fault'): string {
  return ({
    online: 'bg-[var(--color-pass-50)] text-[var(--color-pass)]',
    offline: 'bg-[var(--color-danger-50)] text-[var(--color-danger)]',
    normal: 'bg-[var(--color-panel-2)] text-[var(--color-ink-soft)]',
    issued: 'bg-[var(--color-brand-50)] text-[var(--color-brand-700)]',
    fault: 'bg-[var(--color-danger-50)] text-[var(--color-danger)]',
  })[status];
}

function contentStyle(kind: DeviceKind, tone: 'danger' | 'warning' | 'normal' | 'muted'): string {
  if (kind === 'vms') {
    return ({
      danger: 'border-[#f53f3f]/50 bg-[#171d28] text-[#f53f3f]',
      warning: 'border-[#f7ba1e]/50 bg-[#171d28] text-[#f7ba1e]',
      normal: 'border-[#67e8f9]/40 bg-[#171d28] text-[#67e8f9]',
      muted: 'border-[#4e5969] bg-[#171d28] text-[#a9b0bb]',
    })[tone];
  }
  return ({
    danger: 'bg-[var(--color-danger-50)] text-[var(--color-danger)]',
    warning: 'bg-[var(--color-warn-50)] text-[var(--color-warn)]',
    normal: 'bg-[var(--color-panel-2)] text-[var(--color-ink-soft)]',
    muted: 'bg-[var(--color-panel-2)] text-[var(--color-ink-soft)]',
  })[tone];
}

function buildChainageCells(event: SimEvent, rangeKm: InfrastructureRangeKm): ChainageCell[] {
  const accidentCellStart = Math.floor(event.accidentKp);
  // 两端按整公里向外对齐；这样位于范围边缘的设备仍会落入可见网格。
  return Array.from({ length: rangeKm * 2 + 1 }, (_, index) => {
    const startKp = accidentCellStart - rangeKm + index;
    return {
      startKp,
      endKp: startKp + 1,
      isAccidentCell: startKp === accidentCellStart,
    };
  });
}

export default function InfrastructureMonitorGrid({ event, selectedDeviceId, onDeviceSelect }: InfrastructureMonitorGridProps) {
  const fullscreen = usePanelFullscreen('infrastructure-monitor', '基础设施情况监测');
  const [rangeKm, setRangeKm] = useState<InfrastructureRangeKm>(10);
  const [collapsed, setCollapsed] = useState(false);
  const [enabledKinds, setEnabledKinds] = useState<DeviceKind[]>(INFRASTRUCTURE_KINDS);
  const environment = useStore((state) => state.environment);
  const plans = useStore((state) => state.plans);
  const activeDemoTwin = useStore((state) => state.activeDemoTwin);
  const simSec = useStore((state) => state.simSec);
  const sceneBaseSec = useStore((state) => state.sceneBaseSec);
  const commandEffects = useMemo(() => resolveDeviceCommandEffects(plans, event?.id), [event?.id, plans]);
  const items = useMemo(
    () => resolveInfrastructureMonitor(event, environment, activeDemoTwin, simSec, rangeKm, commandEffects),
    [activeDemoTwin, commandEffects, environment, event, rangeKm, simSec],
  );
  const groups = useMemo(() => {
    const result = new Map<string, typeof items>();
    items.forEach((item) => {
      const key = `${item.device.kind}:${item.chainageCellStart}`;
      result.set(key, [...(result.get(key) ?? []), item]);
    });
    return result;
  }, [items]);
  const chainageCells = useMemo(() => event ? buildChainageCells(event, rangeKm) : [], [event, rangeKm]);
  const visibleKinds = INFRASTRUCTURE_KINDS.filter((kind) => enabledKinds.includes(kind));
  const toggleKind = (kind: DeviceKind) => setEnabledKinds((current) => current.includes(kind)
    ? current.filter((item) => item !== kind)
    : [...current, kind]);

  return (
    <PanelFrame
      testId="infrastructure-monitor"
      fullscreen={fullscreen}
      rootClassName="w-full min-w-0"
      title={(
        <div className="min-w-0">
          <h2 className="truncate text-[12px] font-semibold text-[var(--color-ink)]">事故点上下游基础设施情况监测</h2>
          <div className="mt-0.5 truncate text-[9px] text-[var(--color-ink-soft)]">
            {event ? `${event.road} K${event.accidentKp} · 上下游各 ${rangeKm}km · 动态演示数据` : '聚焦事故后展示上下游基础设施分布与状态'}
          </div>
        </div>
      )}
      headerActions={(
        <>
          <div className="flex items-center gap-0.5 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-0.5">
            {INFRASTRUCTURE_RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={rangeKm === option}
                onClick={() => setRangeKm(option)}
                className={`rounded px-1.5 py-0.5 text-[9px] ${rangeKm === option ? 'bg-[var(--color-brand)] text-white' : 'text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]'}`}
              >
                {option}km
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
            className="arco-button arco-button-size-mini text-[var(--color-brand-700)]"
          >
            {collapsed ? '展开' : '收起'}
          </button>
        </>
      )}
    >
      {collapsed ? (
        <button type="button" onClick={() => setCollapsed(false)} className="flex flex-1 items-center px-4 text-left text-[10px] text-[var(--color-ink-soft)] hover:text-[var(--color-brand-700)]">
          已收起监测网格；点击展开查看设备分布、状态与显示内容。
        </button>
      ) : !event ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-[11px] leading-5 text-[var(--color-ink-soft)]">聚焦事故后，将展示上下游各范围内的可变情报板、信号灯、车道指示灯、监控摄像头及扩展设施。</div>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-1 text-[9px] text-[var(--color-ink-soft)]">
            <span>● 数据源：动态演示 · 更新时间 {formatSimClock(sceneBaseSec, simSec)}</span>
            <span>{items.length} 台设备 · 点击设备定位地图</span>
          </div>
          <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--color-line)] px-2 py-1">
            <button type="button" aria-pressed={enabledKinds.length === INFRASTRUCTURE_KINDS.length} onClick={() => setEnabledKinds(enabledKinds.length === INFRASTRUCTURE_KINDS.length ? [] : INFRASTRUCTURE_KINDS)} className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${enabledKinds.length === INFRASTRUCTURE_KINDS.length ? 'bg-[var(--color-brand)] text-white' : 'bg-[var(--color-panel-2)] text-[var(--color-ink-soft)]'}`}>全部</button>
            {INFRASTRUCTURE_KINDS.map((kind) => (
              <button key={kind} type="button" aria-pressed={enabledKinds.includes(kind)} onClick={() => toggleKind(kind)} className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] ${enabledKinds.includes(kind) ? 'border-[var(--color-brand-100)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]' : 'border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink-soft)]'}`}>{INFRASTRUCTURE_KIND_LABEL[kind]}</button>
            ))}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto">
            <div
              className="grid min-w-max text-[9px]"
              style={{ gridTemplateColumns: `88px repeat(${chainageCells.length}, minmax(112px, 1fr))` }}
            >
              <div className="sticky left-0 top-0 z-20 border-b border-r border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1.5 font-medium text-[var(--color-ink-soft)]">设备类型</div>
              {chainageCells.map((cell) => (
                <div
                  key={cell.startKp}
                  className={`sticky top-0 z-10 min-h-[42px] border-b border-r border-[var(--color-line)] px-1.5 py-1 text-center font-medium ${cell.isAccidentCell ? 'border-b-[var(--color-danger)] bg-[var(--color-danger-50)] text-[var(--color-danger)]' : 'bg-[var(--color-panel)] text-[var(--color-ink-soft)]'}`}
                >
                  <div>K{cell.startKp}–K{cell.endKp}</div>
                  {cell.isAccidentCell && <div className="mt-0.5 text-[8px] font-semibold">事故点 K{event.accidentKp}</div>}
                </div>
              ))}
              {visibleKinds.map((kind) => (
                <div key={kind} className="contents">
                  <div className="sticky left-0 z-10 flex min-h-[52px] items-center border-b border-r border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 font-medium text-[var(--color-ink)]">{INFRASTRUCTURE_KIND_LABEL[kind]}</div>
                  {chainageCells.map((cell) => {
                    const devices = groups.get(`${kind}:${cell.startKp}`) ?? [];
                    return (
                      <div key={cell.startKp} className={`min-h-[52px] border-b border-r border-[var(--color-line)] p-1 ${cell.isAccidentCell ? 'bg-[var(--color-danger-50)]' : 'bg-[var(--color-panel)]'}`}>
                        {devices.length === 0 ? <span className="text-[8px] text-[var(--color-ink-soft)]">--</span> : devices.map((item) => (
                          <button
                            key={item.device.id}
                            type="button"
                            aria-pressed={selectedDeviceId === item.device.id}
                            onClick={() => onDeviceSelect(item.device.id)}
                            className={`mb-1 block w-full rounded border px-1 py-1 text-left last:mb-0 ${selectedDeviceId === item.device.id || item.commandSync ? 'border-[var(--color-brand)] bg-[var(--color-brand-50)]' : 'border-[var(--color-line)] bg-[var(--color-panel-2)] hover:border-[var(--color-brand)]'}`}
                          >
                            <span className="flex items-center justify-between gap-1"><span className="truncate font-semibold text-[var(--color-ink)]">{item.device.id}</span><span className={`shrink-0 rounded px-1 py-0.5 text-[8px] ${statusStyle(item.linkStatus)}`}>{item.linkStatus === 'online' ? '在线' : '离线'}</span></span>
                            <span className="mt-0.5 block truncate text-[8px] text-[var(--color-ink-soft)]">K{item.device.kp} · {item.distanceKm.toFixed(1)}km</span>
                            <span className={`mt-0.5 block truncate rounded border px-1 py-0.5 text-[8px] ${contentStyle(item.device.kind, item.contentTone)}`}>{item.displayContent}</span>
                            {item.commandSync && <span className="mt-0.5 block truncate rounded bg-[var(--color-brand-50)] px-1 py-0.5 text-[8px] text-[var(--color-brand-700)]">已同步 · {item.commandSync.measureTitle}</span>}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </PanelFrame>
  );
}
