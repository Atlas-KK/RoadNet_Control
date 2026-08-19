// ============================================================
// 简化交通流计算模型（开发规格 §4）
// 确定性排队/激波简化模型，只求量级正确与过程可展示。
// 所有计算产出 CalcRecord 进入计算面板（§4.2 三行 + 来源徽章）。
// 公式与默认参数严格按 §4.1，不自行发明。
// ============================================================

import type { CalcRecord } from './trace';

// ---- 默认参数（§4.1） ----
export const FLOW_PARAMS = {
  C_LANE: 1800, // 单车道通行能力 veh/h/车道
  ALPHA: 0.85, // 事故干扰折减
  V_F: 110, // 自由流速 km/h（G65）
  K_J: 140, // 阻塞密度 veh/km/车道
};

/** 事件的交通流上下文输入 */
export interface FlowContext {
  eventId: string;
  accidentKp: number; // 事故点桩号
  lanesTotal: number; // n 总车道数
  lanesClosed: number; // k 占用车道数
  q: number; // 断面流量 veh/h（时序流）
  vf?: number; // 自由流速（缺省用 G65 110）
}

/** 交通流计算结果（含全部中间量与 CalcRecord） */
export interface FlowResult {
  C_b: number; // 瓶颈通行能力 veh/h
  k_a: number; // 行驶密度 veh/km
  k_q: number; // 排队密度 veh/km
  w: number; // 排队尾部回溯速度 km/h（q>C_b 时 >0）
  w_d: number; // 消散速度 km/h
  congested: boolean; // q>C_b 是否成立（是否形成排队）
  calcs: CalcRecord[]; // 四条核心 CalcRecord
}

function fmt(n: number, digits = 1): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(digits);
}

/**
 * 计算事件的交通流核心量并生成 CalcRecord 序列（§4.1 / §4.2）。
 * 顺序：① C_b 瓶颈通行能力 → ② k_a 行驶密度 → ③ k_q 排队密度 → ④ w 回溯速度。
 */
