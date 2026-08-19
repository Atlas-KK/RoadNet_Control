// ============================================================
// 五步推理引擎（开发规格 §5.1）
// ① 事件落图 → ② 生成推理快照 → ③ 多跳子图检索 →
// ④ 因果/顺承/条件推演（调 flowModel 定量）→ ⑤ 约束裁剪与措施匹配
// 每步产出 TraceStep（§5.2）；输出 { steps, calcs, measures }。
// M3：以运行事件跑通五步，产出真实可联动的 TraceStep。
// ============================================================

import type { RoadId } from '../data/network';
import type { TraceStep, CalcRecord } from './trace';
import { computeFlow, type FlowContext } from './flowModel';
import { MEASURE_TEMPLATES, type MeasureContext, type MeasureOutput } from '../data/measureTemplates';

export interface ReasonInput extends FlowContext {
  road: RoadId;
  typeNodeId: string; // 事件类型节点，如 'E_追尾'
  eventLabel: string;
  // ---- 运行模式扩展（危化品/伤亡/隧道/团雾场景，附录A·案例三）----
  hazmat?: boolean;
  casualties?: number;
  tunnel?: { fromKp: number; toKp: number };
  fogBand?: { fromKp: number; toKp: number };
  wind?: { dir: 'forward' | 'reverse'; speed: number };
  spillLighterThanAir?: boolean;
  executablePoints?: { id: string; kp: number }[];
}

export interface ReasonResult {
  steps: TraceStep[];
  calcs: CalcRecord[];
  measures: MeasureOutput[];
  /** 推理得到的排队回溯速度（供地图/曲线复用） */
  w: number;
}

