// ============================================================
// 条件求值器（开发规格 MVP · FR-B3 / 产品方案 3.3.1、附录 A 案例三）
// 由事件属性 + 环境状态 + 时钟求值「约束/条件节点」集合，并派生两类推理效应：
//   ① 对目标事理边加权（团雾 ×2.2 作用于 [后方拥堵→二次事故风险]）；
//   ② 向措施挂约束（团雾激活 → 全幅封道受「雾区内禁设封道执行点」约束）。
//
// 组合语义是「跃迁而非叠加」：条件节点独立求值，激活集合在推理时动态组合，
// 而非预先枚举千百种组合（附录 A 案例三核心）。纯函数，便于单测与运行模式共用。
// ============================================================

import type { RoadId } from '../data/network';
import { tunnelAt } from '../data/network';

/** 路段区间（团雾带等）。 */
export interface KpBand {
  road: RoadId;
  fromKp: number;
  toKp: number;
}

/** 环境状态：运行模式可实时切换（雾区、设备离线）。 */
export interface EnvironmentState {
  fogBands: KpBand[];
  offlineDeviceIds: string[];
}

export const EMPTY_ENVIRONMENT: EnvironmentState = { fogBands: [], offlineDeviceIds: [] };

/** 条件求值输入。 */
export interface ConditionContext {
  road: RoadId;
  accidentKp: number;
  hazmat?: boolean;
  /** 当日绝对秒（sceneBaseSec + simSec），用于夜间判定。 */
  simSecOfDay: number;
  env: EnvironmentState;
}

/** 一个被激活的条件节点。 */
export interface ActiveCondition {
  nodeId: string; // 与 graphSchema 约束节点 id 对齐，如 'C_团雾'
  detail: string;
}

/** 目标事理边的加权修饰。 */
export interface EdgeWeightModifier {
  targetEdge: string; // 图谱边 id，如 'se2'（后方拥堵→二次事故风险）
  factor: number;
  reason: string;
}

/** 挂到措施上的约束。 */
export interface MeasureConstraint {
  measureId: string;
  constraintNodeId: string; // 如 'C_雾区禁封'
  reason: string;
}

export interface ConditionResult {
  active: ActiveCondition[];
  edgeModifiers: EdgeWeightModifier[];
  constraints: MeasureConstraint[];
}

/** 夜间时段：22:00–06:00（跨零点）。 */
function isNight(simSecOfDay: number): boolean {
  const h = (Math.floor(simSecOfDay / 3600) % 24 + 24) % 24;
  return h >= 22 || h < 6;
}

/** 团雾是否落在事故的作业邻域内（上游 10km 至下游 2km，排队与封道点都在上游）。 */
function fogInVicinity(ctx: ConditionContext): KpBand | undefined {
  const lo = ctx.accidentKp - 10;
  const hi = ctx.accidentKp + 2;
  return ctx.env.fogBands.find(
    (b) => b.road === ctx.road && b.toKp >= lo && b.fromKp <= hi,
  );
}

/**
 * 求值当前成立的条件集合，并派生边加权与措施约束。
 * 组合效应示例（S3）：危化品∧隧道 → 有毒气体聚集风险；团雾 → 二次事故边 ×2.2 +
 * 全幅封道挂「雾区内禁设封道执行点」。
 */
export function evaluateConditions(ctx: ConditionContext): ConditionResult {
  const active: ActiveCondition[] = [];
  const edgeModifiers: EdgeWeightModifier[] = [];
  const constraints: MeasureConstraint[] = [];

  if (ctx.hazmat) {
    active.push({ nodeId: 'C_危化品', detail: '事件属性：危化品' });
  }
  const tunnel = tunnelAt(ctx.road, ctx.accidentKp);
  if (tunnel) {
    active.push({ nodeId: 'C_隧道', detail: `${tunnel.id} K${tunnel.fromKp}–K${tunnel.toKp}` });
  }
  const fog = fogInVicinity(ctx);
  if (fog) {
    active.push({ nodeId: 'C_团雾', detail: `团雾带 K${fog.fromKp}–K${fog.toKp}` });
    // 团雾对「后方拥堵→二次事故风险」顺承边加权 ×2.2（graphSchema 边 se2）。
    edgeModifiers.push({ targetEdge: 'se2', factor: 2.2, reason: '团雾提升二次事故风险' });
    // 团雾激活「雾区内禁设封道执行点」，挂到全幅封道。
    constraints.push({ measureId: 'M_全封', constraintNodeId: 'C_雾区禁封', reason: '封道执行点须落雾区外' });
  }
  if (isNight(ctx.simSecOfDay)) {
    active.push({ nodeId: 'C_夜间', detail: '夜间时段（22:00–06:00）' });
  }
  if (ctx.env.offlineDeviceIds.length > 0) {
    active.push({ nodeId: 'C_设备离线', detail: `离线设备 ${ctx.env.offlineDeviceIds.join('、')}` });
  }

  return { active, edgeModifiers, constraints };
}
