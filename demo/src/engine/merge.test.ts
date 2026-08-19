import { describe, expect, it } from 'vitest';
import { groupDivergence, keyFieldConflicts, scoreMerge, type EventReport } from './merge';

const CAM: EventReport = {
  sourceLabel: 'CAM 视频检出',
  road: 'G65',
  kp: 1195,
  typeNodeId: 'E_追尾',
  direction: 'up',
  reportedAtSimSec: 0,
  casualties: 0,
};

const PHONE: EventReport = {
  sourceLabel: '12122 电话报警',
  road: 'G65',
  kp: 1195,
  typeNodeId: 'E_事故', // 电话报警泛化类型
  direction: 'unknown',
  reportedAtSimSec: 40,
};

describe('事件归并引擎', () => {
  it('S0 双源同点同时 → 高置信自动归并（得分明细齐全）', () => {
    const d = scoreMerge(CAM, PHONE);
    expect(d.tier).toBe('auto');
    expect(d.total).toBeGreaterThanOrEqual(0.75);
    expect(d.scoreRows).toHaveLength(4);
    // 空间满分、时间满分、类型相容 0.7、方向存疑 0.8
    expect(d.scoreRows[0].score).toBe(1);
    expect(d.scoreRows[2].score).toBe(0.7);
    expect(d.conflictFields).toEqual([]);
  });

  it('中距离中时差 → 中置信并案标记', () => {
    const near: EventReport = { ...PHONE, kp: 1197.5, reportedAtSimSec: 10 * 60, typeNodeId: 'E_追尾', direction: 'up' };
    const d = scoreMerge(CAM, near);
    // 空间 0.6×0.35 + 时间 0.5×0.25 + 类型 1×0.25 + 方向 1×0.15 = 0.735
    expect(d.tier).toBe('caseLink');
    expect(d.total).toBeCloseTo(0.735, 2);
    // 初次评分不因空间分离硬拆分（位置分离由空间得分带表达）。
    expect(d.conflictFields).toEqual([]);
  });

  it('异路远时差 → 低置信不归并', () => {
    const far: EventReport = { ...PHONE, road: 'G56', kp: 30, reportedAtSimSec: 30 * 60 };
    const d = scoreMerge(CAM, far);
    expect(d.tier).toBe('separate');
    expect(d.total).toBeLessThan(0.45);
  });

  it('关键字段冲突（伤亡数不一致）→ 强制拆分，覆盖高分', () => {
    const a: EventReport = { ...CAM, casualties: 0 };
    const b: EventReport = { ...CAM, sourceLabel: '雷视', casualties: 2, typeNodeId: 'E_追尾' };
    const d = scoreMerge(a, b);
    expect(d.tier).toBe('separate');
    expect(d.decision).toContain('强制拆分');
    expect(d.conflictFields.some((c) => c.includes('伤亡'))).toBe(true);
  });

  it('并案组位置漂移>1km 记为需拆分（groupDivergence）', () => {
    const a: EventReport = { ...CAM };
    const b: EventReport = { ...CAM, kp: 1197 };
    expect(keyFieldConflicts(a, b)).toEqual([]); // 初次评分不含位置漂移
    expect(groupDivergence(a, b)).toContain('位置漂移>1km');
  });

  it('缺省字段不构成冲突', () => {
    expect(keyFieldConflicts(CAM, PHONE)).toEqual([]);
  });
});
