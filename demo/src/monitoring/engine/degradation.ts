export type MonitoringDependency = 'gis' | 'video' | 'ai' | 'control';
export type DependencyAvailability = 'available' | 'degraded';

export interface MonitoringDependencyStatus {
  availability: DependencyAvailability;
  reason?: string;
  changedAt?: string;
}

export type MonitoringDependencyHealth = Record<MonitoringDependency, MonitoringDependencyStatus>;

export const DEFAULT_MONITORING_DEPENDENCY_HEALTH: MonitoringDependencyHealth = Object.freeze({
  gis: Object.freeze({ availability: 'available' }),
  video: Object.freeze({ availability: 'available' }),
  ai: Object.freeze({ availability: 'available' }),
  control: Object.freeze({ availability: 'available' }),
});

const DEFAULT_REASON: Record<MonitoringDependency, string> = {
  gis: 'GIS底图服务不可用，已切换路网示意图',
  video: '视频服务不可用，已保留事件卡片和受控证据引用',
  ai: 'AI辅助服务不可用，保留规则建议、人工补报和历史核实',
  control: '智能管控服务不可用，核实结果已保留，可稍后重试接管',
};

export function degradeMonitoringDependency(
  current: MonitoringDependencyHealth,
  dependency: MonitoringDependency,
  changedAt: string,
  reason?: string,
): MonitoringDependencyHealth {
  return {
    ...current,
    [dependency]: { availability: 'degraded', reason: reason?.trim() || DEFAULT_REASON[dependency], changedAt },
  };
}

export function restoreMonitoringDependency(
  current: MonitoringDependencyHealth,
  dependency: MonitoringDependency,
  changedAt: string,
): MonitoringDependencyHealth {
  return { ...current, [dependency]: { availability: 'available', changedAt } };
}

export function degradedDependencyMessages(health: MonitoringDependencyHealth): string[] {
  return (Object.keys(health) as MonitoringDependency[])
    .filter((dependency) => health[dependency].availability === 'degraded')
    .map((dependency) => health[dependency].reason ?? DEFAULT_REASON[dependency]);
}
