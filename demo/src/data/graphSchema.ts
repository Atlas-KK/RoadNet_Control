// ============================================================
// 事理图谱类型层（开发规格 §3.4）
// 节点五类：事件类型 / 措施 / 资源类型 / 约束条件（+ 风险类事件节点）
// 边两组：事理边（因果/顺承/条件/关联）、知识边（触发/适用/需要/受约束）
// 全部节点边严格按 §3.4 列出实现；坐标为类型层手排固定坐标（§7.3 建议）。
// ============================================================

export type NodeCategory = 'event' | 'measure' | 'resource' | 'constraint';

export interface GNode {
  id: string;
  label: string;
  category: NodeCategory;
  x: number; // 类型层手排坐标（viewBox 空间）
  y: number;
  note?: string;
}

export type EdgeGroup = '事理' | '知识';
export type EdgeType =
  | '因果'
  | '顺承'
  | '条件'
  | '关联'
  | '触发'
  | '适用'
  | '需要'
  | '受约束';

export interface GEdge {
  id: string;
  from: string;
  to?: string; // 目标节点（多数边）
  targetEdge?: string; // 条件·加权边的目标是另一条边（如 团雾 ×2.2 作用于 [后方拥堵→二次事故风险]）
  group: EdgeGroup;
  type: EdgeType;
  weight?: number; // 顺承边权重
  delayLabel?: string; // 时延分布标签，如 'median=12min'
  factor?: number; // 条件加权系数，如 2.2
  activation?: boolean; // 条件·激活边
  note?: string;
}

// ---- 节点（含手排坐标，viewBox 约 1140×480） ----
export const GRAPH_NODES: GNode[] = [
  // 事件类型（因果/顺承链，左→右）
  { id: 'E_追尾', label: '追尾事故', category: 'event', x: 80, y: 55 },
  { id: 'E_侧翻', label: '货车侧翻', category: 'event', x: 80, y: 105 },
  { id: 'E_抛锚', label: '车辆抛锚', category: 'event', x: 80, y: 155 },
  { id: 'E_危化泄漏', label: '危化品泄漏', category: 'event', x: 80, y: 225, note: '疑似/确认两态由实例属性表达' },
  { id: 'E_伤亡', label: '伤亡', category: 'event', x: 80, y: 300 },
  { id: 'E_占道', label: '车道占用', category: 'event', x: 250, y: 130 },
  { id: 'E_毒气', label: '有毒气体聚集风险', category: 'event', x: 250, y: 225 },
  { id: 'E_拥堵', label: '后方拥堵', category: 'event', x: 420, y: 130 },
  { id: 'E_二次', label: '二次事故风险', category: 'event', x: 580, y: 130 },
  // 处置过程节点（S2 清障时延链）
  { id: 'E_清障中', label: '清障作业', category: 'event', x: 250, y: 360 },
  { id: 'E_清障完成', label: '清障完成', category: 'event', x: 420, y: 360 },

  // 约束/条件（底部带）
  { id: 'C_危化品', label: '危化品', category: 'constraint', x: 150, y: 435 },
  { id: 'C_隧道', label: '隧道路段', category: 'constraint', x: 250, y: 435 },
  { id: 'C_团雾', label: '团雾', category: 'constraint', x: 350, y: 435 },
  { id: 'C_夜间', label: '夜间', category: 'constraint', x: 430, y: 435 },
  { id: 'C_无匝道', label: '无可用匝道', category: 'constraint', x: 540, y: 435 },
  { id: 'C_设备离线', label: '设备离线', category: 'constraint', x: 650, y: 435 },
  { id: 'C_雾区禁封', label: '雾区内禁设封道执行点', category: 'constraint', x: 800, y: 435 },

  // 措施
  { id: 'M_封车道', label: '封闭车道', category: 'measure', x: 720, y: 55 },
  { id: 'M_全封', label: '全幅封道', category: 'measure', x: 720, y: 105 },
  { id: 'M_调清障', label: '调派清障', category: 'measure', x: 720, y: 155 },
  { id: 'M_实况', label: '情报板实况发布', category: 'measure', x: 720, y: 205 },
  { id: 'M_调消防', label: '调派消防', category: 'measure', x: 720, y: 255 },
  { id: 'M_通风', label: '隧道通风控制', category: 'measure', x: 720, y: 305 },
  { id: 'M_拥堵预警', label: '拥堵预警发布', category: 'measure', x: 900, y: 55 },
  { id: 'M_预置分流', label: '预置分流', category: 'measure', x: 900, y: 105 },
  { id: 'M_限速', label: '上游限速', category: 'measure', x: 900, y: 155 },
  { id: 'M_调120', label: '调派120', category: 'measure', x: 900, y: 205 },
  { id: 'M_提前分流', label: '提前分流', category: 'measure', x: 900, y: 255 },
  { id: 'M_临时组织', label: '临时交通组织', category: 'measure', x: 900, y: 305 },

  // 资源类型（最右列）
  { id: 'R_情报板', label: '情报板', category: 'resource', x: 1070, y: 55 },
  { id: 'R_清障车', label: '清障车', category: 'resource', x: 1070, y: 155 },
  { id: 'R_救护车', label: '救护车', category: 'resource', x: 1070, y: 205 },
  { id: 'R_消防', label: '消防力量', category: 'resource', x: 1070, y: 255 },
  { id: 'R_路政', label: '路政班组', category: 'resource', x: 1070, y: 305 },
];

