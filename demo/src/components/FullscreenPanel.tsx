// ============================================================
// 面板全屏交互公共能力。
// 保持原面板 DOM 和内部状态不变，仅切换 fixed 定位；退出后可恢复原布局和滚动状态。
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface FullscreenPanelControl {
  /** 当前面板是否覆盖工作区显示。 */
  isFullscreen: boolean;
  /** 全屏时附加到面板根节点的定位与层级样式。 */
  rootClassName: string;
  /** 位于面板下方的遮罩；点击遮罩可退出全屏。 */
  backdrop: React.ReactNode;
  /** 放入面板标题栏的“全屏/返回”按钮。 */
  button: React.ReactNode;
}

/**
 * 为业务面板提供统一的全屏状态、遮罩、按钮及键盘交互。
 *
 * 采用 CSS fixed 定位而非浏览器原生 Fullscreen API，原因是运行时仍需保留应用页面环境，
 * 同时避免浏览器权限提示。全屏期间锁定 body 滚动，并支持 Esc 或遮罩点击退出。
 *
 * @param panelId 面板稳定标识，用于自动化测试定位。
 * @param panelLabel 面板中文名称，用于按钮无障碍说明。
 */
export function usePanelFullscreen(panelId: string, panelLabel: string): FullscreenPanelControl {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const exitFullscreen = useCallback(() => setIsFullscreen(false), []);
  const toggleFullscreen = useCallback(() => setIsFullscreen((current) => !current), []);

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitFullscreen();
    };
    document.addEventListener('keydown', handleKeyDown);
    buttonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      // 返回原布局后把焦点交还给触发按钮，方便键盘用户继续操作。
      previousFocus?.focus();
    };
  }, [exitFullscreen, isFullscreen]);

  return {
    isFullscreen,
    rootClassName: isFullscreen
      ? 'fixed !inset-3 !w-auto !h-auto z-[200] ring-1 ring-[var(--color-brand)] shadow-[0_24px_80px_rgb(0_0_0/0.55)]'
      : '',
    backdrop: isFullscreen ? (
      <button
        type="button"
        data-testid={`${panelId}-fullscreen-backdrop`}
        aria-label={`退出${panelLabel}全屏展示`}
        className="fixed inset-0 z-[190] cursor-default bg-[#000000]/88 backdrop-blur-sm"
        onClick={exitFullscreen}
      />
    ) : null,
    button: (
      <button
        ref={buttonRef}
        type="button"
        data-testid={`${panelId}-fullscreen-toggle`}
        aria-label={isFullscreen ? `返回${panelLabel}原始布局` : `全屏展示${panelLabel}`}
        aria-pressed={isFullscreen}
        title={isFullscreen ? '返回原始布局（Esc）' : '全屏展示'}
        onClick={toggleFullscreen}
        className={`arco-button arco-button-size-mini shrink-0 ${
          isFullscreen
            ? 'border-[var(--color-brand)] bg-[var(--color-brand)] text-white'
            : 'border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink-soft)] hover:border-[var(--color-brand)] hover:bg-[var(--color-brand-50)] hover:text-[var(--color-brand-700)]'
        }`}
      >
        <span aria-hidden="true">{isFullscreen ? '↙' : '⛶'}</span>
        {isFullscreen ? '返回' : '全屏'}
      </button>
    ),
  };
}
