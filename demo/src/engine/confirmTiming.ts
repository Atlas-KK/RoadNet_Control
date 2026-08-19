// ============================================================
// 控制类措施确认时效（开发规格 MVP · FR-E2 / 产品方案 2.7）
// 目标 ≤3min；超时升级通知；持续超时（≥6min）执行最小安全动作集——
// 仅自动执行实况类与联动提醒，控制类维持待确认，全程留痕。纯函数，便于单测。
// ============================================================

export const CONFIRM_TARGET_SEC = 180; // 3 分钟目标
export const ESCALATE_SEC = 360; // 6 分钟触发最小安全动作集

export type ConfirmTimingStatus = 'ontime' | 'overdue' | 'escalated';

/** 措施展示至今的真实经过秒数。 */
export function confirmElapsedSec(shownAtMs: number, nowMs: number): number {
  return Math.max(0, (nowMs - shownAtMs) / 1000);
}

/** 按经过时长归入三态。 */
export function confirmStatus(shownAtMs: number, nowMs: number): ConfirmTimingStatus {
  const s = confirmElapsedSec(shownAtMs, nowMs);
  if (s >= ESCALATE_SEC) return 'escalated';
  if (s >= CONFIRM_TARGET_SEC) return 'overdue';
  return 'ontime';
}

/** 距目标时限的剩余秒数（负值表示已超时）。 */
export function confirmRemainingSec(shownAtMs: number, nowMs: number): number {
  return CONFIRM_TARGET_SEC - confirmElapsedSec(shownAtMs, nowMs);
}
