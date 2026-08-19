// ============================================================
// 核心业务窗口的统一外壳。
// 集中维护边框、背景、阴影、标题栏和全屏按钮，避免各面板复制同一套 JSX。
// ============================================================

import type { ReactNode } from 'react';
import type { FullscreenPanelControl } from './FullscreenPanel';

interface PanelFrameProps {
  testId: string;
  fullscreen: FullscreenPanelControl;
  title: ReactNode;
  headerActions?: ReactNode;
  customHeader?: ReactNode;
  children: ReactNode;
  rootClassName?: string;
  headerClassName?: string;
  mapMode?: 'gis';
}

/**
 * 统一渲染可全屏业务面板的结构；调用方只提供标题区业务信息和主体内容。
 * 全屏状态仍由调用方创建，地图组件可继续监听该状态并主动刷新画布尺寸。
 */
export default function PanelFrame({
  testId,
  fullscreen,
  title,
  headerActions,
  customHeader,
  children,
  rootClassName = '',
  headerClassName = 'h-[48px]',
  mapMode,
}: PanelFrameProps) {
  return (
    <>
      {fullscreen.backdrop}
      <section
        data-testid={testId}
        data-fullscreen={fullscreen.isFullscreen}
        data-map-mode={mapMode}
        className={`h-full min-h-0 flex flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] ${rootClassName} ${fullscreen.rootClassName}`}
      >
        {customHeader ?? (
          <header className={`${headerClassName} shrink-0 px-4 border-b border-[var(--color-line)] bg-[var(--color-panel)] flex items-center justify-between`}>
            <div className="min-w-0">{title}</div>
            <div className="shrink-0 flex items-center gap-2">
              {headerActions}
              {fullscreen.button}
            </div>
          </header>
        )}
        {children}
      </section>
    </>
  );
}
