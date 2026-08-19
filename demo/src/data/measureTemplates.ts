// ============================================================
// 措施参数模板（开发规格 §3.5）
// 每个措施节点挂参数模板函数：输入事件上下文 → 输出带溯源的参数。
// 每个输出参数携带来源指针 { value, source, formulaRef? }，
// source ∈ 模板计算 / GIS现算 / 快照 / 流模型。
// ============================================================

export type ParamSource = '模板计算' | 'GIS现算' | '快照' | '流模型';

/** 带溯源指针的参数值 */
export interface SourcedParam {
  value: string | number;
  source: ParamSource;
  formulaRef?: string; // 关联 CalcRecord id
  note?: string;
}

function p(value: string | number, source: ParamSource, extra?: Partial<SourcedParam>): SourcedParam {
  return { value, source, ...extra };
}

/** 措施模板通用输入上下文 */
export interface MeasureContext {
  accidentKp: number;
  lanesTotal: number;
  lanesClosed: number;
  isTunnel?: boolean;
  tunnel?: { fromKp: number; toKp: number };
  fogBand?: { fromKp: number; toKp: number };
  wind?: { dir: 'forward' | 'reverse'; speed: number };
  /** 泄漏物是否轻于空气（如液氨） */
  spillLighterThanAir?: boolean;
  /** 可执行落点（雾区外的情报板/收费站），按就近吸附用 */
  executablePoints?: { id: string; kp: number }[];
  wFlow?: number; // 排队回溯速度（流模型），供分流时距计算
}

export interface MeasureOutput {
  measureId: string;
  title: string;
  params: Record<string, SourcedParam>;
  summary: string;
  subMeasures?: string[]; // 附加子措施（如隧道版保留车道限速）
}

// ---- 封闭车道 ----
// 封闭数=占用车道数；隧道内附加「保留车道限速 40 km/h + 引导」
export function tplCloseLanes(ctx: MeasureContext): MeasureOutput {
  const sub: string[] = [];
  if (ctx.isTunnel) sub.push('隧道版：保留车道限速 40 km/h + 引导');
  return {
    measureId: 'M_封车道',
    title: '封闭车道',
    params: {
      封闭车道数: p(ctx.lanesClosed, '快照', { note: '=占用车道数' }),
      保留车道数: p(ctx.lanesTotal - ctx.lanesClosed, '模板计算'),
      参数版本: p(ctx.isTunnel ? '隧道版' : '常规版', '模板计算'),
    },
    summary: `封闭 ${ctx.lanesClosed} 车道，保留 ${ctx.lanesTotal - ctx.lanesClosed} 车道${ctx.isTunnel ? '（隧道版：保留车道限速 40 + 引导）' : ''}`,
    subMeasures: sub,
  };
}

// ---- 全幅封道 ----
// 封道执行点 kp = min(事故点上游安全距离点, 隧道入口−0.5, 雾区上游边界−0.5)
// 再就近落到雾区外的可执行情报板/收费站。
export function tplFullClosure(ctx: MeasureContext): MeasureOutput {
  const SAFE_KM = 4; // 事故点上游安全距离
  const candSafe = ctx.accidentKp - SAFE_KM;
  const candTunnel = ctx.tunnel ? ctx.tunnel.fromKp - 0.5 : Infinity;
  const candFog = ctx.fogBand ? ctx.fogBand.fromKp - 0.5 : Infinity; // 雾区上游边界=fromKp（桩号小侧）
  const minKp = Math.min(candSafe, candTunnel, candFog);

  // 就近吸附到 ≤minKp 且在雾区外的可执行落点
  let snap: { id: string; kp: number } | undefined;
  const outsideFog = (kp: number) =>
    !ctx.fogBand || kp < ctx.fogBand.fromKp || kp > ctx.fogBand.toKp;
  if (ctx.executablePoints) {
    const cands = ctx.executablePoints
      .filter((e) => e.kp <= minKp && outsideFog(e.kp))
      .sort((a, b) => b.kp - a.kp); // 取最接近 minKp（最下游）的雾区外落点
    snap = cands[0];
  }

  return {
    measureId: 'M_全封',
    title: '全幅封道',
    params: {
      候选_上游安全点: p(`K${candSafe.toFixed(1)}`, '模板计算', { note: `事故点 − ${SAFE_KM}km` }),
      候选_隧道入口: p(candTunnel === Infinity ? '—' : `K${candTunnel.toFixed(1)}`, 'GIS现算', { note: '隧道入口 − 0.5km' }),
      候选_雾区上游: p(candFog === Infinity ? '—' : `K${candFog.toFixed(1)}`, 'GIS现算', { note: '雾区上游边界 − 0.5km' }),
      封道点计算值: p(`K${minKp.toFixed(1)}`, '模板计算', { note: '三候选取 min（最上游）' }),
      封道执行落点: snap ? p(`${snap.id}@K${snap.kp}`, 'GIS现算', { note: '就近吸附至雾区外可执行设备' }) : p('无可行落点', '模板计算'),
    },
    summary: snap
      ? `封道点计算值 K${minKp.toFixed(1)} → 就近落到雾区外 ${snap.id}@K${snap.kp}`
      : `封道点计算值 K${minKp.toFixed(1)}（无雾区外可行落点）`,
  };
}

