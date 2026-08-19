import type { RoadId } from '../data/network';
import type { RuntimeEventInput } from '../engine/ingest';
import { SIMULATED_ROADS } from '../gis/xiAnRing';

export interface RuntimeEventDraft {
  sourceKind: string;
  road: RoadId;
  kp: string;
  typeNodeId: string;
  typeLabel: string;
  lanesTotal: number;
  lanesClosed: number;
  q: string;
  casualties: string;
  hazmat: boolean;
  direction: RuntimeEventInput['direction'];
}

export type RuntimeEventValidation =
  | { ok: true; input: RuntimeEventInput }
  | { ok: false; error: string };

export function normalizeRuntimeEventInput(draft: RuntimeEventDraft): RuntimeEventValidation {
  const geo = SIMULATED_ROADS[draft.road];
  const kpNum = Number(draft.kp);
  if (!Number.isFinite(kpNum) || kpNum < geo.fromKp || kpNum > geo.toKp) {
    return { ok: false, error: `桩号需在 ${draft.road} 运行区间 K${geo.fromKp}-K${geo.toKp} 内` };
  }

  if (!Number.isInteger(draft.lanesTotal) || draft.lanesTotal <= 0) {
    return { ok: false, error: '总车道数必须为正整数' };
  }
  if (!Number.isInteger(draft.lanesClosed) || draft.lanesClosed < 0 || draft.lanesClosed > draft.lanesTotal) {
    return { ok: false, error: '占用车道数必须为非负整数，且不能大于总车道数' };
  }

  const qNum = Number(draft.q);
  if (!Number.isFinite(qNum) || qNum < 0) {
    return { ok: false, error: '断面流量必须为有限非负数' };
  }

  let casualties: number | undefined;
  if (draft.casualties.trim() !== '') {
    casualties = Number(draft.casualties);
    if (!Number.isInteger(casualties) || casualties < 0) {
      return { ok: false, error: '伤亡人数必须为空或非负整数' };
    }
  }

  const hazmatType = draft.typeNodeId === 'E_危化泄漏';
  return {
    ok: true,
    input: {
      sourceKind: draft.sourceKind,
      road: draft.road,
      accidentKp: kpNum,
      typeNodeId: draft.typeNodeId,
      label: `${draft.road} K${kpNum} ${draft.typeLabel || '事件'}`,
      lanesTotal: draft.lanesTotal,
      lanesClosed: draft.lanesClosed,
      q: qNum,
      casualties,
      hazmat: draft.hazmat || hazmatType ? true : undefined,
      direction: draft.direction,
    },
  };
}
