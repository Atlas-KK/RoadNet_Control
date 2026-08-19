import { describe, expect, it } from 'vitest';
import { propagateRetraction } from './tms';

describe('TMS 撤销传导', () => {
  it('按支撑事实逐条保留、降级或撤销', () => {
    const result = propagateRetraction(
      [
        { measureId: 'fire', title: '消防', supports: ['泄漏'] },
        { measureId: 'closure', title: '封道', supports: ['泄漏', '占道'], produces: '全幅中断' },
        {
          measureId: 'diversion',
          title: '分流',
          supports: ['全幅中断'],
          degradeInsteadOfRevoke: true,
        },
        { measureId: 'live', title: '实况', supports: ['占道'] },
      ],
      ['泄漏'],
    );

    expect(Object.fromEntries(result.map((r) => [r.measureId, r.outcome]))).toEqual({
      fire: '撤销',
      closure: '降级',
      diversion: '降级',
      live: '保留',
    });
  });
});
