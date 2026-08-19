/** 将“场景基准秒 + 相对模拟秒”格式化为 24 小时制时钟。 */
export function formatSimClock(baseSec: number, simSec: number): string {
  const secondsPerDay = 24 * 3600;
  const total = ((Math.floor(baseSec + simSec) % secondsPerDay) + secondsPerDay) % secondsPerDay;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
