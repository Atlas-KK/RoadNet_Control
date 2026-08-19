import RuntimeBar from './RuntimeBar';

export default function Timeline() {
  return (
    <div className="timeline-shell arco-card flex items-center gap-3 px-4 h-[64px] shrink-0">
      <div className="shrink-0 flex items-center gap-2.5">
        <img src="/brand/shaanxi-highway-control.svg" alt="陕西交控" className="h-9 w-9 shrink-0" />
        <div>
          <div className="text-sm font-bold tracking-wide text-[var(--color-ink)]">路网智能管控</div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3 pl-3">
        <span className="hidden 2xl:inline-flex items-center gap-1 text-[10px] text-[var(--color-pass)] whitespace-nowrap">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-pass)] shadow-[0_0_8px_var(--color-pass)]" />系统在线
        </span>
        <div className="h-5 w-px bg-[var(--color-line)]" />
        <RuntimeBar />
      </div>
    </div>
  );
}
