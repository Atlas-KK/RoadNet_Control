// ============================================================
// 图就绪高质量数据集领域类型（开发规格 MVP · FR-I1 / 产品方案 4.1、4.4）
// 六段结构 event/context/event_logic/plan/label/feedback，处置全程自动填充，
// 事件处置闭环后经复盘表单补全 event_logic，一次采集、可导出 JSONL。
// ============================================================

export interface DatasetEvent {
  id: string;
  type: string;
  road: string;
  kp: number;
  lanes: { total: number; closed: number };
  casualties?: number;
  hazmat?: boolean;
  sourceKind?: string;
  tsDetect: number; // 检出模拟秒（当日）
}

export interface DatasetContext {
  snapshotTs: number;
  weather: string[];
  devicesOffline: string[];
  flowQ: number;
  concurrentEventIds: string[];
}

/** 事件间演化关系链（由复盘表单确认，4.4）。 */
export interface DatasetEventLogic {
  chain: { from: string; to: string; relation: '因果' | '顺承' | '条件'; confirmed: boolean }[];
}

export interface DatasetPlan {
  versions: {
    version: number;
    label: string;
    measures: { measureId: string; tier: string; runState: string; diff?: string }[];
  }[];
}

export interface DatasetLabel {
  outcome: '正常处置' | '误报' | '归并拆分' | '作废';
  confirmTimeSecList: number[];
}

export interface DatasetFeedback {
  rejects: { measureId: string; reason: string }[];
  revokeNotes: string[];
}

/** 一条完整的数据集记录（对应一起事件）。 */
export interface DatasetRecord {
  event: DatasetEvent;
  context: DatasetContext;
  event_logic: DatasetEventLogic;
  plan: DatasetPlan;
  label: DatasetLabel;
  feedback: DatasetFeedback;
}
