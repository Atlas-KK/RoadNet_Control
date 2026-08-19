// ============================================================
// 图就绪数据集构建与 JSONL 导出（开发规格 MVP · FR-I1/I3 / 产品方案 4.1、4.4）
// 从处置世界（事件/预案/推理轨迹/环境）抽取六段结构 event/context/event_logic/
// plan/label/feedback；event_logic 候选链由推理轨迹的事理边预填，供复盘表单勾选确认。
// 纯函数，便于单测。
// ============================================================

import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import type { TraceStep } from './trace';
import type { EnvironmentState } from './conditions';
import type { DatasetEventLogic, DatasetRecord } from '../domain/dataset';

const LOGIC_RELATIONS = new Set(['因果', '顺承', '条件']);

/** 从推理轨迹的事理边预填候选演化链（未确认，待复盘表单勾选）。 */
export function candidateEventLogic(trace: TraceStep[], eventId: string): DatasetEventLogic {
  const seen = new Set<string>();
  const chain: DatasetEventLogic['chain'] = [];
  for (const step of trace) {
    if (step.eventId !== eventId) continue;
    for (const e of step.edges ?? []) {
      if (!e.to || !LOGIC_RELATIONS.has(e.type)) continue;
      const key = `${e.from}->${e.to}:${e.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      chain.push({ from: e.from, to: e.to, relation: e.type as '因果' | '顺承' | '条件', confirmed: false });
    }
  }
  return { chain };
}

function weatherOf(env: EnvironmentState, ev: SimEvent): string[] {
  const w: string[] = [];
  if (env.fogBands.some((b) => b.road === ev.road)) w.push('团雾');
  return w;
}

export interface BuildDatasetParams {
  events: SimEvent[];
  plans: Plan[];
  trace: TraceStep[];
  environment: EnvironmentState;
  /** 复盘表单已确认的演化链（覆盖候选）。 */
  eventLogicConfirmations?: Record<string, DatasetEventLogic>;
}

/** 为每起非背景事件构建一条六段数据集记录。 */
export function buildDataset(params: BuildDatasetParams): DatasetRecord[] {
  const { events, plans, trace, environment } = params;
  const activeIds = events.map((e) => e.id);
  return events.map((ev) => {
    const evPlans = plans.filter((p) => p.id === `PLAN-${ev.id}`).sort((a, b) => a.version - b.version);
    const latest = evPlans.at(-1);
    const confirmTimeSecList = evPlans
      .flatMap((p) => p.measures)
      .map((m) => m.confirmMs)
      .filter((ms): ms is number => ms != null)
      .map((ms) => Math.round(ms / 1000));

    const outcome: DatasetRecord['label']['outcome'] = ev.falsePositive
      ? '误报'
      : latest?.state === '已作废'
        ? '作废'
        : ev.caseLinkGroup
          ? '归并拆分'
          : '正常处置';

    return {
      event: {
        id: ev.id,
        type: ev.typeNodeId,
        road: ev.road,
        kp: ev.accidentKp,
        lanes: { total: ev.lanesTotal, closed: ev.lanesClosed },
        casualties: ev.casualties,
        hazmat: ev.hazmat,
        sourceKind: ev.sourceKind,
        tsDetect: ev.startSimSec,
      },
      context: {
        snapshotTs: ev.startSimSec,
        weather: weatherOf(environment, ev),
        devicesOffline: environment.offlineDeviceIds,
        flowQ: ev.q,
        concurrentEventIds: activeIds.filter((id) => id !== ev.id),
      },
      event_logic: params.eventLogicConfirmations?.[ev.id] ?? candidateEventLogic(trace, ev.id),
      plan: {
        versions: evPlans.map((p) => ({
          version: p.version,
          label: p.label,
          measures: p.measures.map((m) => ({ measureId: m.measureId, tier: m.tier, runState: m.runState, diff: m.diff })),
        })),
      },
      label: { outcome, confirmTimeSecList },
      feedback: {
        rejects: evPlans
          .flatMap((p) => p.measures)
          .filter((m) => m.rejectReason)
          .map((m) => ({ measureId: m.measureId, reason: m.rejectReason! })),
        revokeNotes: evPlans.filter((p) => p.voidReason).map((p) => p.voidReason!),
      },
    };
  });
}

/** 序列化为 JSONL（一行一记录）。 */
export function toJsonl(records: DatasetRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n');
}
