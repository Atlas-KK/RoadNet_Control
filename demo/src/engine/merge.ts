// ============================================================
// 事件归并引擎（开发规格 MVP · FR-A3 / 产品方案 2.6）
// 对两份标准化事件报告做多维匹配评分，按三档置信度给出处置决策；
// 关键字段冲突（伤亡/车辆数/危化品标志/位置漂移>1km）一律强制拆分。
//
// 纯函数、无状态、无副作用，便于单测与场景/运行模式共用。
// 归并「宁可重复、不可漏报」：错误归并会漏处置（安全问题），重复预案只是效率问题，
// 故阈值偏保守，且硬规则优先于分数。
// ============================================================

import type { RoadId } from '../data/network';

/** 行车方向：上行(桩号增)/下行/未知。 */
export type TravelDirection = 'up' | 'down' | 'unknown';

/** 一份标准化事件报告——归并引擎的输入单元。 */
export interface EventReport {
  /** 报告来源标签，如 'CAM 视频检出'、'12122 电话报警'。 */
  sourceLabel: string;
  road: RoadId;
  kp: number;
  /** 图谱事件类型节点，如 'E_追尾'；电话报警可能为泛化的 'E_事故'。 */
  typeNodeId: string;
  direction?: TravelDirection;
  /** 相对场景基准的上报模拟秒数。 */
  reportedAtSimSec: number;
  /** 关键字段：缺省表示该来源未提供（不构成冲突）。 */
  casualties?: number;
  vehicles?: number;
  hazmat?: boolean;
}

/** 归并档位：自动归并 / 中置信并案标记 / 不归并。 */
export type MergeTier = 'auto' | 'caseLink' | 'separate';

/** 单维得分明细（供界面「匹配得分明细」渲染）。 */
export interface MergeScoreRow {
  dim: string;
  detail: string;
  score: number;
}

/** 归并判定结果。 */
export interface MergeDecision {
  total: number;
  tier: MergeTier;
  /** 人类可读结论，如「高置信 → 自动归并」。 */
  decision: string;
  scoreRows: MergeScoreRow[];
  /** 触发强制拆分的关键字段冲突清单；非空则一律拆分。 */
  conflictFields: string[];
}

/**
 * 归并阈值与权重（初值，集中常量便于后续按历史数据标定）。
 * 权重取自 FR-A3：空间 0.35 + 时间 0.25 + 类型 0.25 + 方向 0.15。
 */
export const MERGE_CONFIG = {
  weights: { space: 0.35, time: 0.25, type: 0.25, direction: 0.15 },
  autoThreshold: 0.75,
  caseLinkThreshold: 0.45,
  /** 位置漂移超过该值（km）视为关键字段冲突。 */
  positionDriftKm: 1,
};

/** 事故类电话报警等泛化类型与具体类型相容映射（相容得 0.7）。 */
const COMPATIBLE_TYPES: Record<string, string[]> = {
  E_事故: ['E_追尾', 'E_侧翻', 'E_危化泄漏'],
};

function typesCompatible(a: string, b: string): boolean {
  if (a === b) return false; // 完全相同不算「相容」，走满分分支
  return (COMPATIBLE_TYPES[a]?.includes(b) ?? false) || (COMPATIBLE_TYPES[b]?.includes(a) ?? false);
}

function scoreSpace(a: EventReport, b: EventReport): MergeScoreRow {
  if (a.road !== b.road) {
    return { dim: '空间（路×桩号）', detail: `异路 ${a.road}/${b.road}`, score: 0 };
  }
  const dk = Math.abs(a.kp - b.kp);
  const score = dk <= 1 ? 1 : dk <= 3 ? 0.6 : 0;
  return { dim: '空间（路×桩号）', detail: `同路 ${a.road} · ΔK=${dk.toFixed(1)}km`, score };
}

function scoreTime(a: EventReport, b: EventReport): MergeScoreRow {
  const dtSec = Math.abs(a.reportedAtSimSec - b.reportedAtSimSec);
  const dtMin = dtSec / 60;
  const score = dtMin <= 5 ? 1 : dtMin <= 15 ? 0.5 : 0;
  const detail = dtSec < 90 ? `Δt=${Math.round(dtSec)}s` : `Δt=${dtMin.toFixed(1)}min`;
  return { dim: '时间（上报时差）', detail, score };
}

