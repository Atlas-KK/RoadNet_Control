import { describe, expect, it } from 'vitest';
import { buildDataset, candidateEventLogic, toJsonl } from './datasetBuilder';
import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import type { TraceStep } from './trace';

const EV: SimEvent = {
  id: 'EV-R001', road: 'G65', accidentKp: 1190, lanesTotal: 3, lanesClosed: 2, q: 4300,
  typeNodeId: 'E_追尾', label: '追尾', startSimSec: 0, congested: true, w: 12, sourceKind: 'CAM 视频检出',
};

const PLAN: Plan = {
  id: 'PLAN-EV-R001', version: 1, label: 'V1 初报', state: '已下发', responsible: '', confidence: '',
  measures: [
    { id: 'm1', measureId: 'M_封车道', title: '封闭车道', tier: '控制类', summary: '', params: {}, supports: [], runState: '已下发', shownAtMs: 0, confirmMs: 42000 },
    { id: 'm2', measureId: 'M_预置分流', title: '预置分流', tier: '控制类', summary: '', params: {}, supports: [], runState: '待确认', shownAtMs: 0, rejectReason: '承接路径冲突' },
  ],
};

const TRACE: TraceStep[] = [
  { id: 'T-EV-R001-03', eventId: 'EV-R001', phase: '检索', title: '', dataSources: ['图库'], conclusion: '', specRef: '',
    edges: [{ from: 'E_占道', to: 'E_拥堵', type: '顺承', weight: 0.82 }, { from: 'INST', to: 'E_追尾', type: '实例' }] },
];

describe('图就绪数据集构建', () => {
  it('候选演化链仅取事理边（因果/顺承/条件），去重', () => {
    const logic = candidateEventLogic(TRACE, 'EV-R001');
    expect(logic.chain).toHaveLength(1);
    expect(logic.chain[0]).toMatchObject({ from: 'E_占道', to: 'E_拥堵', relation: '顺承', confirmed: false });
  });

  it('构建六段结构并归类 outcome / 确认耗时 / 打回反馈', () => {
    const [rec] = buildDataset({ events: [EV], plans: [PLAN], trace: TRACE, environment: { fogBands: [], offlineDeviceIds: [] } });
    expect(rec.event.id).toBe('EV-R001');
    expect(rec.plan.versions).toHaveLength(1);
    expect(rec.label.outcome).toBe('正常处置');
    expect(rec.label.confirmTimeSecList).toEqual([42]);
    expect(rec.feedback.rejects).toEqual([{ measureId: 'M_预置分流', reason: '承接路径冲突' }]);
  });

  it('误报事件 outcome=误报', () => {
    const [rec] = buildDataset({ events: [{ ...EV, falsePositive: true }], plans: [], trace: [], environment: { fogBands: [], offlineDeviceIds: [] } });
    expect(rec.label.outcome).toBe('误报');
  });

  it('JSONL 一行一记录', () => {
    const jsonl = toJsonl(buildDataset({ events: [EV], plans: [PLAN], trace: TRACE, environment: { fogBands: [], offlineDeviceIds: [] } }));
    expect(jsonl.split('\n')).toHaveLength(1);
    expect(() => JSON.parse(jsonl)).not.toThrow();
  });
});
