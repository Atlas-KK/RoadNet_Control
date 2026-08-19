// ============================================================
// StateMachineMini 版本状态机迷你图（开发规格 §6.1 / §7.3）
// 主链高亮当前状态，流转时 300ms 过渡；分支终态（已作废/已被替换）另绘。
// ============================================================

import { STATE_CHAIN, TERMINAL_BRANCH, type PlanState } from '../engine/stateMachine';

export default function StateMachineMini({ state }: { state: PlanState }) {
  const isBranch = TERMINAL_BRANCH.includes(state);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STATE_CHAIN.map((s, i) => {
        const active = s === state;
        return (
          <div key={s} className="flex items-center gap-1">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full border transition-all duration-300"
              style={{
                background: active ? 'var(--color-brand)' : 'var(--color-panel-2)',
                color: active ? '#fff' : 'var(--color-ink-soft)',
                borderColor: active ? 'var(--color-brand)' : 'var(--color-line)',
                fontWeight: active ? 700 : 400,
              }}
            >
              {s}
            </span>
            {i < STATE_CHAIN.length - 1 && <span className="text-[8px] text-[var(--color-ink-soft)]">→</span>}
          </div>
        );
      })}
      {isBranch && (
        <>
          <span className="text-[8px] text-[var(--color-ink-soft)]">｜</span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-full border transition-all duration-300"
            style={{ background: 'var(--color-danger)', color: '#fff', borderColor: 'var(--color-danger)', fontWeight: 700 }}
          >
            {state}
          </span>
        </>
      )}
    </div>
  );
}
