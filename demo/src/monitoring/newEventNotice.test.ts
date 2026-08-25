import { describe, expect, it } from 'vitest';
import { reconcileNewEventNotice } from './newEventNotice';

describe('FR-EM-004 实时新增事件提示', () => {
  it('用户位于列表顶部时直接插入且不显示新增提示', () => {
    expect(reconcileNewEventNotice({ knownIds: ['ME-1'], deferredIds: [] }, ['ME-2', 'ME-1'], 0)).toEqual({
      knownIds: ['ME-2', 'ME-1'], deferredIds: [],
    });
  });

  it('用户向下浏览时暂缓新事件并累计提示，不改变已有选择或滚动数据', () => {
    const result = reconcileNewEventNotice({ knownIds: ['ME-1'], deferredIds: [] }, ['ME-2', 'ME-1'], 320);
    expect(result.deferredIds).toEqual(['ME-2']);
    const accumulated = reconcileNewEventNotice(result, ['ME-3', 'ME-2', 'ME-1'], 320);
    expect(accumulated.deferredIds).toEqual(['ME-2', 'ME-3']);
  });

  it('筛选变化未改变全量事件ID时不误报为新事件', () => {
    expect(reconcileNewEventNotice({ knownIds: ['ME-1', 'ME-2'], deferredIds: [] }, ['ME-1', 'ME-2'], 200).deferredIds).toEqual([]);
  });
});
