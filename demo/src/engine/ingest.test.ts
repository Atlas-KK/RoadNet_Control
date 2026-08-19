import { describe, expect, it } from 'vitest';
import { ingestReport, type IngestContext, type RuntimeEventInput } from './ingest';
import { computeFlow } from './flowModel';
import type { SimEvent } from '../domain/event';

const BASE_CTX: IngestContext = {
  events: [],
  resourceOccupancy: {},
  environment: { fogBands: [], offlineDeviceIds: [] },
  simSec: 0,
  sceneBaseSec: 12 * 3600,
  newEventId: 'EV-R001',
};

const REAR_END: RuntimeEventInput = {
  sourceKind: 'CAM 视频检出',
  road: 'G65',
  accidentKp: 1190,
  typeNodeId: 'E_追尾',
  label: 'G65 K1190 追尾事故',
  lanesTotal: 3,
  lanesClosed: 2,
  q: 4300,
  direction: 'up',
};

describe('运行模式事件接入管道', () => {
  it('手工录入 → 新建事件 + 五步推理 + 控制类措施', () => {
    const r = ingestReport(REAR_END, BASE_CTX);
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    // 五步推理轨迹 T-*-01..05
    const phases = r.trace.filter((t) => /-0[1-5]$/.test(t.id));
    expect(phases.length).toBeGreaterThanOrEqual(5);
    // 含控制类待办措施（封车道等）
    expect(r.plan.measures.some((m) => m.tier === '控制类')).toBe(true);
    expect(r.event.congested).toBe(true);
  });

  it('相邻同型报告 → 高置信自动归并', () => {
    const existing: SimEvent = {
      id: 'EV-R001',
      road: 'G65',
      accidentKp: 1190,
      lanesTotal: 3,
      lanesClosed: 2,
      q: 4300,
      typeNodeId: 'E_追尾',
      label: '既有',
      startSimSec: 0,
      congested: true,
      w: computeFlow({ eventId: 'EV-R001', accidentKp: 1190, lanesTotal: 3, lanesClosed: 2, q: 4300 }).w,
    };
    const phone: RuntimeEventInput = { ...REAR_END, sourceKind: '12122 电话报警', typeNodeId: 'E_事故', direction: 'unknown' };
    const r = ingestReport(phone, { ...BASE_CTX, events: [existing], simSec: 60, newEventId: 'EV-R002' });
    expect(r.kind).toBe('merged');
    if (r.kind === 'merged') expect(r.targetId).toBe('EV-R001');
  });

  it('分流冲突：承接线上有活跃拥堵事件 → 预置分流自动裁剪为提前分流', () => {
    const flowB = computeFlow({ eventId: 'EV-B', accidentKp: 30, lanesTotal: 2, lanesClosed: 1, q: 3388, vf: 100 });
    const evB: SimEvent = {
      id: 'EV-B', road: 'G56', accidentKp: 30, lanesTotal: 2, lanesClosed: 1, q: 3388, vf: 100,
      typeNodeId: 'E_侧翻', label: 'G56 侧翻', startSimSec: 0, congested: flowB.congested, w: flowB.w,
    };
    const r = ingestReport(REAR_END, { ...BASE_CTX, events: [evB], newEventId: 'EV-R003' });
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    expect(r.conflict?.status).toBe('conflict');
    expect(r.plan.measures.some((m) => m.measureId === 'M_提前分流')).toBe(true);
    expect(r.plan.measures.some((m) => m.measureId === 'M_预置分流')).toBe(false);
  });

  it('危化品隧道夜间录入 → 条件集含团雾外三条件', () => {
    const hazmat: RuntimeEventInput = {
      ...REAR_END, accidentKp: 1177.2, typeNodeId: 'E_危化泄漏', hazmat: true, label: '隧道危化品',
    };
    const r = ingestReport(hazmat, { ...BASE_CTX, sceneBaseSec: 23 * 3600 + 40 * 60 });
    if (r.kind !== 'created') return;
    expect(r.conditions).toContain('C_危化品');
    expect(r.conditions).toContain('C_隧道');
    expect(r.conditions).toContain('C_夜间');
  });

  it('危化品隧道事件生成含调派消防/全幅封道/隧道通风的预案（T6：运行模式补齐案例三/四的措施对象）', () => {
    const hazmat: RuntimeEventInput = {
      ...REAR_END, accidentKp: 1177.2, typeNodeId: 'E_危化泄漏', hazmat: true, label: '隧道危化品',
    };
    const r = ingestReport(hazmat, BASE_CTX);
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    const ids = r.plan.measures.map((m) => m.measureId);
    expect(ids).toContain('M_调消防');
    expect(ids).toContain('M_全封');
    expect(ids).toContain('M_通风'); // 事故点落在青云隧道 K1176.0–1178.4 内
  });

  it('伤亡事件生成含调派120的预案', () => {
    const injured: RuntimeEventInput = { ...REAR_END, casualties: 2 };
    const r = ingestReport(injured, BASE_CTX);
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    expect(r.plan.measures.some((m) => m.measureId === 'M_调120')).toBe(true);
  });

  it('自引用检测（附录A·案例五）：排队将掐断预置分流自身承接线 → 改提前分流', () => {
    // K1165.8 / q=5200，与 S5 演示锚点一致：w≈9.8km/h，上游 5.8km 的 K1160 枢纽
    // 下游交叉线正是预置分流默认承接道路 G56，构成自引用。
    const jam: RuntimeEventInput = { ...REAR_END, accidentKp: 1165.8, q: 5200 };
    const r = ingestReport(jam, BASE_CTX);
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    expect(r.selfReference?.selfReference).toBeDefined();
    const ids = r.plan.measures.map((m) => m.measureId);
    expect(ids).toContain('M_提前分流');
    expect(ids).not.toContain('M_预置分流');
    expect(r.trace.some((t) => t.title.includes('自引用'))).toBe(true);
  });

  it('非隧道段危化品事件不生成通风措施', () => {
    const hazmatOpenRoad: RuntimeEventInput = { ...REAR_END, hazmat: true }; // K1190 不在任何隧道内
    const r = ingestReport(hazmatOpenRoad, BASE_CTX);
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    const ids = r.plan.measures.map((m) => m.measureId);
    expect(ids).toContain('M_调消防');
    expect(ids).not.toContain('M_通风');
  });
});