// ---- 边 ----
export const GRAPH_EDGES: GEdge[] = [
  // 事理边——因果
  { id: 'ce1', from: 'E_追尾', to: 'E_占道', group: '事理', type: '因果' },
  { id: 'ce2', from: 'E_侧翻', to: 'E_占道', group: '事理', type: '因果' },
  { id: 'ce3', from: 'E_抛锚', to: 'E_占道', group: '事理', type: '因果' },
  // 事理边——顺承
  { id: 'se1', from: 'E_占道', to: 'E_拥堵', group: '事理', type: '顺承', weight: 0.82, delayLabel: 'LogN(median=12min)' },
  { id: 'se2', from: 'E_拥堵', to: 'E_二次', group: '事理', type: '顺承', weight: 0.31 },
  { id: 'se3', from: 'E_清障中', to: 'E_清障完成', group: '事理', type: '顺承', delayLabel: 'median=45min, p80=68min', note: '场景 S2 核心时延边' },
  // 事理边——条件
  { id: 'cond1', from: 'C_团雾', targetEdge: 'se2', group: '事理', type: '条件', factor: 2.2, note: '团雾对[后方拥堵→二次事故风险]加权 ×2.2' },
  { id: 'cond2', from: 'C_危化品', to: 'E_毒气', group: '事理', type: '条件', activation: true, note: '危化品∧隧道 条件·激活 有毒气体聚集风险' },
  { id: 'cond3', from: 'C_隧道', to: 'E_毒气', group: '事理', type: '条件', activation: true },

  // 知识边——触发
  { id: 'te1', from: 'E_伤亡', to: 'M_调120', group: '知识', type: '触发' },
  { id: 'te2', from: 'E_危化泄漏', to: 'M_调消防', group: '知识', type: '触发', note: '疑似泄漏触发' },
  { id: 'te3', from: 'E_危化泄漏', to: 'M_全封', group: '知识', type: '触发' },
  { id: 'te4', from: 'E_占道', to: 'M_封车道', group: '知识', type: '触发' },
  { id: 'te5', from: 'E_占道', to: 'M_调清障', group: '知识', type: '触发' },
  { id: 'te6', from: 'E_占道', to: 'M_实况', group: '知识', type: '触发' },
  { id: 'te7', from: 'E_拥堵', to: 'M_拥堵预警', group: '知识', type: '触发', note: '后方拥堵(预测)触发' },
  { id: 'te8', from: 'E_拥堵', to: 'M_预置分流', group: '知识', type: '触发' },
  { id: 'te9', from: 'E_拥堵', to: 'M_限速', group: '知识', type: '触发' },
  // 知识边——需要
  { id: 'ne1', from: 'M_调120', to: 'R_救护车', group: '知识', type: '需要' },
  { id: 'ne2', from: 'M_调清障', to: 'R_清障车', group: '知识', type: '需要' },
  { id: 'ne3', from: 'M_调消防', to: 'R_消防', group: '知识', type: '需要' },
  { id: 'ne4', from: 'M_实况', to: 'R_情报板', group: '知识', type: '需要' },
  // 知识边——适用
  { id: 'ae1', from: 'M_封车道', to: 'C_隧道', group: '知识', type: '适用', note: '隧道路段参数模板切换为隧道版' },
  // 知识边——受约束
  { id: 'xe1', from: 'M_全封', to: 'C_雾区禁封', group: '知识', type: '受约束' },
];

/** 按图谱节点 id 查询类型层节点。 */
export function nodeById(id: string): GNode | undefined {
  return GRAPH_NODES.find((n) => n.id === id);
}
/** 按图谱边 id 查询边定义，主要供高亮和溯源交互使用。 */
export function edgeById(id: string): GEdge | undefined {
  return GRAPH_EDGES.find((e) => e.id === id);
}

// ---- 类型层画布尺寸 ----
export const GRAPH_VIEW = { w: 1160, h: 480 };
