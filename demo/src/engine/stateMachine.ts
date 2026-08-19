// ============================================================
// 预案版本状态机（开发规格 §6.1 / 方案 2.7）
// 状态集：草案 → 待确认 → 已确认 → 已下发 → 执行中 → 已完成/已作废/已被替换
// 规则：新版本生成时，待确认旧版自动转「已被替换」；
//       已确认/已下发旧版措施在新版中逐条标注 继承/新增/撤销（撤销生成回收指令）。
// ============================================================

export type PlanState =
  | '草案'
  | '待确认'
  | '已确认'
  | '已下发'
  | '执行中'
  | '已完成'
  | '已作废'
  | '已被替换';

/** 迷你状态图的主链顺序（分支终态另绘） */
export const STATE_CHAIN: PlanState[] = ['草案', '待确认', '已确认', '已下发', '执行中', '已完成'];
export const TERMINAL_BRANCH: PlanState[] = ['已作废', '已被替换'];

/** 措施在版本 diff 中的标记 */
export type DiffStatus = '继承' | '新增' | '撤销' | '降级';

export const DIFF_STYLE: Record<DiffStatus, { label: string; color: string; bg: string; strike?: boolean }> = {
  继承: { label: '继承', color: 'var(--color-ink-soft)', bg: 'var(--color-panel-2)' },
  新增: { label: '新增', color: 'var(--color-pass)', bg: 'var(--color-pass-50)' },
  撤销: { label: '撤销', color: 'var(--color-danger)', bg: 'var(--color-danger-50)', strike: true },
  降级: { label: '降级', color: 'var(--color-warn)', bg: 'var(--color-warn-50)' },
};

/** 控制类措施确认后推进的状态序列 */
export function nextConfirmState(s: PlanState): PlanState {
  switch (s) {
    case '待确认':
      return '已确认';
    case '已确认':
      return '已下发';
    case '已下发':
      return '执行中';
    default:
      return s;
  }
}

/** 新版本生成时旧版本的流转：待确认→已被替换；已确认/已下发→已被替换（措施逐条继承/撤销） */
export function supersedeState(old: PlanState): PlanState {
  if (old === '已完成' || old === '已作废') return old;
  return '已被替换';
}
