// ============================================================
// 变长枢纽遍历与自引用检测（开发规格 MVP · FR-B5 / 附录 A 案例五）
// 排队沿缓存拓扑向上游逐枢纽回溯（最大深度 2）；每到一个枢纽用流模型算排队到达时间；
// 若命中「当前有效预案的分流承接线经过该枢纽下游交叉线」→ 自引用冲突 →
// 方案自我失效 → 输出改上游更早分流的重构建议（含行动窗口）。
//
// 自引用是决策表的形式化盲区：规则条件无法引用「本次决策的中间产物」（当前方案内容），
// 而图/拓扑遍历是原生操作。纯函数，便于单测。
// ============================================================

import type { RoadId } from '../data/network';

/** 枢纽互通：其下游交叉线可能正是本事件方案的分流承接道路。 */
export interface HubSpec {
  id: string;
  road: RoadId;
  kp: number;
  /** 该枢纽连接/波及的交叉道路（如 K1160 枢纽 → G56）。 */
  crossRoad: RoadId;
}

export interface TraversalInput {
  event: { road: RoadId; accidentKp: number; w: number };
  /** 沿上游排列的枢纽（桩号递减方向）。 */
  hubsUpstream: HubSpec[];
  /** 当前有效预案的分流承接道路（如 G56）；用于自引用检测。 */
  currentDiversionConnector?: RoadId;
  /** 最大遍历深度（枢纽数），默认 2。 */
  maxDepth?: number;
}

export interface HubReach {
  hub: HubSpec;
  tReachMin: number;
}

export interface TraversalResult {
  reaches: HubReach[];
  /** 命中自引用冲突的枢纽（其交叉线 = 当前分流承接线）。 */
  selfReference?: { hub: HubSpec; reason: string };
  /** 行动窗口（分钟）= 排队到达自引用枢纽的时间。 */
  actionWindowMin?: number;
  recommendation: string;
}

/**
 * 向上游遍历枢纽，检测分流承接线自引用冲突。
 * 排队到达某枢纽时间 T = dist(事故点 → 枢纽) / w。
 */
export function traverseUpstreamHubs(input: TraversalInput): TraversalResult {
  const maxDepth = input.maxDepth ?? 2;
  const reaches: HubReach[] = [];
  let selfReference: TraversalResult['selfReference'];
  let actionWindowMin: number | undefined;

  const hubs = input.hubsUpstream
    .filter((h) => h.road === input.event.road && h.kp < input.event.accidentKp)
    .sort((a, b) => b.kp - a.kp) // 从最近的上游枢纽开始
    .slice(0, maxDepth);

  for (const hub of hubs) {
    const tReachMin = ((input.event.accidentKp - hub.kp) / input.event.w) * 60;
    reaches.push({ hub, tReachMin });
    if (!selfReference && input.currentDiversionConnector && hub.crossRoad === input.currentDiversionConnector) {
      selfReference = {
        hub,
        reason: `${hub.crossRoad} 为本事件当前方案的分流承接线 → 分流通道将被本事故自身拥堵掐断（自引用）`,
      };
      actionWindowMin = tReachMin;
    }
  }

  const recommendation = selfReference
    ? `方案自我失效：在 ${actionWindowMin!.toFixed(1)}min 行动窗口内改上游更早分流（如 K1140 提前分流）`
    : '未检出自引用冲突，当前分流方案可维持';

  return { reaches, selfReference, actionWindowMin, recommendation };
}