export function computeFlow(ctx: FlowContext): FlowResult {
  const { C_LANE, ALPHA, K_J } = FLOW_PARAMS;
  const vf = ctx.vf ?? FLOW_PARAMS.V_F;
  const n = ctx.lanesTotal;
  const k = ctx.lanesClosed;
  const q = ctx.q;
  if (![ctx.accidentKp, n, k, q, vf].every(Number.isFinite)) {
    throw new Error(`交通流输入包含非有限数值：${ctx.eventId}`);
  }
  if (n <= 0 || !Number.isInteger(n) || k < 0 || !Number.isInteger(k) || k > n) {
    throw new Error(`车道参数非法：n=${n}, k=${k}`);
  }
  if (q < 0 || vf <= 0) throw new Error(`交通流参数非法：q=${q}, vf=${vf}`);

  // ① 瓶颈通行能力 C_b = (n − k) × C_lane × α
  const C_b = (n - k) * C_LANE * ALPHA;
  // ② 行驶密度 k_a = q / v_f
  const k_a = q / vf;
  // ③ 排队密度 k_q = k_j × n
  const k_q = K_J * n;
  // ④ 排队尾部回溯速度 w = (q − C_b) / (k_q − k_a)（q>C_b 时）
  const congested = q > C_b;
  const densityGap = k_q - k_a;
  if (congested && densityGap <= 0) {
    throw new Error(`排队密度必须大于行驶密度：k_q=${k_q}, k_a=${k_a}`);
  }
  const w = congested ? (q - C_b) / densityGap : 0;
  const w_d = 2 * w; // 消散速度（MVP 简化）

  const id = ctx.eventId;
  const calcs: CalcRecord[] = [
    {
      id: `C-${id}-01`,
      eventId: id,
      label: '瓶颈通行能力',
      formula: 'C_b = (n − k) × C_lane × α',
      substitution: `= (${n} − ${k}) × ${C_LANE} × ${ALPHA}`,
      result: `= ${fmt(C_b)} veh/h`,
      conclusion: `事故影响后，当前可用通行能力约为 ${fmt(C_b)} 辆/小时。`,
      conclusionTone: 'info',
      summaryRole: 'capacity',
      summaryValue: `${fmt(C_b)} veh/h`,
      badges: [
        { text: 'n,k', from: '事件快照' },
        { text: 'C_lane,α', from: '模型参数' },
      ],
      paramTable: [
        { name: 'n 总车道', value: String(n), source: '事件快照' },
        { name: 'k 占用车道', value: String(k), source: '事件快照' },
        { name: 'C_lane', value: String(C_LANE), source: '模型参数' },
        { name: 'α 折减', value: String(ALPHA), source: '模型参数' },
      ],
    },
    {
      id: `C-${id}-02`,
      eventId: id,
      label: '行驶密度',
      formula: 'k_a = q / v_f',
      substitution: `= ${fmt(q)} / ${vf}`,
      result: `= ${fmt(k_a)} veh/km`,
      conclusion: `当前车流对应的行驶密度约为 ${fmt(k_a)} 辆/公里。`,
      conclusionTone: 'info',
      summaryRole: 'drivingDensity',
      summaryValue: `${fmt(k_a)} veh/km`,
      badges: [
        { text: 'q', from: '时序流' },
        { text: 'v_f', from: '模型参数' },
      ],
      paramTable: [
        { name: 'q 断面流量', value: `${fmt(q)} veh/h`, source: '时序流' },
        { name: 'v_f 自由流速', value: `${vf} km/h`, source: '模型参数' },
      ],
    },
    {
      id: `C-${id}-03`,
      eventId: id,
      label: '排队密度',
      formula: 'k_q = k_j × n',
      substitution: `= ${K_J} × ${n}`,
      result: `= ${fmt(k_q)} veh/km`,
      conclusion: `按当前车道规模，完全排队状态下每公里约容纳 ${fmt(k_q)} 辆车。`,
      conclusionTone: 'info',
      summaryRole: 'queueDensity',
      summaryValue: `${fmt(k_q)} veh/km`,
      badges: [
        { text: 'k_j', from: '模型参数' },
        { text: 'n', from: '事件快照' },
      ],
      paramTable: [
        { name: 'k_j 阻塞密度', value: `${K_J} veh/km/车道`, source: '模型参数' },
        { name: 'n 总车道', value: String(n), source: '事件快照' },
      ],
    },
    {
      id: `C-${id}-04`,
      eventId: id,
      label: '排队回溯速度',
      formula: 'w = (q − C_b) / (k_q − k_a)',
      substitution: `= (${fmt(q)} − ${fmt(C_b)}) / (${fmt(k_q)} − ${fmt(k_a)})`,
      result: congested ? `= ${fmt(w)} km/h` : '= 0（q ≤ C_b，未形成排队）',
      conclusion: congested
        ? `当前流量 ${fmt(q)} 辆/小时超过事故后通行能力 ${fmt(C_b)} 辆/小时，已形成排队，队尾正以约 ${fmt(w)} km/h 向上游回溯。`
        : `当前流量 ${fmt(q)} 辆/小时未超过事故后通行能力 ${fmt(C_b)} 辆/小时，暂不形成排队。`,
      conclusionTone: congested ? 'danger' : 'success',
      summaryRole: 'spillbackSpeed',
      summaryValue: congested ? `${fmt(w)} km/h` : '0 km/h',
      badges: [
        { text: 'q', from: '时序流' },
        { text: 'C_b', from: '本面板#1' },
        { text: 'k_q,k_a', from: '本面板#3/#2' },
      ],
      paramTable: [
        { name: 'q', value: `${fmt(q)} veh/h`, source: '时序流' },
        { name: 'C_b', value: `${fmt(C_b)} veh/h`, source: '本面板#1' },
        { name: 'k_q', value: `${fmt(k_q)} veh/km`, source: '本面板#3' },
        { name: 'k_a', value: `${fmt(k_a)} veh/km`, source: '本面板#2' },
      ],
    },
  ];

  return { C_b, k_a, k_q, w, w_d, congested, calcs };
}

/** 排队长度 L(t) = w × t（t 分钟 → 小时换算），返回 km */
export function queueLength(w: number, tMin: number): number {
  return (w * tMin) / 60;
}

/** 排队到达某点时间 T(kp) = distance(事故点上游, kp) / w，返回分钟 */
export function timeToPoint(distanceKm: number, w: number): number {
  if (w <= 0) return Infinity;
  return (distanceKm / w) * 60;
}

/** 排队尾部当前桩号（向上游=桩号减小方向回溯） */
export function queueTailKp(accidentKp: number, w: number, tMin: number): number {
  return accidentKp - queueLength(w, tMin);
}

/** 生成 T(kp) 的 CalcRecord（供分流/冲突校验等场景复用） */
export function calcTimeToPoint(
  id: string,
  eventId: string,
  label: string,
  distanceKm: number,
  w: number,
): CalcRecord {
  const t = timeToPoint(distanceKm, w);
  return {
    id,
    eventId,
    label,
    formula: 'T(kp) = distance / w',
    substitution: `= ${fmt(distanceKm)} km / ${fmt(w)} km/h × 60`,
    result: `= ${fmt(t)} min`,
    conclusion: Number.isFinite(t)
      ? `预计排队尾部约 ${fmt(t)} 分钟后到达目标点。`
      : '当前未形成排队，无法计算队尾到达时间。',
    conclusionTone: Number.isFinite(t) ? 'warning' : 'success',
    summaryRole: 'arrivalTime',
    summaryValue: Number.isFinite(t) ? `约 ${fmt(t)} 分钟后到达目标点` : '当前未形成排队，无法计算队尾到达时间',
    badges: [
      { text: 'distance', from: 'GIS现算' },
      { text: 'w', from: '流模型' },
    ],
  };
}
