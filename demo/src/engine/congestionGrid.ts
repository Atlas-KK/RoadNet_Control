// ============================================================
// 事故上下游拥堵网格计算。
// 该模块不访问 UI 或 store，只把事件状态和模拟时刻转换为可渲染的公里格数据，
// 便于单元测试复核“排队扩散方向、等级边界和处置闭环恢复”等业务规则。
// ============================================================

import { queueLength } from './flowModel';
import { resolveTrafficResponse, type TrafficResponseStage } from './trafficResponse';
import type { Plan } from '../domain/plan';

/** 单个公里格的语义等级；recovered 仅用于处置闭环后的事故点。 */
export type CongestionLevel = 'free' | 'slow' | 'congested' | 'severe' | 'incident' | 'recovered';

/** 生成拥堵网格所需的最小事件快照，刻意与全局 SimEvent 解耦。 */
export interface CongestionGridEvent {
  /** 事件桩号，网格 offset=0 的空间基准。 */
  accidentKp: number;
  /** 事件进入系统时的相对模拟秒数。 */
  startSimSec: number;
  /** 流模型是否判定需求流量超过瓶颈能力。 */
  congested: boolean;
  /** 排队尾部向上游回溯的速度，单位 km/h。 */
  w: number;
  lanesClosed: number;
  lanesTotal: number;
  finalized?: boolean;
  /** 自由流速度；缺省时按 G65 样例参数 110km/h。 */
  vf?: number;
}

/** 单个 1km 网格的展示数据。offsetKm<0 表示上游，>0 表示下游。 */
export interface CongestionCell {
  offsetKm: number;
  kp: number;
  level: CongestionLevel;
  /** 当前按等级估算速度，不代表实时检测器实测值。 */
  speedKph: number;
}

/** 一次网格计算的完整结果，包含格子数据及面板摘要指标。 */
export interface CongestionGridResult {
  cells: CongestionCell[];
  elapsedMin: number;
  queueLengthKm: number;
  queueTailKp: number;
  responseStage: TrafficResponseStage;
}

/**
 * 将事件演变状态投影为事故点前后固定半径的 1km 网格。
 *
 * 规则约定：
 * - 负偏移为上游，排队按 w×t 向负方向扩散；
 * - 排队内部靠近事故点的 42% 标为严重拥堵，其余标为拥堵；
 * - 队尾外再保留 1km 缓行过渡格，避免颜色突变；
 * - 下游影响范围按占道比例估算，至少保留 1km 缓行；
 * - 处置闭环后清空拥堵，只在事故点显示“已恢复”。
 *
 * @param event 参与计算的事件快照。
 * @param simSec 当前场景相对模拟秒数。
 * @param radiusKm 事故点单侧显示半径，默认 10km。
 */
export function buildCongestionGrid(
  event: CongestionGridEvent,
  simSec: number,
  radiusKm = 10,
  plans: Plan[] = [],
): CongestionGridResult {
  const elapsedMin = Math.max(0, (simSec - event.startSimSec) / 60);
  const response = resolveTrafficResponse(event, plans, simSec, radiusKm);
  // 可视半径是 UI 上限；真实排队即使更长也只显示到当前窗口边界。
  const queueLengthKm = plans.length > 0
    ? response.queueLengthKm
    : event.congested && !event.finalized
      ? Math.min(radiusKm, Math.max(0, queueLength(event.w, elapsedMin)))
      : 0;
  const vf = event.vf ?? 110;
  // 下游不使用排队激波模型，以占道比例估算短距离消散影响区。
  const downstreamInfluenceKm = Math.max(1, Math.ceil((event.lanesClosed / event.lanesTotal) * 3));

  const cells: CongestionCell[] = [];
  for (let offsetKm = -radiusKm; offsetKm <= radiusKm; offsetKm += 1) {
    let level: CongestionLevel = 'free';
    let speedKph = vf;

    if (event.finalized) {
      level = offsetKm === 0 ? 'recovered' : 'free';
      speedKph = vf;
    } else if (offsetKm === 0) {
      level = 'incident';
      speedKph = 0;
    } else if (offsetKm < 0) {
      // 上游方向：先判定是否落在排队主体内，再判定是否位于队尾缓行过渡区。
      const upstreamDistance = Math.abs(offsetKm);
      if (upstreamDistance <= queueLengthKm) {
        const positionRatio = queueLengthKm > 0 ? upstreamDistance / queueLengthKm : 1;
        level = positionRatio <= 0.42 ? 'severe' : 'congested';
        speedKph = level === 'severe' ? 12 : 28;
      } else if (upstreamDistance <= queueLengthKm + 1) {
        level = 'slow';
        speedKph = 48;
      }
    } else if (offsetKm <= downstreamInfluenceKm) {
      // 下游车辆已通过事故点，统一按缓行展示，不与上游排队等级混用。
      level = 'slow';
      speedKph = 60;
    }

    cells.push({
      offsetKm,
      kp: event.accidentKp + offsetKm,
      level,
      speedKph,
    });
  }

  return {
    cells,
    elapsedMin,
    queueLengthKm,
    queueTailKp: event.accidentKp - queueLengthKm,
    responseStage: plans.length > 0 ? response.stage : event.finalized ? 'recovered' : 'growing',
  };
}
