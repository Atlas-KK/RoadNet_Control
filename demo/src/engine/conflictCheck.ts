// ============================================================
// 跨事件分流冲突校验（开发规格 MVP · FR-B2 / demo-spec §5.4 / 附录 A 案例一）
// 分流承接路径指向另一起正在处置的事件时，比较「A 分流车流到达汇入区」与
// 「B 拥堵覆盖汇入区」两条时间线，若时间窗重叠则裁剪该分流路径。
//
// SPEC-DEVIATION: demo-spec §5.4 将重叠条件写作「T_arrive ≥ T_conflict − 缓冲」，
// 与附录 A 案例一及 S1 脚本的结论（T_conflict=24 ≥ T_arrive=18 → 重叠 → 裁剪）相反，
// 系原文倒装。此处按正确语义实现：A 持续汇入，只要 B 的拥堵在 A 到达（减缓冲）之后
// 覆盖汇入区即构成重叠，即 overlap ⇔ T_conflict ≥ T_arrive − 缓冲。
// ============================================================

import type { RoadId } from '../data/network';

/** 参与冲突校验的活跃事件最小视图。 */
export interface ActiveEventLite {
  id: string;
  road: RoadId;
  accidentKp: number;
  /** 排队回溯速度 km/h（流模型算得）。 */
  w: number;
  congested: boolean;
}

/** 候选分流路径描述。 */
export interface DiversionPath {
  /** 承接道路（如 G56）。 */
  connectorRoad: RoadId;
  /** 承接汇入区桩号（A 车流并入承接道路之处，如 G56 K27）。 */
  mergeKp: number;
  /** A 分流车流到达汇入区的路径距离（km）。 */
  pathDistanceKm: number;
  /** 建议车速 km/h。 */
  suggestedSpeedKmh: number;
}

/** 时间窗重叠缓冲（分钟）。 */
export const CONFLICT_BUFFER_MIN = 5;
/** 锚点索引分桶粒度（km）。 */
export const ANCHOR_BUCKET_KM = 1;

/** 活跃实例锚点索引：Map<`road:kpBucket`, eventId[]>，供「路段集合 → 命中活跃事件」反查。 */
export function buildAnchorIndex(events: ActiveEventLite[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const ev of events) {
    const bucket = Math.floor(ev.accidentKp / ANCHOR_BUCKET_KM);
    const key = `${ev.road}:${bucket}`;
    const list = index.get(key) ?? [];
    list.push(ev.id);
    index.set(key, list);
  }
  return index;
}

export interface ConflictResult {
  status: 'pass' | 'conflict';
  conflictEventId?: string;
  tConflictMin?: number;
  tArriveMin?: number;
  reason: string;
}

/**
 * 校验候选分流路径是否与承接道路上的活跃拥堵事件时间窗重叠。
 * 命中承接道路上、位于汇入区下游（桩号更大）的拥堵事件 B，其队尾向上游回溯，
 * 覆盖汇入区所需时间 T_conflict = (B.accidentKp − mergeKp) / w_B；
 * A 到达汇入区时间 T_arrive = 路径距离 / 建议车速；
 * overlap ⇔ T_conflict ≥ T_arrive − 缓冲 → 裁剪。
 */
export function checkDiversionConflict(path: DiversionPath, activeEvents: ActiveEventLite[]): ConflictResult {
  // 反查承接道路上、汇入区下游、正在拥堵的活跃事件（其队尾会回溯覆盖汇入区）。
  const blocker = activeEvents.find(
    (ev) => ev.road === path.connectorRoad && ev.congested && ev.accidentKp > path.mergeKp && ev.w > 0,
  );
  const tArriveMin = (path.pathDistanceKm / path.suggestedSpeedKmh) * 60;
  if (!blocker) {
    return { status: 'pass', tArriveMin, reason: '承接路径上无活跃拥堵事件，分流可行' };
  }
  const tConflictMin = ((blocker.accidentKp - path.mergeKp) / blocker.w) * 60;
  const overlap = tConflictMin >= tArriveMin - CONFLICT_BUFFER_MIN;
  if (overlap) {
    return {
      status: 'conflict',
      conflictEventId: blocker.id,
      tConflictMin,
      tArriveMin,
      reason: `与 ${blocker.id} 时间窗重叠：T_conflict=${tConflictMin.toFixed(1)}min ≥ T_arrive=${tArriveMin.toFixed(1)}min − ${CONFLICT_BUFFER_MIN} → 裁剪该分流，取备选路径`,
    };
  }
  return {
    status: 'pass',
    conflictEventId: blocker.id,
    tConflictMin,
    tArriveMin,
    reason: `与 ${blocker.id} 时间窗不重叠（T_conflict=${tConflictMin.toFixed(1)}min < T_arrive − 缓冲），分流可行`,
  };
}
