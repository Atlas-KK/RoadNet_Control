// ============================================================
// 订正续报中的事件属性修正模态（FR-F2 补充 / 附录A·案例四撤销传导入口）
// 值班员核实事件属性有误（如危化品泄漏证伪、伤亡人数订正）后，在此撤回对应语义
// 事实；提交后 store.reviseEventFacts 走 TMS 反向传导，逐条给出措施保留/降级/撤销
// 结论并生成新版本，而非要求值班员手工逐条修改预案。
// ============================================================

import { useState } from 'react';
import { useStore } from '../store';

interface FactReviseModalProps {
  eventId: string;
  onClose: () => void;
}

const FACT_OPTIONS: { fact: string; label: string; visible: (hazmat: boolean, casualties: number) => boolean }[] = [
  { fact: 'F_泄漏', label: '危化品泄漏证伪（现场核实无泄漏）', visible: (hazmat) => hazmat },
  { fact: 'F_伤亡', label: '伤亡信息订正（现场核实无人员伤亡）', visible: (_h, casualties) => casualties > 0 },
];

export default function FactReviseModal({ eventId, onClose }: FactReviseModalProps) {
  const event = useStore((s) => s.events.find((e) => e.id === eventId));
  const reviseEventFacts = useStore((s) => s.reviseEventFacts);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  if (!event) return null;
  const options = FACT_OPTIONS.filter((o) => o.visible(event.hazmat === true, event.casualties ?? 0));

  const toggle = (fact: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fact)) next.delete(fact);
      else next.add(fact);
      return next;
    });
  };

  const submit = () => {
    if (selected.size === 0) {
      setError('请至少勾选一项需撤回的事实');
      return;
    }
    if (note.trim().length === 0) {
      setError('请填写核实说明');
      return;
    }
    reviseEventFacts(eventId, [...selected], note.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center" data-testid="fact-revise-modal">
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-[#020812]/80" onClick={onClose} />
      <div className="relative w-[480px] max-w-[92vw] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-[0_24px_80px_rgb(0_0_0/0.55)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">订正续报 · 属性修正 · {eventId}</h3>
          <button type="button" onClick={onClose} className="text-xs text-[var(--color-ink-soft)]">✕</button>
        </div>
        {options.length === 0 ? (
          <div className="text-xs text-[var(--color-ink-soft)]">该事件当前无可撤回的危化品/伤亡属性。</div>
        ) : (
          <div className="space-y-2">
            {options.map((o) => (
              <label key={o.fact} className="flex items-start gap-2 text-[12px] text-[var(--color-ink)]">
                <input type="checkbox" className="mt-0.5" checked={selected.has(o.fact)} onChange={() => toggle(o.fact)} />
                {o.label}
              </label>
            ))}
            <label className="flex flex-col gap-1 text-[10px] text-[var(--color-ink-soft)] pt-1">
              核实说明（必填）
              <textarea
                className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-xs text-[var(--color-ink)]"
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="如：现场核实罐体完好，无泄漏"
              />
            </label>
          </div>
        )}
        {error && <div className="arco-alert arco-alert-error mt-2 text-[11px]" role="alert">{error}</div>}
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1 text-xs rounded border border-[var(--color-line)] text-[var(--color-ink-soft)]">取消</button>
          {options.length > 0 && (
            <button type="button" onClick={submit} data-testid="fact-revise-submit" className="px-4 py-1 text-xs rounded bg-[var(--color-brand)] text-white">
              提交并撤销传导
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
