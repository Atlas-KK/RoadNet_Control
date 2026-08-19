// ============================================================
// 资源静态数据（开发规格 §3.3）
// 清障车 / 救护车 / 路政班组 / 消防。
// 资源对象携带：status、occupiedBy?（占用方事件 ID，落地建议摸底项）、
// 车程函数 etaMinTo(kp)（按 75 km/h 计）。
// 运行期可变的 status/occupiedBy/currentKp 由 store 驱动，此处给出初值与静态参数。
// ============================================================

import { routeDistanceKm, segDistance } from './network';
import type { RoadId } from './network';

export type ResourceKind = 'wrecker' | 'ambulance' | 'patrol' | 'fire';
export type ResourceStatus = 'idle' | 'enroute' | 'working';

export interface Resource {
  id: string;
  kind: ResourceKind;
  label: string;
  road: RoadId;
  homeKp: number; // 驻点桩号
  status: ResourceStatus;
  occupiedBy?: string; // 占用方事件 ID —— 跨事件推理第二跳的关键字段
  currentKp?: number; // 运行期当前位置（移动动画用），默认在驻点
  crossJurisdiction?: boolean; // 跨辖区资源
  station: string; // 所属驻点/单位
  contact: string; // 值守联系人
  phone: string; // 值守联系电话
  /** 车程行驶速度 km/h（默认 75） */
  driveSpeed: number;
  /** 跨区调度协调固定开销（分钟），仅跨辖区资源 */
  coordMin?: number;
  /** 固定响应时间（分钟），用于消防站等按固定响应计的资源 */
  fixedResponseMin?: number;
  /** 固定车程（分钟），用于跨辖区约定行程 */
  fixedDriveMin?: number;
}

export const RESOURCES: Resource[] = [
  // 大型清障车（本辖区仅有两台，§3.3）
  { id: 'W-01', kind: 'wrecker', label: '大型清障车 W-01', road: 'G65', homeKp: 1150, status: 'idle', driveSpeed: 75, station: '北郊养护工区', contact: '杨师傅', phone: '029-0000-0101' },
  { id: 'W-02', kind: 'wrecker', label: '大型清障车 W-02', road: 'G65', homeKp: 1150, status: 'idle', driveSpeed: 75, station: '北郊养护工区', contact: '周师傅', phone: '029-0000-0102' },
  { id: 'W-S01', kind: 'wrecker', label: '大型清障车 W-S01', road: 'G65S', homeKp: 1232, status: 'idle', driveSpeed: 75, station: '太乙宫养护点', contact: '南段值守', phone: '029-0000-0301' },
  // 跨辖区清障车：到 G65 任意点按 40 min 车程 + 8 min 跨区调度协调计
  {
    id: 'W-EX',
    kind: 'wrecker',
    label: '大型清障车 W-EX（跨辖区）',
    road: 'G65',
    homeKp: 1120, // 邻区工区（K1130 以西）
    status: 'idle',
    driveSpeed: 75,
    crossJurisdiction: true,
    coordMin: 8,
    fixedDriveMin: 40,
    station: '邻区联合清障站',
    contact: '李师傅',
    phone: '029-0000-0199',
  },
  // 救护车（120 联动）
  { id: 'A-01', kind: 'ambulance', label: '救护车 A-01（120 联动）', road: 'G65', homeKp: 1185, status: 'idle', driveSpeed: 75, station: 'G65 急救联动点', contact: '120 调度台', phone: '120' },
  // 路政班组
  { id: 'L-01', kind: 'patrol', label: '路政班组 L-01', road: 'G65', homeKp: 1150, status: 'idle', driveSpeed: 75, station: '北郊路政中队', contact: '一班值守', phone: '029-0000-0201' },
  { id: 'L-02', kind: 'patrol', label: '路政班组 L-02', road: 'G65', homeKp: 1150, status: 'idle', driveSpeed: 75, station: '北郊路政中队', contact: '二班值守', phone: '029-0000-0202' },
  // 消防站（经 K1148 收费站入，响应 18 min）
  { id: 'F-STA', kind: 'fire', label: '消防站 F-STA', road: 'G65', homeKp: 1148, status: 'idle', driveSpeed: 75, fixedResponseMin: 18, station: 'K1148 消防联勤站', contact: '119 调度台', phone: '119' },
  { id: 'F-ZNS', kind: 'fire', label: '消防联勤 F-ZNS', road: 'G65S', homeKp: 1278, status: 'idle', driveSpeed: 75, fixedResponseMin: 22, station: '营盘消防联勤点', contact: '119 调度台', phone: '119' },
];

/**
 * 资源到达某桩号的车程（分钟，§3.3）。
 * - 固定响应型（消防）直接返回 fixedResponseMin；
 * - 跨辖区资源额外加 coordMin 协调开销；
 * - 其余按 distance / driveSpeed 计。
 * 便于运行期处置与推理引擎复用；不改变资源对象自身状态。
 */
export function etaMinTo(res: Resource, targetKp: number, fromKp?: number, targetRoad?: RoadId, fromRoad?: RoadId): number {
  if (res.fixedResponseMin != null) return res.fixedResponseMin;
  const origin = fromKp ?? res.currentKp ?? res.homeKp;
  const driveDistance = targetRoad
    ? routeDistanceKm(fromRoad ?? res.road, origin, targetRoad, targetKp)
    : segDistance(origin, targetKp);
  const driveMin = res.fixedDriveMin ?? (driveDistance / res.driveSpeed) * 60;
  return driveMin + (res.crossJurisdiction ? res.coordMin ?? 0 : 0);
}

/** 按资源唯一 id 查询静态资源；未找到时由调用方决定回退策略。 */
export function resourceById(id: string): Resource | undefined {
  return RESOURCES.find((r) => r.id === id);
}
