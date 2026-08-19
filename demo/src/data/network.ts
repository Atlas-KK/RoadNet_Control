// ============================================================
// 跨业务模块共用的道路基础类型与距离工具。
// 具体 GIS 几何集中在 gis/xiAnRing.ts，避免同时维护两套路网定义。
// ============================================================

export type RoadId = 'G65' | 'G65S' | 'G56' | 'S204';

/** 计算路网上两点沿路的距离（km，绝对值）——同路适用 */
export function segDistance(kpA: number, kpB: number): number {
  return Math.abs(kpA - kpB);
}

/**
 * 计算跨道路枢纽的最短演示路程，避免把不同道路的桩号直接相减。
 * 当前运行版明确建模 G65 K1160 ↔ G56 K27 这一分流连接关系。
 */
export function routeDistanceKm(fromRoad: RoadId, fromKp: number, targetRoad: RoadId, targetKp: number): number {
  if (fromRoad === targetRoad) return segDistance(fromKp, targetKp);
  if (fromRoad === 'G65' && targetRoad === 'G56') return segDistance(fromKp, 1160) + segDistance(27, targetKp);
  if (fromRoad === 'G56' && targetRoad === 'G65') return segDistance(fromKp, 27) + segDistance(1160, targetKp);
  return segDistance(fromKp, targetKp);
}

/** 隧道段（开发规格 §3.1）：条件求值与封道点模板依赖其入口/出口桩号。 */
export interface TunnelSpec {
  id: string;
  road: RoadId;
  fromKp: number; // 入口（桩号小侧）
  toKp: number; // 出口（桩号大侧）
}

export const TUNNELS: TunnelSpec[] = [
  { id: '青云隧道', road: 'G65', fromKp: 1176.0, toKp: 1178.4 },
  { id: '秦岭1号隧道', road: 'G65S', fromKp: 1238, toKp: 1241 },
  { id: '秦岭2号隧道', road: 'G65S', fromKp: 1243, toKp: 1246 },
  { id: '终南山特长隧道', road: 'G65S', fromKp: 1255, toKp: 1273 },
];

/** 返回包含给定桩号的隧道（若在洞内）。 */
export function tunnelAt(road: RoadId, kp: number): TunnelSpec | undefined {
  return TUNNELS.find((t) => t.road === road && kp >= t.fromKp && kp <= t.toKp);
}

/**
 * 枢纽互通：其下游交叉线可能正是某起事件方案的分流承接道路。
 * 静态路网设施，供 engine（自引用检测、附录A·案例五）与 gis（地图标注、预测兑现判定）
 * 共同消费；置于 data 层以保持「gis 依赖 engine，两者都依赖 data」的单向分层。
 */
export interface HubSpec {
  id: string;
  road: RoadId;
  kp: number;
  crossRoad: RoadId;
  label: string;
}

export const HUBS: HubSpec[] = [
  { id: 'K1160枢纽', road: 'G65', kp: 1160, crossRoad: 'G56', label: 'K1160 枢纽' },
];
