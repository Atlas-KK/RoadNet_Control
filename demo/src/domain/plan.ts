import type { SourcedParam } from '../data/measureTemplates';
import type { Tier } from '../engine/review';
import type { DiffStatus, PlanState } from '../engine/stateMachine';

export interface PlanAiNarrative {
  provider: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  model: string;
  generatedAt: number;
  summary: string;
  measureNotes: { measureId: string; note: string }[];
  riskNote: string;
}

export interface PlanAiStatus {
  status: 'idle' | 'pending' | 'ok' | 'rejected' | 'unavailable';
  reason?: string;
}

export type MeasureRunState = '待确认' | '已确认' | '已下发' | '自动执行' | '已完成';

export type DispatchState = 'pending' | 'dispatching' | 'success' | 'partial_success' | 'failed';
export type DispatchTargetType = 'system' | 'personnel' | 'device';

export interface DispatchTarget {
  id: string;
  type: DispatchTargetType;
  name: string;
  status: 'success' | 'failed';
  failureReason?: string;
}

export interface DeviceCommandEffect {
  deviceId: string;
  displayContent: string;
  contentTone: 'danger' | 'warning' | 'normal' | 'muted';
}

/** 操作项确认后的模拟下发回执；仅成功设备携带可同步的展示状态。 */
export interface MeasureDispatch {
  status: DispatchState;
  issuedAtSimSec: number;
  elapsedSec: number;
  targets: DispatchTarget[];
  deviceEffects: DeviceCommandEffect[];
}

/** 候选方案在统一预测窗口下的可比较效果，不代表实际处置结果。 */
export interface PlanEffectForecast {
  horizonMin: number;
  maxQueueKm: number;
  queueDissipateMin: number;
  capacityVehPerHour: number;
  capacityIncreasePct: number;
  basisRefs: string[];
}

/** 置信度由事件、模型和执行可达性三类可追溯因子组成。 */
export interface PlanConfidence {
  score: number;
  level: '高' | '中' | '低';
  eventData: number;
  modelStability: number;
  executability: number;
  note: string;
}

/** 预案中可独立确认、追溯和执行的一条措施。 */
export interface PlanMeasure {
  id: string;
  measureId: string;
  title: string;
  tier: Tier;
  summary: string;
  params: Record<string, SourcedParam>;
  resource?: { id: string; etaMin: number };
  supports: string[];
  diff?: DiffStatus;
  runState: MeasureRunState;
  /** 从措施展示到人工确认的真实耗时，单位毫秒。 */
  confirmMs?: number;
  /** 确认发生时的模拟秒数，供资源移动动画使用。 */
  confirmSimSec?: number;
  /** 措施首次进入待办队列的真实时间戳。 */
  shownAtMs: number;
  /** 被打回时的理由（FR-E3）。 */
  rejectReason?: string;
  dispatch?: MeasureDispatch;
  /**
   * 该措施依赖的语义事实集合（如 'F_泄漏'、'F_伤亡'），供 engine/tms.ts 反向传导使用；
   * 区别于 supports（trace 步骤 id，用于「依据」跳转），facts 是撤回/修正事件属性时
   * 判断措施应保留/降级/撤销的输入（附录A·案例四）。
   */
  facts?: string[];
}

/**
 * 同一预案快照下的策略候选。A/B/C 是策略选项，不等同于 V1/V2 事实快照版本。
 * measures 是选择该策略后进入人工确认队列的措施集合。
 */
export interface PlanCandidate {
  id: string;
  label: string;
  recommended?: boolean;
  summary: string;
  measures: PlanMeasure[];
  effect: PlanEffectForecast;
  confidence: PlanConfidence;
  risks: string[];
}

/** 同一事件在某个版本号下的完整预案快照。 */
export interface Plan {
  id: string;
  version: number;
  label: string;
  state: PlanState;
  responsible: string;
  confidence: string;
  measures: PlanMeasure[];
  candidates?: PlanCandidate[];
  selectedCandidateId?: string;
  /** 指挥员确认策略的真实时间；未确认时控制/预测措施不得下发。 */
  decisionConfirmedAt?: number;
  decisionConfirmedSimSec?: number;
  aiNarrative?: PlanAiNarrative;
  aiStatus?: PlanAiStatus;
  archived?: boolean;
  /** 被作废时的理由（FR-F2：现场接管/方案有误/事件证伪等）。 */
  voidReason?: string;
  /** 生成本版本所依据的推理快照标识（FR-H3）。 */
  snapshotRef?: string;
}
