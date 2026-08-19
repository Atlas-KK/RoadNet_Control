import { beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { DEMO_CASES, demoCaseById } from './data/demoCases';

function input(kp: number) {
  return {
    sourceKind: '人工巡查',
    road: 'G65' as const,
    accidentKp: kp,
    typeNodeId: 'E_追尾',
    label: `K${kp}追尾`,
    lanesTotal: 3,
    lanesClosed: 2,
    q: 4300,
    direction: 'up' as const,
  };
}

describe('运行模式状态树', () => {
  beforeEach(() => {
    useStore.getState().clearRuntime();
  });

  it('启动后固定为运行模式', () => {
    expect(useStore.getState().mode).toBe('runtime');
  });

  it('首个接入事件自动获得聚焦', () => {
    useStore.getState().ingestEvent(input(1150));
    expect(useStore.getState().focusedEventId).toBe('EV-R001');
  });

  it('后续接入事件不抢占当前聚焦', () => {
    useStore.getState().ingestEvent(input(1150));
    useStore.getState().ingestEvent(input(1210));
    expect(useStore.getState().focusedEventId).toBe('EV-R001');
  });

  it('确认措施时写入有限确认耗时', () => {
    useStore.getState().ingestEvent(input(1150));
    const plan = useStore.getState().plans[0];
    const measure = plan.measures.find((m) => m.runState === '待确认');
    expect(measure).toBeDefined();
    useStore.getState().confirmPlanCandidate(plan.id, plan.version);
    useStore.getState().confirmMeasure(plan.id, plan.version, measure!.id);
    const confirmed = useStore.getState().plans[0].measures.find((m) => m.id === measure!.id);
    expect(Number.isFinite(confirmed?.confirmMs)).toBe(true);
  });

  it('确认策略前不得下发控制措施，确认后可选择备选策略进入队列', () => {
    useStore.getState().ingestEvent(input(1150));
    const plan = useStore.getState().plans[0];
    expect(plan.candidates?.map((candidate) => candidate.id)).toEqual(['A', 'B', 'C']);
    const control = plan.measures.find((measure) => measure.tier === '控制类')!;
    useStore.getState().confirmMeasure(plan.id, plan.version, control.id);
    expect(useStore.getState().plans[0].measures.find((measure) => measure.id === control.id)?.runState).toBe('待确认');

    useStore.getState().selectPlanCandidate(plan.id, plan.version, 'B');
    useStore.getState().confirmPlanCandidate(plan.id, plan.version);
    const selected = useStore.getState().plans[0];
    expect(selected.selectedCandidateId).toBe('B');
    expect(selected.decisionConfirmedAt).toEqual(expect.any(Number));
    expect(selected.measures.some((measure) => measure.measureId === 'M_预置分流')).toBe(false);
    expect(selected.measures.filter((measure) => measure.runState === '待确认' && measure.tier !== '实况类').every((measure) => measure.shownAtMs >= selected.decisionConfirmedAt!)).toBe(true);
  });

  it('证伪聚焦事件后自动切换到剩余活动事件，无剩余则清空', () => {
    useStore.getState().ingestEvent(input(1150));
    useStore.getState().ingestEvent(input(1210));
    useStore.getState().falsifyEvent('EV-R001', '误报');
    expect(useStore.getState().focusedEventId).toBe('EV-R002');
    useStore.getState().falsifyEvent('EV-R002', '误报');
    expect(useStore.getState().focusedEventId).toBeNull();
  });
});

describe('运行模式属性修正', () => {
  beforeEach(() => {
    useStore.getState().clearRuntime();
  });

  function ingestHazmatTunnelEvent() {
    useStore.getState().ingestEvent({
      sourceKind: 'CAM 视频检出',
      road: 'G65',
      accidentKp: 1177.2,
      typeNodeId: 'E_危化泄漏',
      label: '隧道危化品',
      lanesTotal: 3,
      lanesClosed: 2,
      q: 3000,
      hazmat: true,
      direction: 'up',
    });
  }

  it('撤回泄漏事实后生成新版预案并替换旧版', () => {
    ingestHazmatTunnelEvent();
    const eventId = useStore.getState().focusedEventId!;
    useStore.getState().reviseEventFacts(eventId, ['F_泄漏'], '现场核实无泄漏');

    const plans = useStore.getState().plans.filter((p) => p.id === `PLAN-${eventId}`);
    expect(plans.some((p) => p.version === 2)).toBe(true);
    expect(plans.find((p) => p.version === 1)?.state).toBe('已被替换');
  });

  it('撤回泄漏事实后事件不再保持特别重大等级', () => {
    ingestHazmatTunnelEvent();
    const eventId = useStore.getState().focusedEventId!;
    expect(useStore.getState().events.find((e) => e.id === eventId)?.severity).toBe('特别重大');

    useStore.getState().reviseEventFacts(eventId, ['F_泄漏'], '现场核实无泄漏');

    const event = useStore.getState().events.find((e) => e.id === eventId);
    expect(event?.hazmat).toBe(false);
    expect(event?.severity).not.toBe('特别重大');
  });
});

describe('人工续报与管控预案解耦', () => {
  beforeEach(() => {
    useStore.getState().clearRuntime();
  });

  it('仅补充事件描述的续报不生成新的管控预案', () => {
    useStore.getState().ingestEvent(input(1150));
    const eventId = useStore.getState().focusedEventId!;
    useStore.getState().submitProgressReport(eventId, {
      reporter: '本机值班席', source: '现场核实', kind: '续报', description: '清障车辆正在赶赴现场。', changes: {},
    });
    const event = useStore.getState().events.find((item) => item.id === eventId)!;
    expect(event.progressReports).toHaveLength(1);
    expect(event.progressReports?.[0].triggeredPlanVersion).toBeUndefined();
    expect(useStore.getState().plans.filter((item) => item.id === `PLAN-${eventId}`)).toHaveLength(1);
  });

  it('影响研判的续报生成新版本管控预案，并关联续报记录', () => {
    useStore.getState().ingestEvent(input(1150));
    const eventId = useStore.getState().focusedEventId!;
    useStore.getState().submitProgressReport(eventId, {
      reporter: '本机值班席', source: '现场核实', kind: '续报', description: '确认有 1 人轻伤，需调派救护车。', changes: { casualties: 1 },
    });
    const state = useStore.getState();
    const plans = state.plans.filter((item) => item.id === `PLAN-${eventId}`);
    expect(plans).toHaveLength(2);
    expect(plans[0].state).toBe('已被替换');
    expect(plans[1].label).toContain('V2 管控预案');
    expect(plans[1].measures.some((item) => item.measureId === 'M_调120')).toBe(true);
    expect(state.events.find((item) => item.id === eventId)?.progressReports?.[0].triggeredPlanVersion).toBe(2);
  });
});

describe('五个演示案例装载', () => {
  beforeEach(() => {
    useStore.getState().clearRuntime();
  });

  it('案例一走标准接入管道并自动裁剪 G56 冲突分流', () => {
    useStore.getState().loadDemoCase(demoCaseById('cross-event-diversion'));
    const state = useStore.getState();
    expect(state.events).toHaveLength(2);
    expect(state.plans.find((plan) => plan.id === 'PLAN-EV-R002')?.measures.some((m) => m.measureId === 'M_提前分流')).toBe(true);
    expect(state.trace.some((step) => step.specRef.includes('案例一'))).toBe(true);
  });

  it('处置 EV-R001 时不得自动下发 EV-R002 的脚本指令', () => {
    useStore.getState().loadDemoCase(demoCaseById('cross-event-diversion'));
    const initial = useStore.getState();
    const planR001 = initial.plans.find((plan) => plan.id === 'PLAN-EV-R001')!;
    const r001LaneClosure = planR001.measures.find((measure) => measure.measureId === 'M_封车道')!;

    useStore.getState().confirmPlanCandidate(planR001.id, planR001.version);
    useStore.getState().confirmMeasure(planR001.id, planR001.version, r001LaneClosure.id);
    useStore.getState().tick(83 * 60 - initial.simSec);

    let state = useStore.getState();
    expect(state.plans.find((plan) => plan.id === 'PLAN-EV-R001')?.measures.find((measure) => measure.id === r001LaneClosure.id)?.runState).toBe('已下发');
    expect(state.plans.find((plan) => plan.id === 'PLAN-EV-R002')?.measures.find((measure) => measure.measureId === 'M_封车道')?.runState).toBe('待确认');

    useStore.getState().focusEvent('EV-R002');
    useStore.getState().tick(1);
    state = useStore.getState();
    expect(state.plans.find((plan) => plan.id === 'PLAN-EV-R002')?.measures.find((measure) => measure.measureId === 'M_封车道')?.runState).toBe('已下发');
  });

  it('案例二保留资源占用快照并生成 41min 清障 ETA', () => {
    useStore.getState().loadDemoCase(demoCaseById('resource-squeeze'));
    const state = useStore.getState();
    expect(state.resourceOccupancy).toMatchObject({ 'W-01': 'EV-R001', 'W-02': 'EV-R001' });
    const dispatch = state.plans.find((plan) => plan.id === 'PLAN-EV-R002')?.measures.find((m) => m.measureId === 'M_调清障');
    expect(dispatch?.resource).toMatchObject({ id: 'W-01', etaMin: 41 });
  });

  it('案例三生成四条件、雾区外封道点和正向通风', () => {
    useStore.getState().loadDemoCase(demoCaseById('condition-jump'));
    const state = useStore.getState();
    expect(state.activeConditions).toEqual(expect.arrayContaining(['C_危化品', 'C_隧道', 'C_团雾', 'C_夜间']));
    const plan = state.plans[0];
    expect(plan.measures.find((m) => m.measureId === 'M_全封')?.params['封道执行落点']?.value).toBe('VMS-05@K1168');
    expect(plan.measures.find((m) => m.measureId === 'M_通风')?.params['排风方向']?.value).toBe('正向排风至出口侧');
    expect(state.activeDemoTwin?.script.id).toBe('qinyun-hazmat-night');
    expect(state.simSec).toBe(40 * 60 + 18);

    useStore.getState().tick(43 * 60 - state.simSec);
    const issuedPlan = useStore.getState().plans[0];
    expect(issuedPlan.measures.filter((measure) => measure.runState === '已下发').length).toBeGreaterThan(5);
  });

  it('案例四装载后保留 V1 并生成属性修正 V2', () => {
    useStore.getState().loadDemoCase(demoCaseById('fact-retraction'));
    let state = useStore.getState();
    expect(state.plans.filter((plan) => plan.id === 'PLAN-EV-R001')).toHaveLength(1);
    expect(state.simSec).toBe(5 * 60);
    useStore.getState().tick(20 * 60);
    state = useStore.getState();
    expect(state.plans.filter((plan) => plan.id === 'PLAN-EV-R001')).toHaveLength(2);
    expect(state.plans.find((plan) => plan.version === 1)?.state).toBe('已被替换');
    expect(state.plans.find((plan) => plan.version === 2)?.measures.find((m) => m.measureId === 'M_调消防')?.diff).toBe('撤销');
    expect(state.plans.find((plan) => plan.version === 2)?.measures.find((m) => m.measureId === 'M_全封')?.diff).toBe('降级');
  });

  it('案例五命中自引用并改为提前分流', () => {
    useStore.getState().loadDemoCase(demoCaseById('self-reference'));
    const state = useStore.getState();
    expect(state.plans[0].measures.some((m) => m.measureId === 'M_提前分流')).toBe(true);
    expect(state.trace.some((step) => step.title.includes('自引用'))).toBe(true);
    expect(state.simSec).toBe(30);
  });

  it('案例脚本终态会完成处置并将事件从活动态势中终报', () => {
    useStore.getState().loadDemoCase(demoCaseById('self-reference'));
    useStore.getState().tick(55 * 60 - 30);
    const state = useStore.getState();
    expect(state.events[0]).toMatchObject({ finalized: true, stage: '处置完成' });
    expect(state.events[0]?.finalReport).toMatchObject({ queueCleared: true, capacityAfterVehPerHour: 5130 });
    expect(state.events[0]?.finalReport?.evolution.at(-1)).toMatchObject({
      queuedVehicleCount: 0,
      closureActive: false,
    });
    expect(state.events[0]?.finalReport?.planVersions[0]?.measures).toHaveLength(state.plans[0]?.measures.length ?? 0);
    expect(state.events[0]?.finalReport?.reasoning.length).toBeGreaterThan(0);
    expect(state.plans[0]?.state).toBe('已完成');
    expect(state.plans[0]?.measures.every((measure) => measure.runState === '已完成')).toBe(true);
  });

  it('五个案例都能从处置阶段推进到恢复和终报', () => {
    for (const demoCase of DEMO_CASES) {
      useStore.getState().loadDemoCase(demoCase);
      const script = demoCase.twinScript!;
      const terminalSec = Math.max(
        ...script.phases.map((phase) => phase.atSimSec),
        ...(script.eventScripts?.flatMap((timeline) => timeline.phases.map((phase) => phase.atSimSec)) ?? []),
      );
      useStore.getState().tick(Math.max(0, terminalSec - useStore.getState().simSec));
      // 多事件案例需逐一进入处置视角，脚本才可推进各自的指令和终态。
      for (const event of useStore.getState().events.filter((item) => !item.finalized)) {
        useStore.getState().focusEvent(event.id);
        useStore.getState().tick(0);
      }
      const state = useStore.getState();
      expect(state.events.every((event) => event.finalized)).toBe(true);
      state.events.forEach((event) => {
        const report = event.finalReport;
        expect(event.finalReport).toMatchObject({
          generatedSimSec: terminalSec,
          queueCleared: true,
        });
        expect(report?.capacityAfterVehPerHour).toBeGreaterThan(report?.capacityBeforeVehPerHour ?? Number.POSITIVE_INFINITY);
        expect(report?.drivingDensityAfterVehPerKm).toBeLessThan(report?.drivingDensityBeforeVehPerKm ?? Number.NEGATIVE_INFINITY);
        expect(report?.evolution.length).toBeGreaterThan(0);
        expect(report?.evolution.at(-1)).toMatchObject({ queuedVehicleCount: 0, closureActive: false });
        expect(report?.planVersions.length).toBeGreaterThan(0);
        expect(report?.reasoning.length).toBeGreaterThan(0);
      });
      expect(state.plans.filter((plan) => !['已被替换', '已作废'].includes(plan.state)).every((plan) => plan.state === '已完成')).toBe(true);
    }
  });

  it('案例四终报保留事实修正和 V1/V2 预案的完整处置记录', () => {
    useStore.getState().loadDemoCase(demoCaseById('fact-retraction'));
    useStore.getState().tick(45 * 60 - useStore.getState().simSec);

    const report = useStore.getState().events[0]?.finalReport;
    expect(report?.revisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ simSec: 25 * 60, retractedFacts: ['F_泄漏'] }),
    ]));
    expect(report?.planVersions.map((plan) => plan.version)).toEqual([1, 2]);
    expect(report?.planVersions.find((plan) => plan.version === 1)?.state).toBe('已被替换');
    expect(report?.planVersions.find((plan) => plan.version === 2)?.state).toBe('已完成');
    expect(report?.planVersions.find((plan) => plan.version === 2)?.measures.some((measure) => measure.measureId === 'M_调消防')).toBe(true);
  });
});
