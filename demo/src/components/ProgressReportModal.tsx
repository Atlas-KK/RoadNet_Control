import { useState } from 'react';
import { useStore } from '../store';
import type { EventProgressReport } from '../domain/event';

interface ProgressReportModalProps {
  eventId: string;
  onClose: () => void;
}

/** 监控员续报入口：报送事件动态，系统再据此决定是否需要更新管控预案。 */
export default function ProgressReportModal({ eventId, onClose }: ProgressReportModalProps) {
  const event = useStore((state) => state.events.find((item) => item.id === eventId));
  const submitProgressReport = useStore((state) => state.submitProgressReport);
  const [source, setSource] = useState('现场核实');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<EventProgressReport['kind']>('续报');
  const [casualties, setCasualties] = useState('');
  const [lanesClosed, setLanesClosed] = useState('');
  const [q, setQ] = useState('');
  const [hazmat, setHazmat] = useState('unchanged');
  const [stage, setStage] = useState('');
  const [error, setError] = useState('');

  if (!event) return null;

  const submit = () => {
    if (!description.trim()) {
      setError('请填写事件动态或订正说明');
      return;
    }
    const numeric = (value: string, label: string, min: number, max?: number): number | undefined => {
      if (value.trim() === '') return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < min || (max != null && parsed > max)) {
        throw new Error(`${label}填写不合法`);
      }
      return parsed;
    };
    try {
      const changes: EventProgressReport['changes'] = {
        casualties: numeric(casualties, '伤亡人数', 0),
        lanesClosed: numeric(lanesClosed, '占道车道数', 0, event.lanesTotal),
        q: numeric(q, '交通量', 0),
        ...(hazmat === 'true' ? { hazmat: true } : hazmat === 'false' ? { hazmat: false } : {}),
        ...(stage.trim() ? { stage: stage.trim() } : {}),
      };
      submitProgressReport(eventId, {
        reporter: '本机值班席',
        source,
        description: description.trim(),
        kind,
        changes,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '续报提交失败');
    }
  };

  return (
    <div className="fixed inset-0 z-[300] grid place-items-center p-3" data-testid="progress-report-modal">
      <button type="button" aria-label="关闭续报" className="absolute inset-0 bg-[#020812]/80" onClick={onClose} />
      <section className="relative flex max-h-[calc(100vh-28px)] w-[560px] max-w-[96vw] flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] shadow-[0_24px_80px_rgb(0_0_0/0.55)]">
        <header className="flex items-start justify-between border-b border-[var(--color-line)] bg-[var(--color-panel-2)] px-4 py-3">
          <div><h3 className="text-sm font-semibold text-[var(--color-ink)]">填报续报 · {eventId}</h3><p className="mt-1 text-[10px] text-[var(--color-ink-soft)]">续报属于事件信息报送；仅在影响研判的事实变动时更新管控预案。</p></div>
          <button type="button" onClick={onClose} className="text-xs text-[var(--color-ink-soft)]">✕</button>
        </header>
        <div className="min-h-0 space-y-3 overflow-y-auto px-4 py-3 text-[11px] text-[var(--color-ink)]">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">报送类型<select value={kind} onChange={(e) => setKind(e.target.value as EventProgressReport['kind'])} className="arco-input h-8 px-2"><option value="续报">续报</option><option value="订正续报">订正续报</option></select></label>
            <label className="flex flex-col gap-1">信息来源<select value={source} onChange={(e) => setSource(e.target.value)} className="arco-input h-8 px-2"><option>现场核实</option><option>巡查人员</option><option>交警通报</option><option>视频巡查</option><option>12122 来电</option></select></label>
          </div>
          <label className="flex flex-col gap-1">事件动态/订正说明（必填）<textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="例如：清障车辆已到场，确认第 1 车道仍无法通行。" className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs" /></label>
          <div className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2.5"><p className="mb-2 text-[10px] text-[var(--color-ink-soft)]">事实动态（留空表示不变；提交变化后系统将重新研判并生成新版本管控预案）</p><div className="grid grid-cols-2 gap-2"><label className="flex flex-col gap-1">伤亡人数<input inputMode="numeric" value={casualties} onChange={(e) => setCasualties(e.target.value)} placeholder={`当前 ${event.casualties ?? '未知'}`} className="arco-input h-8 px-2" /></label><label className="flex flex-col gap-1">占道车道数<input inputMode="numeric" value={lanesClosed} onChange={(e) => setLanesClosed(e.target.value)} placeholder={`当前 ${event.lanesClosed}`} className="arco-input h-8 px-2" /></label><label className="flex flex-col gap-1">交通量（veh/h）<input inputMode="numeric" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`当前 ${event.q}`} className="arco-input h-8 px-2" /></label><label className="flex flex-col gap-1">危化品情况<select value={hazmat} onChange={(e) => setHazmat(e.target.value)} className="arco-input h-8 px-2"><option value="unchanged">不变</option><option value="true">确认涉及危化品</option><option value="false">确认不涉及危化品</option></select></label></div><label className="mt-2 flex flex-col gap-1">处置进展<input value={stage} onChange={(e) => setStage(e.target.value)} placeholder="如：清障作业中、现场恢复观察" className="arco-input h-8 px-2" /></label></div>
          {error && <div className="arco-alert arco-alert-error text-[11px]" role="alert">{error}</div>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-[var(--color-line)] px-4 py-3"><button type="button" onClick={onClose} className="rounded border border-[var(--color-line)] px-3 py-1 text-xs text-[var(--color-ink-soft)]">取消</button><button type="button" onClick={submit} data-testid="progress-report-submit" className="rounded bg-[var(--color-brand)] px-4 py-1 text-xs text-white">提交续报</button></footer>
      </section>
    </div>
  );
}