/** 对单个事件运行五步推理 */
export function runReasoning(ev: ReasonInput, snapshotClock = '15:20:05'): ReasonResult {
  const flow = computeFlow(ev);
  const id = ev.eventId;
  const steps: TraceStep[] = [];

  // ① 事件落图
  steps.push({
    id: `T-${id}-01`,
    eventId: id,
    phase: '落图',
    title: `事件落图：创建实例 ${id}，锚定 ${ev.road} K${ev.accidentKp}，连接「${ev.eventLabel}」类型节点`,
    dataSources: ['图库'],
    edges: [{ from: `INST_${id}`, to: ev.typeNodeId, type: '实例' }],
    path: [
      { id: `INST_${id}`, label: `${id} · K${ev.accidentKp}` },
      { id: ev.typeNodeId },
    ],
    mapRefs: [`accident`],
    conclusion: `实例节点 ${id} 已入图并挂路段锚点 ${ev.road}-K${ev.accidentKp}`,
    specRef: '3.3.7-① / §5.1',
  });

  // ② 生成推理快照
  steps.push({
    id: `T-${id}-02`,
    eventId: id,
    phase: '快照',
    title: `生成推理快照：圈定上下文范围框，快照时刻 ${snapshotClock}`,
    dataSources: ['快照', '缓存拓扑'],
    mapRefs: ['snapshot'],
    conclusion: `基于 ${snapshotClock} 时刻的设备与资源状态生成快照，多跳推演默认读快照不回源`,
    specRef: '3.3.7-② / 3.3.4',
  });

  // ③ 多跳子图检索（沿事理边取演化候选）
  steps.push({
    id: `T-${id}-03`,
    eventId: id,
    phase: '检索',
    title: '多跳子图检索：沿事理边取演化候选「占道 → 后方拥堵 → 二次事故风险」',
    dataSources: ['图库', '快照'],
    edges: [
      { from: ev.typeNodeId, to: 'E_占道', type: '因果' },
      { from: 'E_占道', to: 'E_拥堵', type: '顺承', weight: 0.82 },
      { from: 'E_拥堵', to: 'E_二次', type: '顺承', weight: 0.31 },
    ],
    path: [
      { id: ev.typeNodeId },
      { id: 'E_占道' },
      { id: 'E_拥堵' },
      { id: 'E_二次' },
    ],
    mapRefs: ['accident'],
    conclusion: '演化候选链已用快照上下文实例化到具体上游路段集合',
    specRef: '3.3.7-③',
  });

  // ④ 因果/顺承/条件推演（时空定量调 flowModel）
  steps.push({
    id: `T-${id}-04`,
    eventId: id,
    phase: '推演',
    title: flow.congested
      ? `因果/顺承推演：预测后方拥堵，队尾以 w=${flow.w.toFixed(1)} km/h 向上游回溯`
      : `因果/顺承推演：q=${ev.q} ≤ C_b=${flow.C_b} → 不形成排队，不触发拥堵类措施`,
    dataSources: ['流模型', '规则'],
    edges: flow.congested ? [{ from: 'E_占道', to: 'E_拥堵', type: '顺承', weight: 0.82 }] : [],
    path: flow.congested
      ? [{ id: 'E_占道' }, { id: 'E_拥堵' }]
      : [{ id: 'E_占道' }],
    calcs: flow.calcs.map((c) => c.id),
    mapRefs: flow.congested ? ['congestion'] : ['accident'],
    conclusion: flow.congested
      ? `瓶颈 C_b=${flow.C_b} veh/h < q=${ev.q} veh/h → 形成排队，回溯速度 w=${flow.w.toFixed(1)} km/h`
      : `瓶颈 C_b=${flow.C_b} veh/h ≥ q=${ev.q} veh/h → 通行能力足够，不预测后方拥堵`,
    specRef: '3.3.7-④ / §4',
  });

  // ⑤ 约束裁剪与措施匹配（沿知识边匹配措施 + 参数模板填参）
  const isTunnel = ev.tunnel != null;
  const mctx: MeasureContext = {
    accidentKp: ev.accidentKp,
    lanesTotal: ev.lanesTotal,
    lanesClosed: ev.lanesClosed,
    isTunnel,
    tunnel: ev.tunnel,
    fogBand: ev.fogBand,
    wind: ev.wind,
    spillLighterThanAir: ev.spillLighterThanAir,
    executablePoints: ev.executablePoints,
    wFlow: flow.w,
  };
  // 占道触发的措施——任何占道事件都命中
  const measures: MeasureOutput[] = [
    MEASURE_TEMPLATES.M_封车道(mctx),
    {
      measureId: 'M_调清障',
      title: '调派清障',
      params: {},
      summary: '沿「占道 —触发→ 调派清障 —需要→ 清障车」匹配',
    },
    {
      measureId: 'M_实况',
      title: '情报板实况发布',
      params: {},
      summary: '沿「占道 —触发→ 情报板实况发布 —需要→ 情报板」匹配（实况类·自动+审计）',
    },
  ];
  // 后方拥堵(预测)触发的措施——仅当预测形成排队时才命中（q>C_b）
  if (flow.congested) {
    measures.push(
      MEASURE_TEMPLATES.M_预置分流(mctx),
      {
        measureId: 'M_限速',
        title: '上游限速',
        params: {},
        summary: '沿「后方拥堵(预测) —触发→ 上游限速」匹配',
      },
      {
        measureId: 'M_拥堵预警',
        title: '拥堵预警发布',
        params: {},
        summary: '沿「后方拥堵(预测) —触发→ 拥堵预警发布」匹配（预测预警类·一键确认）',
      },
    );
  }
  // 危化品泄漏(疑似)触发的措施——沿「E_危化泄漏 —触发→ M_调消防 / M_全封」（附录A·案例三/四）。
  // 隧道段追加通风控制。运行模式手工录入的危化品事件由此才有消防/封道/通风措施可供
  // TMS 撤销传导操作；未传 hazmat 字段时走原分支不受影响。
  if (ev.hazmat === true) {
    measures.push(
      MEASURE_TEMPLATES.M_全封(mctx),
      {
        measureId: 'M_调消防',
        title: '调派消防',
        params: {},
        summary: '沿「危化品泄漏(疑似) —触发→ 调派消防 —需要→ 消防力量」匹配',
      },
    );
    if (isTunnel) {
      measures.push(MEASURE_TEMPLATES.M_通风(mctx));
    }
  }
  // 伤亡触发「调派120」（附录A·案例四撤回事实的对象之一）。
  if ((ev.casualties ?? 0) >= 1) {
    measures.push({
      measureId: 'M_调120',
      title: '调派120',
      params: {},
      summary: '沿「伤亡 —触发→ 调派120 —需要→ 救护车」匹配',
    });
  }

  const matchEdges = [
    { from: 'E_占道', to: 'M_封车道', type: '触发' },
    { from: 'E_占道', to: 'M_调清障', type: '触发' },
    { from: 'E_占道', to: 'M_实况', type: '触发' },
    ...(flow.congested
      ? [
          { from: 'E_拥堵', to: 'M_预置分流', type: '触发' },
          { from: 'E_拥堵', to: 'M_限速', type: '触发' },
          { from: 'E_拥堵', to: 'M_拥堵预警', type: '触发' },
        ]
      : []),
    ...(ev.hazmat === true
      ? [
          { from: 'E_危化泄漏', to: 'M_调消防', type: '触发' },
          { from: 'E_危化泄漏', to: 'M_全封', type: '触发' },
          { from: 'M_调消防', to: 'R_消防', type: '需要' },
          ...(isTunnel ? [{ from: 'C_隧道', to: 'M_通风', type: '适用' }] : []),
        ]
      : []),
    ...((ev.casualties ?? 0) >= 1 ? [{ from: 'E_伤亡', to: 'M_调120', type: '触发' }, { from: 'M_调120', to: 'R_救护车', type: '需要' }] : []),
    { from: 'M_调清障', to: 'R_清障车', type: '需要' },
    { from: 'M_实况', to: 'R_情报板', type: '需要' },
  ];
  const matchPath = [
    { id: 'E_占道' },
    { id: 'M_封车道' },
    { id: 'M_调清障' },
    { id: 'R_清障车' },
    { id: 'M_实况' },
    { id: 'R_情报板' },
    ...(flow.congested
      ? [
          { id: 'E_拥堵' },
          { id: 'M_预置分流' },
          { id: 'M_限速' },
          { id: 'M_拥堵预警' },
        ]
      : []),
    ...(ev.hazmat === true
      ? [
          { id: 'E_危化泄漏' },
          { id: 'M_调消防' },
          { id: 'R_消防' },
          { id: 'M_全封' },
          ...(isTunnel ? [{ id: 'C_隧道' }, { id: 'M_通风' }] : []),
        ]
      : []),
    ...((ev.casualties ?? 0) >= 1
      ? [{ id: 'E_伤亡' }, { id: 'M_调120' }, { id: 'R_救护车' }]
      : []),
  ];
  steps.push({
    id: `T-${id}-05`,
    eventId: id,
    phase: '裁剪匹配',
    title: `约束裁剪与措施匹配：命中 ${measures.length} 项措施`,
    dataSources: ['图库', '模板', '快照'],
    edges: matchEdges,
    path: matchPath,
    mapRefs: ['accident'],
    conclusion: '措施清单生成完成，参数模板已填参并附来源指针；可行性裁剪：匝道可用，无裁剪',
    specRef: '3.3.7-⑤ / 3.5',
  });

  return { steps, calcs: flow.calcs, measures, w: flow.w };
}
