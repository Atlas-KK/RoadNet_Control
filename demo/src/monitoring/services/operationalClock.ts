// FR-EM-005 / FR-EM-011：操作SLA时钟与模拟事件时钟严格隔离。

export interface OperationalClock {
  nowMs(): number;
}

export interface OperationalClockSources {
  wallNowMs: () => number;
  monotonicNowMs: () => number;
}

const systemSources: OperationalClockSources = {
  wallNowMs: () => Date.now(),
  monotonicNowMs: () => performance.now(),
};

/**
 * 使用一次墙上时间定锚，后续仅按单调时钟推进，避免系统时间回拨影响SLA。
 * 模拟场景的暂停、恢复和倍速不得操作此时钟。
 */
export class SystemOperationalClock implements OperationalClock {
  private readonly sources: OperationalClockSources;
  private readonly anchorWallMs: number;
  private readonly anchorMonotonicMs: number;

  constructor(sources: OperationalClockSources = systemSources) {
    this.sources = sources;
    this.anchorWallMs = sources.wallNowMs();
    this.anchorMonotonicMs = sources.monotonicNowMs();
  }

  nowMs(): number {
    const elapsed = Math.max(0, this.sources.monotonicNowMs() - this.anchorMonotonicMs);
    return this.anchorWallMs + elapsed;
  }
}

export function operationalTimeIso(clock: OperationalClock): string {
  return new Date(clock.nowMs()).toISOString();
}