// ---- 隧道通风控制 ----
// 泄漏物密度轻于空气 ∧ 洞内自然风向=正向 → 正向排风至出口侧；
// 出口侧下游 1.5km 设无人管制区；人员疏散方向=逆风侧。
export function tplTunnelVentilation(ctx: MeasureContext): MeasureOutput {
  const lighter = ctx.spillLighterThanAir === true;
  const windForward = ctx.wind?.dir === 'forward';
  // 判定表四象限：density(lighter/heavier) × wind(forward/reverse)
  // 规格给定命中格：lighter ∧ forward → 正向排风
  const ventDir: 'forward' | 'reverse' = lighter && windForward ? 'forward' : lighter && !windForward ? 'reverse' : windForward ? 'forward' : 'reverse';
  const outKp = ctx.tunnel ? ctx.tunnel.toKp : ctx.accidentKp + 1.2;
  const controlZone = { fromKp: outKp, toKp: outKp + 1.5 };
  const evacuate = windForward ? '入口侧（逆风）' : '出口侧（逆风）';
  return {
    measureId: 'M_通风',
    title: '隧道通风控制',
    params: {
      泄漏物密度: p(lighter ? '轻于空气' : '重于空气', '快照'),
      洞内自然风向: p(windForward ? '正向(入口→出口)' : '反向', '快照', { note: `风速 ${ctx.wind?.speed ?? '—'} m/s` }),
      排风方向: p(ventDir === 'forward' ? '正向排风至出口侧' : '反向排风至入口侧', '模板计算', { note: '密度×风向判定表命中格' }),
      无人管制区: p(`K${controlZone.fromKp.toFixed(1)}–K${controlZone.toKp.toFixed(1)}`, 'GIS现算', { note: '出口侧下游 1.5km' }),
      人员疏散方向: p(evacuate, '模板计算', { note: '逆风侧' }),
    },
    summary: `${ventDir === 'forward' ? '正向排风至出口侧' : '反向排风至入口侧'}；无人管制区 K${controlZone.fromKp.toFixed(1)}–K${controlZone.toKp.toFixed(1)}；疏散 ${evacuate}`,
  };
}

// ---- 预置分流 ----
// 默认路径=经 K1160 枢纽 → G56 K26 汇入；执行前必须通过跨事件冲突校验（§5.4）
export function tplPresetDiversion(_ctx: MeasureContext): MeasureOutput {
  return {
    measureId: 'M_预置分流',
    title: '预置分流',
    params: {
      分流路径: p('经 K1160 枢纽 → G56 K26 汇入', 'GIS现算'),
      冲突校验: p('执行前必过跨事件冲突校验（§5.4）', '模板计算'),
    },
    summary: '默认路径：经 K1160 枢纽 → G56 K26 汇入（需通过跨事件冲突校验）',
  };
}

// ---- 提前分流 ----
// 路径=K1140 互通 → S204，绕行代价 +12 min
export function tplEarlyDiversion(_ctx: MeasureContext): MeasureOutput {
  return {
    measureId: 'M_提前分流',
    title: '提前分流',
    params: {
      分流路径: p('K1140 互通 → S204', 'GIS现算'),
      绕行代价: p('+12 min', '模板计算'),
    },
    summary: '路径：K1140 互通 → S204（绕行代价 +12 min）',
  };
}

/** 措施 id → 模板函数索引（reasoner 调用） */
export const MEASURE_TEMPLATES: Record<string, (ctx: MeasureContext) => MeasureOutput> = {
  M_封车道: tplCloseLanes,
  M_全封: tplFullClosure,
  M_通风: tplTunnelVentilation,
  M_预置分流: tplPresetDiversion,
  M_提前分流: tplEarlyDiversion,
};
