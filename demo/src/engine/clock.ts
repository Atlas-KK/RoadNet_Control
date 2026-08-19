// ============================================================
// 模拟时钟驱动（开发规格 §2 / §8）
// requestAnimationFrame 逐帧推进 simSec；倍速 = 每帧 dt × speed。
// 暂停时停止推进；重播由 store.reset() 完成状态完全重置。
// ============================================================

import { useEffect } from 'react';
import { useStore } from '../store';

/** 在 App 顶层挂载一次；running/speed 变化时自动重建循环。 */
export function useClockDriver(): void {
  const running = useStore((s) => s.running);
  const speed = useStore((s) => s.speed);
  const tick = useStore((s) => s.tick);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dtSec = (now - last) / 1000;
      last = now;
      // 防止后台切回时 dt 过大导致跳变，单帧上限 0.1s 实时
      tick(Math.min(dtSec, 0.1) * speed);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, tick]);
}