function scoreType(a: EventReport, b: EventReport): MergeScoreRow {
  const score = a.typeNodeId === b.typeNodeId ? 1 : typesCompatible(a.typeNodeId, b.typeNodeId) ? 0.7 : 0;
  const detail = a.typeNodeId === b.typeNodeId
    ? `${a.typeNodeId} = ${b.typeNodeId}`
    : score > 0 ? `${a.typeNodeId} ~ ${b.typeNodeId}（相容）` : `${a.typeNodeId} ≠ ${b.typeNodeId}`;
  return { dim: '事件类型', detail, score };
}

function scoreDirection(a: EventReport, b: EventReport): MergeScoreRow {
  const da = a.direction ?? 'unknown';
  const db = b.direction ?? 'unknown';
  let score: number;
  let detail: string;
  if (da === 'unknown' || db === 'unknown') {
    score = 0.8;
    detail = '方向未知（存疑从宽）';
  } else if (da === db) {
    score = 1;
    detail = `同向（${da === 'up' ? '上行' : '下行'}）`;
  } else {
    score = 0;
    detail = '反向';
  }
  return { dim: '行车方向', detail, score };
}

/**
 * 检出两报告之间的语义关键字段冲突（两侧均有值且不一致才算冲突）。
 * 用于归并评分时的硬规则：同点报告若伤亡/车辆/危化品标志矛盾，可能是两起独立事件，
 * 一律强制拆分。位置分离不在此列——它已由空间得分带（≤3km→0.6）表达。
 */
export function keyFieldConflicts(a: EventReport, b: EventReport): string[] {
  const conflicts: string[] = [];
  if (a.casualties != null && b.casualties != null && a.casualties !== b.casualties) {
    conflicts.push(`伤亡数(${a.casualties}≠${b.casualties})`);
  }
  if (a.vehicles != null && b.vehicles != null && a.vehicles !== b.vehicles) {
    conflicts.push(`车辆数(${a.vehicles}≠${b.vehicles})`);
  }
  if (a.hazmat != null && b.hazmat != null && a.hazmat !== b.hazmat) {
    conflicts.push('危化品标志');
  }
  return conflicts;
}

/**
 * 判断一个「并案标记」组内的两事件是否已独立演化到需要拆分（产品方案 2.6）。
 * 在语义字段冲突之外，额外纳入位置漂移 >1km——用于运行期对中置信并案组的持续监控，
 * 而非初次评分。
 */
export function groupDivergence(a: EventReport, b: EventReport): string[] {
  const conflicts = keyFieldConflicts(a, b);
  if (a.road === b.road && Math.abs(a.kp - b.kp) > MERGE_CONFIG.positionDriftKm) {
    conflicts.push(`位置漂移>${MERGE_CONFIG.positionDriftKm}km`);
  }
  return conflicts;
}

/**
 * 对两份报告评分并给出归并判定。
 * 决策优先级：关键字段冲突（硬规则）→ 强制拆分；否则按加权总分落三档。
 */
export function scoreMerge(a: EventReport, b: EventReport): MergeDecision {
  const rows = [scoreSpace(a, b), scoreTime(a, b), scoreType(a, b), scoreDirection(a, b)];
  const w = MERGE_CONFIG.weights;
  const total = rows[0].score * w.space + rows[1].score * w.time + rows[2].score * w.type + rows[3].score * w.direction;
  const conflicts = keyFieldConflicts(a, b);

  let tier: MergeTier;
  let decision: string;
  if (conflicts.length > 0) {
    tier = 'separate';
    decision = `关键字段冲突（${conflicts.join('、')}）→ 强制拆分，独立处置`;
  } else if (total >= MERGE_CONFIG.autoThreshold) {
    tier = 'auto';
    decision = '高置信 → 自动归并为单事件';
  } else if (total >= MERGE_CONFIG.caseLinkThreshold) {
    tier = 'caseLink';
    decision = '中置信 → 并案标记：预案合并、两事件独立跟踪，字段冲突即拆分';
  } else {
    tier = 'separate';
    decision = '低置信 → 不归并，各自出预案并推送人工比对';
  }

  // total 保留全精度，展示端（TracePanel）按 toFixed(2) 呈现，避免阈值判定丢精度。
  return { total, tier, decision, scoreRows: rows, conflictFields: conflicts };
}
