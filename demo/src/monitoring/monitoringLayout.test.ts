import { describe, expect, it } from 'vitest';
import { monitoringGridColumns } from './monitoringLayout';

describe('FR-EM-004 视频事件卡片响应式合同', () => {
  it.each([
    [1920, 4],
    [1440, 3],
    [1366, 3],
    [1280, 2],
  ] as const)('%ipx每行%i张', (width, columns) => {
    expect(monitoringGridColumns(width)).toBe(columns);
  });

  it('低于MVP验收宽度时明确拒绝伪装为手机端支持', () => {
    expect(() => monitoringGridColumns(1279)).toThrow('最低验收宽度');
  });
});
