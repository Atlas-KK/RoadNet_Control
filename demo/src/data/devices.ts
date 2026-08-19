// ============================================================
// 设备静态数据（开发规格 §3.2）
// 情报板 / 隧道风机组 / 风向传感器 / 摄像机。
// 每台设备有 online 状态，运行期可按设备状态裁剪可执行措施。
// ============================================================

import type { RoadId } from './network';

export type DeviceKind = 'vms' | 'traffic_signal' | 'lane_signal' | 'fan' | 'wind_sensor' | 'camera';

export interface Device {
  id: string;
  kind: DeviceKind;
  road: RoadId;
  kp: number;
  online: boolean;
  note?: string;
  /** 风机排风方向（仅 fan）：正向=入口→出口 / 反向 */
  fanDir?: 'forward' | 'reverse';
  /** 信号灯、车道指示灯等沿行车方向服务的车道；未标注时表示全断面。 */
  lane?: number;
}

export const DEVICES: Device[] = [
  // ---- 情报板 VMS ----
  { id: 'VMS-01', kind: 'vms', road: 'G65', kp: 1150, online: true },
  { id: 'VMS-02', kind: 'vms', road: 'G65', kp: 1162, online: true, note: '枢纽下游侧' },
  {
    id: 'VMS-03',
    kind: 'vms',
    road: 'G65',
    kp: 1172,
    online: true,
    note: '位于易发团雾区内，用于「雾区内设备不可作为封道执行点」的裁剪',
  },
  { id: 'VMS-04', kind: 'vms', road: 'G65', kp: 1174.5, online: true, note: '事故区上游近端诱导屏（演示）' },
  { id: 'VMS-05', kind: 'vms', road: 'G65', kp: 1168, online: true, note: '场景 S3 封道执行点' },
  { id: 'VMS-06', kind: 'vms', road: 'G65', kp: 1205, online: true, note: '场景 S2 用' },
  { id: 'VMS-07', kind: 'vms', road: 'G65', kp: 1188, online: true, note: '事故区上游诱导屏（演示）' },
  { id: 'VMS-08', kind: 'vms', road: 'G65', kp: 1198, online: true, note: '事故区下游提示屏（演示）' },
  { id: 'VMS-1230', kind: 'vms', road: 'G65S', kp: 1230, online: true, note: '隧道群上游预告' },
  { id: 'VMS-1250', kind: 'vms', road: 'G65S', kp: 1250, online: true, note: '终南山隧道入口预告' },
  { id: 'VMS-G56-01', kind: 'vms', road: 'G56', kp: 24, online: true },

  // ---- 信号灯 / 车道指示灯（动态演示台账）----
  { id: 'SIG-1140', kind: 'traffic_signal', road: 'G65', kp: 1140, online: true, note: '枢纽提前分流信号控制点' },
  { id: 'SIG-1162', kind: 'traffic_signal', road: 'G65', kp: 1162, online: true, note: '上游匝道口信号控制点' },
  { id: 'SIG-1184', kind: 'traffic_signal', road: 'G65', kp: 1184, online: true, note: '事故区下游警示信号点' },
  { id: 'LCS-1168-1', kind: 'lane_signal', road: 'G65', kp: 1168, lane: 1, online: true, note: '上游第一车道指示灯' },
  { id: 'LCS-1168-2', kind: 'lane_signal', road: 'G65', kp: 1168, lane: 2, online: true, note: '上游第二车道指示灯' },
  { id: 'LCS-1178-1', kind: 'lane_signal', road: 'G65', kp: 1178, lane: 1, online: true, note: '隧道出口第一车道指示灯' },
  { id: 'LCS-1192-2', kind: 'lane_signal', road: 'G65', kp: 1192, lane: 2, online: true, note: '下游第二车道指示灯' },
  { id: 'SIG-G56-27', kind: 'traffic_signal', road: 'G56', kp: 27, online: true, note: 'G56 汇入控制信号点' },
  { id: 'LCS-G56-27-1', kind: 'lane_signal', road: 'G56', kp: 27, lane: 1, online: true, note: 'G56 汇入车道指示灯' },

  // ---- 隧道风机组 / 风向传感器（青云隧道） ----
  {
    id: 'FAN-01',
    kind: 'fan',
    road: 'G65',
    kp: 1176.7,
    online: true,
    fanDir: 'forward',
    note: '青云隧道入口侧 0.7km 处纵向风机组；案例三正向排风将洞内气流导向出口侧',
  },
  {
    id: 'WD-01',
    kind: 'wind_sensor',
    road: 'G65',
    kp: 1177.2,
    online: true,
    note: '青云隧道事故邻近风向传感器，提供洞内自然风向与风速',
  },
  { id: 'FAN-ZNS', kind: 'fan', road: 'G65S', kp: 1264, online: true, fanDir: 'forward', note: '终南山隧道纵向风机组' },
  { id: 'WD-ZNS', kind: 'wind_sensor', road: 'G65S', kp: 1264, online: true, note: '终南山隧道风向传感器' },

  // ---- 摄像机（仅作事件来源标注，不做视频） ----
  { id: 'CAM-1195', kind: 'camera', road: 'G65', kp: 1195, online: true, note: '事件来源标注' },
  { id: 'CAM-1180', kind: 'camera', road: 'G65', kp: 1180, online: true, note: '事件来源标注' },
  { id: 'CAM-1177', kind: 'camera', road: 'G65', kp: 1177.2, online: true, note: '隧道内' },
  { id: 'CAM-1240', kind: 'camera', road: 'G65S', kp: 1240, online: true, note: '秦岭隧道群' },
  { id: 'CAM-1264', kind: 'camera', road: 'G65S', kp: 1264, online: true, note: '终南山隧道洞内' },
  { id: 'CAM-1278', kind: 'camera', road: 'G65S', kp: 1278, online: true, note: '营盘互通' },
];

/** 按设备唯一 id 查询静态设备；不隐式回退，避免把指令下发到错误设备。 */
export function deviceById(id: string): Device | undefined {
  return DEVICES.find((d) => d.id === id);
}

/**
 * 返回距给定位置最近的在线摄像机 id。
 * 仅在同道路内选择，避免摄像机联动跨道路跳转而误导值班人员。
 */
export function nearestCameraId(road: RoadId, kp: number): string | undefined {
  return DEVICES
    .filter((device) => device.road === road && device.kind === 'camera' && device.online)
    .sort((a, b) => Math.abs(a.kp - kp) - Math.abs(b.kp - kp))[0]?.id;
}
