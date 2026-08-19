import { describe, expect, it } from 'vitest';
import { evaluateConditions, type ConditionContext } from './conditions';
import { tplFullClosure } from '../data/measureTemplates';

// S3 青云隧道 K1177.2 危化品追尾；夜间 23:40；团雾带 K1170–1174。
const S3_CTX: ConditionContext = {
  road: 'G65',
  accidentKp: 1177.2,
  hazmat: true,
  simSecOfDay: 23 * 3600 + 40 * 60,
  env: { fogBands: [{ road: 'G65', fromKp: 1170, toKp: 1174 }], offlineDeviceIds: [] },
};

describe('条件求值器', () => {
  it('S3 四条件同时激活（危化品∧隧道∧团雾∧夜间）', () => {
    const r = evaluateConditions(S3_CTX);
    expect(r.active.map((c) => c.nodeId).sort()).toEqual(['C_危化品', 'C_夜间', 'C_团雾', 'C_隧道'].sort());
  });

  it('团雾派生二次事故边 ×2.2 加权与全幅封道约束', () => {
    const r = evaluateConditions(S3_CTX);
    expect(r.edgeModifiers).toContainEqual({ targetEdge: 'se2', factor: 2.2, reason: '团雾提升二次事故风险' });
    expect(r.constraints).toContainEqual({ measureId: 'M_全封', constraintNodeId: 'C_雾区禁封', reason: '封道执行点须落雾区外' });
  });

  it('无团雾则不加权、不挂雾区约束', () => {
    const r = evaluateConditions({ ...S3_CTX, env: { fogBands: [], offlineDeviceIds: [] } });
    expect(r.edgeModifiers).toEqual([]);
    expect(r.constraints).toEqual([]);
    expect(r.active.map((c) => c.nodeId)).not.toContain('C_团雾');
  });

  it('白天非隧道无危化品 → 条件集为空', () => {
    const r = evaluateConditions({ road: 'G65', accidentKp: 1195, simSecOfDay: 12 * 3600, env: { fogBands: [], offlineDeviceIds: [] } });
    expect(r.active).toEqual([]);
  });

  it('封道执行点锚点：三候选取 min=K1169.5 → 就近落雾区外 VMS-05@K1168', () => {
    const out = tplFullClosure({
      accidentKp: 1177.2,
      lanesTotal: 3,
      lanesClosed: 2,
      tunnel: { fromKp: 1176.0, toKp: 1178.4 },
      fogBand: { fromKp: 1170, toKp: 1174 },
      executablePoints: [
        { id: 'VMS-03', kp: 1172 }, // 雾区内 → 应被裁剪
        { id: 'VMS-05', kp: 1168 }, // 雾区外 → 落点
      ],
    });
    expect(out.params.封道点计算值.value).toBe('K1169.5');
    expect(out.params.封道执行落点.value).toBe('VMS-05@K1168');
  });
});
