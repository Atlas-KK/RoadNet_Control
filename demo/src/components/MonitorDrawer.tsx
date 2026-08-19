import { useEffect } from 'react';
import MonitorPanel from './MonitorPanel';

interface MonitorDrawerProps {
  selectedCameraId: string;
  onClose: () => void;
}

/** 运行模式现场监控按需抽屉；覆盖右侧工作列，但保留左侧分诊与 GIS 可见。 */
export default function MonitorDrawer({ selectedCameraId, onClose }: MonitorDrawerProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="absolute inset-y-0 right-0 z-[150] w-[560px] max-w-[70%] shadow-[0_0_60px_rgb(0_0_0/0.55)]"
      data-testid="monitor-drawer"
    >
      <div className="relative h-full min-h-0">
        <button
          type="button"
          data-testid="monitor-drawer-close"
          onClick={onClose}
          className="absolute right-2 top-2 z-[155] rounded border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand-700)]"
        >
          ✕ 关闭
        </button>
        <MonitorPanel selectedCameraId={selectedCameraId} />
      </div>
    </div>
  );
}
