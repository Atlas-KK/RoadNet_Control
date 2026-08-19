import { describe, expect, it } from 'vitest';
import type { PlanMeasure } from '../domain/plan';
import { buildMeasureDispatch, resolveDeviceCommandEffects } from './commandDispatch';

const measure = (): PlanMeasure => ({
  id: 'EV-1-V1-M1',
  measureId: 'M_全封',
  title: '全幅封道',
  tier: '控制类',
  summary: '封道并发布诱导信息',
  params: {},
  supports: [],
  runState: '待确认',
  shownAtMs: 0,
});

describe('command dispatch', () => {
  it('为确认的全幅封道生成系统、人员和设备的成功回执', () => {
    const dispatch = buildMeasureDispatch(measure(), undefined, { fogBands: [], offlineDeviceIds: [] }, 120);
    expect(dispatch.status).toBe('success');
    expect(dispatch.targets.map((target) => target.type)).toEqual(expect.arrayContaining(['system', 'personnel', 'device']));
    expect(dispatch.deviceEffects.find((effect) => effect.deviceId === 'VMS-04')).toMatchObject({ displayContent: '禁止通行', contentTone: 'danger' });
  });

  it('离线设备回执失败且不会进入设备同步效果', () => {
    const dispatch = buildMeasureDispatch(measure(), undefined, { fogBands: [], offlineDeviceIds: ['VMS-04'] }, 120);
    expect(dispatch.status).toBe('partial_success');
    expect(dispatch.targets.find((target) => target.id === 'VMS-04')).toMatchObject({ status: 'failed' });
    expect(dispatch.deviceEffects.some((effect) => effect.deviceId === 'VMS-04')).toBe(false);
  });

  it('只聚合当前事件的成功下发设备指令', () => {
    const dispatch = buildMeasureDispatch(measure(), undefined, { fogBands: [], offlineDeviceIds: [] }, 120);
    const effects = resolveDeviceCommandEffects([{
      id: 'PLAN-EV-1', version: 1, label: 'V1', state: '已下发', responsible: '值守员', confidence: '高', measures: [{ ...measure(), dispatch }],
    }], 'EV-1');
    expect(effects.get('VMS-04')?.measureTitle).toBe('全幅封道');
    expect(resolveDeviceCommandEffects([], 'EV-1').size).toBe(0);
  });
});
