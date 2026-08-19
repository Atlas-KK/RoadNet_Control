export type Severity = '特别重大' | '重大' | '较大' | '一般';

export interface SeverityInput {
  lanesTotal: number;
  lanesClosed: number;
  casualties?: number;
  hazmat?: boolean;
  inTunnel: boolean;
  congested: boolean;
}

export interface SeverityResult {
  level: Severity;
  rank: number;
  reasons: string[];
}

export const SEVERITY_META: Record<Severity, { rank: number; color: string; label: string }> = {
  特别重大: { rank: 0, color: 'var(--color-danger)', label: '特别重大' },
  重大: { rank: 1, color: '#ef7f3b', label: '重大' },
  较大: { rank: 2, color: 'var(--color-warn)', label: '较大' },
  一般: { rank: 3, color: 'var(--color-ink-soft)', label: '一般' },
};

function result(level: Severity, reasons: string[]): SeverityResult {
  return { level, rank: SEVERITY_META[level].rank, reasons };
}

/** 按已确认的初值规则短路评估事故等级；等级仅用于排序与显示，不改变接管状态。 */
export function assessSeverity(input: SeverityInput): SeverityResult {
  const casualties = input.casualties ?? 0;
  const hazmat = input.hazmat === true;
  const ratio = input.lanesTotal > 0 ? input.lanesClosed / input.lanesTotal : 0;

  const top: string[] = [];
  if (hazmat && input.inTunnel) top.push('危化品×隧道');
  if (casualties >= 10) top.push('伤亡≥10人');
  if (top.length > 0) return result('特别重大', top);

  const major: string[] = [];
  if (hazmat) major.push('危化品');
  if (casualties >= 3) major.push('伤亡≥3人');
  if (input.lanesClosed === input.lanesTotal) major.push('全幅占道');
  if (input.inTunnel && input.lanesClosed >= 2) major.push('隧道内占用≥2车道');
  if (major.length > 0) return result('重大', major);

  const moderate: string[] = [];
  if (casualties >= 1) moderate.push('有伤亡');
  if (ratio >= 2 / 3) moderate.push('占道≥2/3');
  if (input.congested) moderate.push('已形成拥堵');
  if (moderate.length > 0) return result('较大', moderate);

  return result('一般', ['未触发较大及以上规则']);
}
