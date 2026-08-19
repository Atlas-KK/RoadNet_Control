// ============================================================
// 推理轨迹与计算记录结构（开发规格 §5.2 / §4.2）
// CalcRecord：计算面板每条记录（公式→代入→结果→结论 + 来源徽章）
// TraceStep：五步推理轨迹（M3 起使用；此处先定义强制接口）
// ============================================================

/** 数据来源徽章标签（用于计算/推理的来源标注） */
export type DataSource =
  | '图库'
  | '快照'
  | '快照·增量补取'
  | '缓存拓扑'
  | '流模型'
  | '规则'
  | '模板'
  | '时序流'
  | '事件快照'
  | '模型参数'
  | '本面板'
  | 'GIS现算';

/** 计算记录的一个来源徽章：如 { text: 'q', from: '时序流' } → 渲染为 [q←时序流] */
export interface CalcBadge {
  text: string; // 变量符号，如 'q'、'C_b'
  from: string; // 来源，如 '时序流'、'本面板#2'、'模型参数'
}

/**
 * CalcRecord —— 计算面板基础结构（§4.2）：
 * 公式(含符号) → 代入(实际数值) → 结果(含单位) → 面向业务人员的结论，附来源徽章。
 */
export interface CalcRecord {
  id: string; // 'C-0031-02'
  eventId?: string; // 关联事件（CalcPanel 可按事件过滤）
  label: string; // 一句话名称，如「排队回溯速度」
  formula: string; // 'w = (q − C_b) / (k_q − k_a)'
  substitution: string; // '= (5200 − 1530) / (420 − 47.3)'
  result: string; // '= 9.8 km/h'
  /** 面向值班人员的业务结论，不要求读者理解公式。 */
  conclusion?: string;
  /** 结论的语义颜色：仅影响展示，不参与业务判定。 */
  conclusionTone?: 'info' | 'success' | 'warning' | 'danger';
  /** 用于生成本次事件交通流综合结论的指标角色。 */
  summaryRole?: 'capacity' | 'drivingDensity' | 'queueDensity' | 'spillbackSpeed' | 'queueLength' | 'arrivalTime';
  /** 指标展示值，避免 UI 从公式结果文本中反向解析。 */
  summaryValue?: string;
  badges: CalcBadge[]; // 来源徽章
  /** 参数来源子表（CalcPanel 展开用）：变量 → 取值与来源 */
  paramTable?: { name: string; value: string; source: string }[];
}

/** 推理步骤中按业务顺序经过的节点。edges 负责关系，path 负责播放顺序。 */
export interface TracePathNode {
  id: string;
  label?: string;
}

export interface TraceAiExplanation {
  provider: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  model: string;
  generatedAt: number;
  plainLanguage: string;
  keyNodes: string[];
  why: string;
  riskCheck: string;
}

export interface TraceGraphNodeStatement {
  nodeId: string;
  nodeLabel: string;
  plainLanguage: string;
  roleInChain: string;
}

export interface TraceGraphConclusion {
  provider: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  model: string;
  generatedAt: number;
  title: string;
  chainExplanation: string;
  nodeStatements: TraceGraphNodeStatement[];
  conclusionStatement: string;
  confidence: '高' | '中' | '低';
  operatorFocus: string[];
  evidenceRefs: { type: 'node' | 'edge' | 'step'; id: string; label: string }[];
  limits: string;
}

export interface TraceCalcIndicatorFinding {
  calcId: string;
  metric: string;
  value: string;
  plainMeaning: string;
  level: 'info' | 'success' | 'warning' | 'danger';
}

export interface TraceCalcInterpretation {
  provider: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  model: string;
  generatedAt: number;
  title: string;
  summarySentence: string;
  indicatorFindings: TraceCalcIndicatorFinding[];
  integratedConclusion: string;
  operatorImplication: string;
  uncertainty: string;
  evidenceRefs: { type: 'calc'; id: string; label: string }[];
}

/** 事件级综合研判：把图谱因果链与本次事件交通流指标组织成一条可读结论。 */
export interface TraceComprehensiveConclusion {
  provider: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  model: string;
  generatedAt: number;
  title: string;
  summarySentence: string;
  chainExplanation: string;
  nodeStatements: TraceGraphNodeStatement[];
  indicatorFindings: TraceCalcIndicatorFinding[];
  integratedConclusion: string;
  operatorImplication: string;
  confidence: '高' | '中' | '低';
  uncertainty: string;
  evidenceRefs: { type: 'node' | 'edge' | 'step' | 'calc'; id: string; label: string }[];
}

export interface TraceAiStatus {
  status: 'idle' | 'pending' | 'ok' | 'rejected' | 'unavailable';
  reason?: string;
}

/** 推理轨迹步骤（§5.2 强制接口）——M3 起填充 */
export interface TraceStep {
  id: string; // 'T-0031-04'
  eventId: string;
  phase: '落图' | '快照' | '检索' | '推演' | '裁剪匹配' | '撤销传导';
  title: string; // 一句话结论
  dataSources: DataSource[];
  edges?: { from: string; to: string; type: string; weight?: number }[]; // → GraphPanel 高亮
  path?: TracePathNode[]; // 按推理顺序逐个高亮的节点序列
  calcs?: string[]; // 关联 CalcRecord id → CalcPanel 联动
  mapRefs?: string[]; // 关联 GIS 路网元素 id，用于跨面板高亮联动
  conclusion: string;
  specRef: string; // 方案章节号，如 '3.3.7-④ / 附录A案例一'
  /** 因果顺成推演 Skill 输出：只解释事理图谱推理链。 */
  aiGraphConclusion?: TraceGraphConclusion;
  /** 交通流计算 Skill 输出：只解释本事件计算指标与业务结论。 */
  aiCalcInterpretation?: TraceCalcInterpretation;
  aiGraphStatus?: TraceAiStatus;
  aiCalcStatus?: TraceAiStatus;
  /** 事件级大模型综合研判，后台在规则推理和交通流计算完成后生成。 */
  aiComprehensiveConclusion?: TraceComprehensiveConclusion;
  aiComprehensiveStatus?: TraceAiStatus;
  /** @deprecated 旧版共用解释字段，仅用于兼容旧快照。 */
  aiExplanation?: TraceAiExplanation;
  aiStatus?: TraceAiStatus;
}

/** 取步骤的有序播放路径；兼容旧快照时从边的出现顺序回退生成。 */
export function tracePathForStep(step: TraceStep): TracePathNode[] {
  if (step.path && step.path.length > 0) return step.path;
  const seen = new Set<string>();
  const path: TracePathNode[] = [];
  for (const edge of step.edges ?? []) {
    for (const id of [edge.from, edge.to]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      path.push({ id });
    }
  }
  return path;
}
