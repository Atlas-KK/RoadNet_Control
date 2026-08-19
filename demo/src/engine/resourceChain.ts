// ============================================================
// 资源链式挤兑推理（开发规格 MVP · FR-B4 / 附录 A 案例二）
// 跨事件实例的资源依赖联合推理：本辖区资源被占用时，比较「等待释放并转场」
// 与「跨辖区调派」两条路线的到位时间，给出更优策略。
//
// 五跳链条：目标事件需资源 → 快照查占用 → occupiedBy 跳占用方事件 →
// 读其演化阶段（已作业分钟）→ 顺承边时延分布算剩余，与转场叠加得 ETA。
// 纯函数，从 store.spawnEvent 抽出以便单测与复用。
// ============================================================

import type { RoadId } from '../data/network';
import type { Resource } from '../data/resources';
import { etaMinTo } from '../data/resources';

/** 清障作业时延中位数（分钟，图谱顺承边 median=45）。 */
export const CLEAR_WORK_MEDIAN_MIN = 45;

/** 占用方事件的最小视图——只需位置与演化阶段。 */
export interface OccupyingEvent {
  id: string;
  road?: RoadId;
  accidentKp: number;
  stage?: string;
}

/** 从演化阶段文案解析已作业分钟（如「清障作业中（已 28min）」→ 28）。 */
export function parseElapsedWorkMin(stage?: string): number {
  const m = stage?.match(/已\s*(\d+(?:\.\d+)?)\s*min/i);
  return m ? Number(m[1]) : 0;
}

export interface WaitReleaseResult {
  etaMin: number;
  remainingWorkMin: number;
  transferMin: number;
}

/**
 * 等待占用资源释放并转场到目标事件的 ETA（分钟）。
 * ETA = 剩余作业时延（median − 已作业）+ 从占用事件位置到目标点的转场车程。
 */
export function waitReleaseEta(
  wrecker: Resource,
  targetKp: number,
  occupiedEvent: OccupyingEvent,
  clearMedianMin = CLEAR_WORK_MEDIAN_MIN,
  targetRoad?: RoadId,
): WaitReleaseResult {
  const elapsed = parseElapsedWorkMin(occupiedEvent.stage);
  const remainingWorkMin = Math.max(0, clearMedianMin - elapsed);
  const transferMin = etaMinTo(wrecker, targetKp, occupiedEvent.accidentKp, targetRoad, occupiedEvent.road);
  return { etaMin: Math.round(remainingWorkMin + transferMin), remainingWorkMin, transferMin };
}

export type CandidateMode = 'idle' | 'waitRelease' | 'crossJurisdiction';

export interface ChainCandidate {
  resource: Resource;
  etaMin: number;
  mode: CandidateMode;
  occupiedByEventId?: string;
  note: string;
}

export interface ResourceChainResult {
  candidates: ChainCandidate[];
  recommended?: ChainCandidate;
  reason: string;
}

/**
 * 对某类资源（默认清障车）求解到达目标事件的全部候选与推荐策略。
 * 被占用资源走「等待释放+转场」；空闲资源直接车程；跨辖区资源含协调开销。
 * 推荐取 ETA 最小者。
 *
 * 路网边界：桩号仅在同一条路内连续，不同道路的桩号数值即使接近也不构成物理临近
 * （如 G65 K1210 与 G65S K1210 是两条路的端点，不是同一位置）。候选池必须先按
 * 「同路」筛过，跨辖区资源（crossJurisdiction）例外——其 ETA 本就按固定协调+车程
 * 建模，不依赖桩号差值，可视为对全网络任一道路等距可达。
 */
export function resolveResourceChain(params: {
  resources: Resource[];
  occupancy: Record<string, string>;
  events: OccupyingEvent[];
  targetKp: number;
  targetRoad: RoadId;
  kind?: Resource['kind'];
}): ResourceChainResult {
  const kind = params.kind ?? 'wrecker';
  const candidates: ChainCandidate[] = params.resources
    .filter((r) => r.kind === kind && (r.road === params.targetRoad || r.crossJurisdiction || (r.road === 'G65' && params.targetRoad === 'G56') || (r.road === 'G56' && params.targetRoad === 'G65')))
    .map((resource) => {
      const occupiedByEventId = params.occupancy[resource.id];
      const occupiedEvent = occupiedByEventId
        ? params.events.find((e) => e.id === occupiedByEventId)
        : undefined;
      if (occupiedEvent) {
        const { etaMin, remainingWorkMin, transferMin } = waitReleaseEta(resource, params.targetKp, occupiedEvent, CLEAR_WORK_MEDIAN_MIN, params.targetRoad);
        return {
          resource,
          etaMin,
          mode: 'waitRelease' as const,
          occupiedByEventId,
          note: `被 ${occupiedByEventId} 占用：剩余作业 ${remainingWorkMin}min + 转场 ${Math.round(transferMin)}min`,
        };
      }
      const etaMin = Math.round(etaMinTo(resource, params.targetKp, undefined, params.targetRoad));
      return resource.crossJurisdiction
        ? { resource, etaMin, mode: 'crossJurisdiction' as const, note: `跨辖区：协调 ${resource.coordMin ?? 0}min + 车程 ${resource.fixedDriveMin ?? '—'}min` }
        : { resource, etaMin, mode: 'idle' as const, note: '即时可用' };
    })
    .sort((a, b) => a.etaMin - b.etaMin);

  const recommended = candidates[0];
  let reason = '无可用资源';
  if (recommended) {
    const alt = candidates.find((c) => c.mode !== recommended.mode);
    reason = alt
      ? `${recommended.resource.id}（${recommended.etaMin}min）优于 ${alt.resource.id}（${alt.etaMin}min），快 ${alt.etaMin - recommended.etaMin}min`
      : `${recommended.resource.id}（${recommended.etaMin}min）`;
  }
  return { candidates, recommended, reason };
}
