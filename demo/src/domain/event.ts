import type { RoadId } from '../data/network';
import type { Severity } from '../engine/severity';
import type { TraceAiStatus, TraceComprehensiveConclusion } from '../engine/trace';
import type { TravelDirection } from '../engine/merge';
import type { EvidenceSummary } from './monitoring';

export interface EventAiStatus {
  status: 'idle' | 'pending' | 'ok' | 'rejected' | 'unavailable';
  reason?: string;
}

export interface EventTwinAiNarrative {
  provider: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  model: string;
  generatedAt: number;
  /** 生成该片段时的相对模拟秒数；旧快照可能没有该字段。 */
  simSec?: number;
  headline: string;
  /** 指挥员优先阅读的总体结论。 */
  commandConclusion?: string;
  eventOverview?: string;
  trafficImpact?: {
    upstream: string;
    incidentPoint: string;
    downstream: string;
    overallLevel: '畅通' | '轻度拥堵' | '中度拥堵' | '重度拥堵' | '待判定';
  };
  responseProgress?: { measure: string; status: string; detail: string }[];
  risks?: { level: '高' | '中' | '低'; content: string }[];
  nextFocus?: { timeWindow: string; action: string; trigger: string }[];
  /** 以下三项兼容已持久化的旧版五段态势讲解。 */
  situation?: string;
  trafficDynamics?: string;
  operationalFocus?: string;
  confidenceNote: string;
}

export interface EventFinalReportEvolution {
  simSec: number;
  label: string;
  closureActive: boolean;
  availableLanes: number;
  queuedVehicleCount: number;
  queueSpeedKmh: number;
  visibilityMeters: number;
  autoIssuedMeasureIds: string[];
  ventilation?: { fanId: string; direction: 'increasing' | 'decreasing'; fanEnabled: boolean };
}

export interface EventFinalReportMeasure {
  measureId: string;
  title: string;
  tier: string;
  summary: string;
  runState: string;
  confirmSimSec?: number;
  resource?: { id: string; etaMin: number };
}

export interface EventFinalReportPlan {
  version: number;
  label: string;
  state: string;
  responsible: string;
  measures: EventFinalReportMeasure[];
}

export interface EventFinalReportRevision {
  simSec: number;
  note: string;
  retractedFacts: string[];
}

export interface EventFinalReportReasoning {
  phase: string;
  title: string;
  conclusion: string;
}

/** 监控员向上报送的事件动态信息；与系统生成的管控预案严格分离。 */
export interface EventProgressReport {
  id: string;
  eventId: string;
  /** 续报在同一事件内的顺序号。 */
  sequence: number;
  /** 本次为常规动态补充还是对既有事实的订正。 */
  kind: '续报' | '订正续报';
  submittedSimSec: number;
  reporter: string;
  source: string;
  description: string;
  /** 仅保存本次明确填写的变化字段，避免用空值覆盖既有事实。 */
  changes: {
    casualties?: number;
    hazmat?: boolean;
    lanesClosed?: number;
    lanesTotal?: number;
    q?: number;
    stage?: string;
    road?: RoadId;
    accidentKp?: number;
    direction?: TravelDirection;
    typeNodeId?: string;
    label?: string;
    vehicles?: number;
  };
  /** 该续报导致重新研判时，关联新生成的管控预案版本。 */
  triggeredPlanVersion?: number;
}

/** 事件清撤后的处置闭环摘要，由演示脚本终态或后续生产接口写入。 */
export interface EventFinalReport {
  generatedSimSec: number;
  summary: string;
  completedMeasureCount: number;
  capacityBeforeVehPerHour: number;
  capacityAfterVehPerHour: number;
  drivingDensityBeforeVehPerKm: number;
  drivingDensityAfterVehPerKm: number;
  queueCleared: boolean;
  /** 用于复盘的事件演变、方案执行和推理过程快照。 */
  evolution: EventFinalReportEvolution[];
  planVersions: EventFinalReportPlan[];
  revisions: EventFinalReportRevision[];
  reasoning: EventFinalReportReasoning[];
}

/** 处置期事件实例；由运行期事件录入创建，由推理、地图和拥堵模块共同消费。 */
export interface SimEvent {
  id: string;
  road: RoadId;
  accidentKp: number;
  lanesTotal: number;
  lanesClosed: number;
  q: number;
  vf?: number;
  typeNodeId: string;
  label: string;
  /** 事件激活的相对运行秒数；允许小于 0，表示进入工作台前已经发生。 */
  startSimSec: number;
  congested: boolean;
  /** 流模型计算的排队回溯速度，单位 km/h。 */
  w: number;
  stage?: string;
  /** 处置闭环后保留历史对象，但从活动态势和处置计算中摘除。 */
  finalized?: boolean;
  /** 事件处置闭环及管控成效摘要。 */
  finalReport?: EventFinalReport;
  // ---- 运行模式扩展字段（FR-A1/A3/G8/F2）----
  /** 感知来源：视频检出/电话报警/雷视/人工巡查。 */
  sourceKind?: string;
  /** 伤亡人数（人工补报或录入）。 */
  casualties?: number;
  /** 危化品标志。 */
  hazmat?: boolean;
  /** 事故等级；运行事件接入时计算。 */
  severity?: Severity;
  /** 涉事车辆数。 */
  vehicles?: number;
  /** 高置信归并并入的来源报告标签。 */
  mergedFrom?: string[];
  /** 隧道现场风向与风速，供通风措施复算和演示追溯。 */
  wind?: { dir: 'forward' | 'reverse'; speed: number };
  /** 泄漏物密度属性，供通风措施参数计算。 */
  spillLighterThanAir?: boolean;
  /** 事件所在车流方向；用于 GIS 车道偏移与排队回溯方向。 */
  direction?: TravelDirection;
  /** 中置信并案标记的组 id（两事件独立跟踪）。 */
  caseLinkGroup?: string;
  /** 被人工核实为感知误报。 */
  falsePositive?: boolean;
  /** 值班员手工提交的事件续报，不与管控预案版本混用。 */
  progressReports?: EventProgressReport[];
  /** 事件孪生地图态势讲解，由 LLM 基于雷视融合仿真统计生成。 */
  aiTwinNarrative?: EventTwinAiNarrative;
  /** 按生成时间保留的态势讲解片段，供事件孪生时间轴滚动展示。 */
  aiTwinNarrativeHistory?: EventTwinAiNarrative[];
  aiTwinStatus?: EventAiStatus;
  /** 规则推理与交通流计算完成后由后台生成的一条事件级综合结论。 */
  aiTraceConclusion?: TraceComprehensiveConclusion;
  aiTraceStatus?: TraceAiStatus;
  /** 事件监测接管关联；允许多个监测事件在管控侧归并为同一事件。 */
  monitoringHandoffs?: Array<{
    monitoringEventId: string;
    handoffId: string;
    idempotencyKey: string;
  }>;
  /** 管控事件实体版本，供跨模块乐观并发与乱序仲裁。 */
  controlEventVersion?: number;
  /** 管控事件级生命周期；不得由预案状态直接推导。 */
  controlLifecycleStatus?: 'handling' | 'resolved' | 'closed' | 'correction_required' | 'false_positive_confirmed';
  /** 监测侧补充的证据摘要，只追加不覆盖。 */
  monitoringEvidence?: EvidenceSummary[];
  /** 已处理监测更新消息，跨刷新用于消息幂等。 */
  processedMonitoringMessageIds?: string[];
}
