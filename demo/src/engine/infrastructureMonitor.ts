import { DEVICES, type Device, type DeviceKind } from '../data/devices';
import type { SimEvent } from '../domain/event';
import type { DeviceCommandEffect } from '../domain/plan';
import type { EnvironmentState } from './conditions';
import { resolveDemoTwin, type ActiveDemoTwin } from '../gis/demoTwinScenario';

export const INFRASTRUCTURE_RANGE_OPTIONS = [5, 10, 20] as const;
export type InfrastructureRangeKm = (typeof INFRASTRUCTURE_RANGE_OPTIONS)[number];

export type InfrastructureZone = 'upstreamFar' | 'upstreamNear' | 'incident' | 'downstreamNear' | 'downstreamFar';
export type InfrastructureLinkStatus = 'online' | 'offline';
export type InfrastructureWorkStatus = 'normal' | 'issued' | 'fault';
export type InfrastructureContentTone = 'danger' | 'warning' | 'normal' | 'muted';

export interface InfrastructureMonitorItem {
  device: Device;
  zone: InfrastructureZone;
  /** 起始桩号（向下取整），用于按连续 1km 网格归位设备。 */
  chainageCellStart: number;
  distanceKm: number;
  linkStatus: InfrastructureLinkStatus;
  workStatus: InfrastructureWorkStatus;
  displayContent: string;
  contentTone: InfrastructureContentTone;
  updatedAtSimSec: number;
  source: 'demo';
  commandSync?: DeviceCommandEffect & { measureTitle: string; issuedAtSimSec: number };
}

export const INFRASTRUCTURE_KINDS: DeviceKind[] = ['vms', 'traffic_signal', 'lane_signal', 'camera', 'fan', 'wind_sensor'];

export const INFRASTRUCTURE_KIND_LABEL: Record<DeviceKind, string> = {
  vms: '可变情报板',
  traffic_signal: '信号灯',
  lane_signal: '车道指示灯',
  camera: '监控摄像头',
  fan: '风机',
  wind_sensor: '风向传感器',
};

export const INFRASTRUCTURE_ZONE_LABEL: Record<InfrastructureZone, string> = {
  upstreamFar: '上游远端',
  upstreamNear: '上游近端',
  incident: '事故区',
  downstreamNear: '下游近端',
  downstreamFar: '下游远端',
};

function directionOf(event: SimEvent): 'increasing' | 'decreasing' {
  return event.direction === 'up' ? 'decreasing' : 'increasing';
}

function zoneOf(event: SimEvent, device: Device): InfrastructureZone {
  const delta = device.kp - event.accidentKp;
  const distanceKm = Math.abs(delta);
  if (distanceKm <= 0.5) return 'incident';
  const upstream = directionOf(event) === 'increasing' ? delta < 0 : delta > 0;
  if (upstream) return distanceKm <= 5 ? 'upstreamNear' : 'upstreamFar';
  return distanceKm <= 5 ? 'downstreamNear' : 'downstreamFar';
}

function contentFor(
  device: Device,
  event: SimEvent,
  issued: boolean,
  closureActive: boolean,
  diversionLabel?: string,
  ventilation?: { fanId: string; windSensorId: string; naturalWindSpeedMps: number; fanEnabled: boolean },
): string {
  if (device.kind === 'vms') {
    if (!issued) return '未下发内容';
    if (closureActive) return '禁止通行';
    return diversionLabel ? '减速慢行·按指引分流' : `减速慢行·前方${event.label}`;
  }
  if (device.kind === 'traffic_signal') return issued || closureActive ? '黄闪警示·管控模式' : '绿灯通行·常态模式';
  if (device.kind === 'lane_signal') {
    if (!closureActive) return device.lane ? `第 ${device.lane} 车道：绿箭通行` : '绿箭通行';
    return device.lane != null && device.lane <= event.lanesClosed ? `第 ${device.lane} 车道：红叉关闭` : '绿箭·受控通行';
  }
  if (device.kind === 'camera') return '视频码流正常·动态演示';
  if (device.kind === 'fan') return ventilation?.fanId === device.id && ventilation.fanEnabled ? '正向排风已启动' : '待命·常态通风';
  if (device.kind === 'wind_sensor') {
    return ventilation?.windSensorId === device.id
      ? `风速 ${ventilation.naturalWindSpeedMps.toFixed(1)} m/s·数据有效`
      : '风向风速采样正常';
  }
  return '暂无状态';
}

function toneFor(device: Device, linkStatus: InfrastructureLinkStatus, issued: boolean, closureActive: boolean): InfrastructureContentTone {
  if (linkStatus === 'offline') return 'muted';
  if (device.kind === 'vms') {
    if (!issued) return 'muted';
    return closureActive ? 'danger' : 'warning';
  }
  if (device.kind === 'lane_signal' && closureActive) return 'danger';
  if (device.kind === 'traffic_signal' && (issued || closureActive)) return 'warning';
  return 'normal';
}

/**
 * 将静态设备台账与当前演示时间片合成为事故上下游监测快照。
 * 此函数仅输出动态演示数据，生产接入时可在同一接口前置实时适配层。
 */
export function resolveInfrastructureMonitor(
  event: SimEvent | undefined,
  environment: EnvironmentState,
  activeDemoTwin: ActiveDemoTwin | undefined,
  simSec: number,
  rangeKm: InfrastructureRangeKm,
  commandEffects?: ReadonlyMap<string, DeviceCommandEffect & { measureTitle: string; issuedAtSimSec: number }>,
): InfrastructureMonitorItem[] {
  if (!event) return [];
  const phase = resolveDemoTwin(activeDemoTwin, simSec, event.id)?.phase;
  const activeIds = new Set(phase?.activeDeviceIds ?? []);
  const offlineIds = new Set(environment.offlineDeviceIds);
  const ventilation = phase?.ventilation;

  return DEVICES
    .filter((device) => device.road === event.road && Math.abs(device.kp - event.accidentKp) <= rangeKm)
    .map((device): InfrastructureMonitorItem => {
      const offline = !device.online || offlineIds.has(device.id);
      const commandSync = commandEffects?.get(device.id);
      const issued = activeIds.has(device.id) || Boolean(commandSync) || (phase?.traffic.closureActive === true && ['traffic_signal', 'lane_signal'].includes(device.kind));
      const linkStatus: InfrastructureLinkStatus = offline ? 'offline' : 'online';
      return {
        device,
        zone: zoneOf(event, device),
        chainageCellStart: Math.floor(device.kp),
        distanceKm: Number(Math.abs(device.kp - event.accidentKp).toFixed(1)),
        linkStatus,
        workStatus: offline ? 'fault' : issued ? 'issued' : 'normal',
        displayContent: offline
          ? '通信中断·待核实'
          : commandSync?.displayContent ?? contentFor(device, event, issued, phase?.traffic.closureActive === true, phase?.diversion?.label, ventilation),
        contentTone: commandSync?.contentTone ?? toneFor(device, linkStatus, issued, phase?.traffic.closureActive === true),
        updatedAtSimSec: simSec,
        source: 'demo',
        commandSync,
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm || a.device.id.localeCompare(b.device.id));
}
