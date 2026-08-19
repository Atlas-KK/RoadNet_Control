// ============================================================
// 三档复核（开发规格 §6.2 / 方案 2.5）
// 按措施类型而非事件等级划线：
//   控制类     —— 进待办队列，需「确认下发」；确认后展示确认耗时
//   实况发布类 —— 自动执行，队列灰色留痕条目标注「自动+审计」
//   预测预警类 —— 进待办队列，按钮为「一键确认」（单击即过，视觉更轻）
// ============================================================

export type Tier = '控制类' | '实况类' | '预测预警类';

export interface TierMeta {
  tier: Tier;
  color: string;
  /** 是否需要进入待办队列人工确认 */
  needsConfirm: boolean;
  /** 是否自动执行 */
  autoExecute: boolean;
  confirmLabel?: string; // 待办按钮文案
  desc: string;
}

export const TIER_META: Record<Tier, TierMeta> = {
  控制类: {
    tier: '控制类',
    color: 'var(--color-brand)',
    needsConfirm: true,
    autoExecute: false,
    confirmLabel: '确认下发',
    desc: '限速/封道/分流/调派/实质引导驾驶行为——一律强制人工确认',
  },
  实况类: {
    tier: '实况类',
    color: 'var(--color-ink-soft)',
    needsConfirm: false,
    autoExecute: true,
    desc: '已确认事件的客观提示——自动执行 + 事后审计留痕',
  },
  预测预警类: {
    tier: '预测预警类',
    color: 'var(--color-warn)',
    needsConfirm: true,
    autoExecute: false,
    confirmLabel: '一键确认',
    desc: '基于预测的预警——轻量一键确认',
  },
};

/** 措施节点 id → 复核档位 */
const CONTROL_MEASURES = new Set([
  'M_封车道',
  'M_全封',
  'M_预置分流',
  'M_提前分流',
  'M_限速',
  'M_调清障',
  'M_调120',
  'M_调消防',
  'M_通风',
  'M_临时组织',
]);
const LIVE_MEASURES = new Set(['M_实况']);
const PREDICT_MEASURES = new Set(['M_拥堵预警']);

export function classifyMeasure(measureId: string): Tier {
  if (LIVE_MEASURES.has(measureId)) return '实况类';
  if (PREDICT_MEASURES.has(measureId)) return '预测预警类';
  if (CONTROL_MEASURES.has(measureId)) return '控制类';
  return '控制类'; // 默认从严归入控制类（实质重于形式）
}

/** 危化品/全幅封道等高危措施需强制升级打断（全屏模态）——S3 用 */
export function needsForcedInterrupt(measureIds: string[]): boolean {
  return measureIds.includes('M_全封') || measureIds.includes('M_调消防');
}
