import { describe, expect, it } from 'vitest';
import { DEFAULT_MONITORING_DEPENDENCY_HEALTH, degradeMonitoringDependency, degradedDependencyMessages, restoreMonitoringDependency } from './degradation';

describe('阶段10 服务降级纯规则', () => {
  it('单个依赖降级不改变其他依赖', () => {
    const next = degradeMonitoringDependency(DEFAULT_MONITORING_DEPENDENCY_HEALTH, 'video', '2026-08-25T03:00:00.000Z');
    expect(next.video).toMatchObject({ availability: 'degraded' });
    expect(next.gis.availability).toBe('available');
    expect(degradedDependencyMessages(next)[0]).toContain('事件卡片和受控证据引用');
  });

  it('恢复只清除指定依赖的降级', () => {
    const failed = degradeMonitoringDependency(degradeMonitoringDependency(DEFAULT_MONITORING_DEPENDENCY_HEALTH, 'gis', 'T1'), 'ai', 'T2');
    const restored = restoreMonitoringDependency(failed, 'gis', 'T3');
    expect(restored.gis.availability).toBe('available');
    expect(restored.ai.availability).toBe('degraded');
  });
});
