import { describe, expect, it } from 'vitest';
import { tracePathForStep } from './trace';

describe('tracePathForStep', () => {
  it('优先使用推理引擎提供的有序节点路径', () => {
    const path = tracePathForStep({
      id: 'T-1-03',
      eventId: 'EV-1',
      phase: '检索',
      title: '检索',
      dataSources: ['图库'],
      path: [{ id: 'E_追尾' }, { id: 'E_占道' }, { id: 'E_拥堵' }],
      edges: [{ from: 'E_追尾', to: 'E_占道', type: '因果' }],
      conclusion: '已检索',
      specRef: 'test',
    });

    expect(path.map((node) => node.id)).toEqual(['E_追尾', 'E_占道', 'E_拥堵']);
  });

  it('兼容没有 path 字段的历史推理快照', () => {
    const path = tracePathForStep({
      id: 'T-1-04',
      eventId: 'EV-1',
      phase: '推演',
      title: '推演',
      dataSources: ['流模型'],
      edges: [
        { from: 'E_占道', to: 'E_拥堵', type: '顺承' },
        { from: 'E_拥堵', to: 'E_二次', type: '顺承' },
      ],
      conclusion: '已推演',
      specRef: 'test',
    });

    expect(path.map((node) => node.id)).toEqual(['E_占道', 'E_拥堵', 'E_二次']);
  });
});
