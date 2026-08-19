import { describe, expect, it } from 'vitest';
import { formatSimClock } from './time';

describe('模拟时钟格式化', () => {
  it('叠加场景基准时刻和相对秒数', () => {
    expect(formatSimClock(10 * 3600, 22 * 60 + 5)).toBe('10:22:05');
  });

  it('跨越零点时按 24 小时循环', () => {
    expect(formatSimClock(10, -20)).toBe('23:59:50');
  });
});
