import type { SimEvent } from '../domain/event';
import { confirmStatus } from './confirmTiming';
import { queueLength } from './flowModel';
import { SEVERITY_META } from './severity';

export interface TriageInput {
  event: SimEvent;
  /** 该事件最新有效预案中 runState==='待确认' 的措施 shownAtMs 列表（无预案则空数组） */
  pendingShownAtMs: number[];
  simSec: number;
}

export interface TriageRow {
  eventId: string;
  escalated: boolean;
  overdue: boolean;
  pendingCount: number;
  queueKm: number;
  startSimSec: number;
  severityRank: number;
}

/** 将活动事件转换为可排序的分诊行，确保所有面板复用同一紧迫度口径。 */
export function buildTriageRows(inputs: TriageInput[], nowMs: number): TriageRow[] {
  return inputs.map(({ event, pendingShownAtMs, simSec }) => {
    const statuses = pendingShownAtMs.map((shownAtMs) => confirmStatus(shownAtMs, nowMs));
    return {
      eventId: event.id,
      escalated: statuses.includes('escalated'),
      overdue: statuses.some((status) => status === 'overdue' || status === 'escalated'),
      pendingCount: pendingShownAtMs.length,
      queueKm: event.congested ? queueLength(event.w, Math.max(0, (simSec - event.startSimSec) / 60)) : 0,
      startSimSec: event.startSimSec,
      severityRank: event.severity ? SEVERITY_META[event.severity].rank : SEVERITY_META['一般'].rank,
    };
  });
}

/**
 * 分诊排序键必须稳定，避免相同事件在列表中的展示顺序无故跳动。
 * 严重度代表事故后果量级，超时代表 SLA 违约；特别重大事件即便刚接入，也必须压过一般事件的超时计时器。
 */
export function sortTriage(rows: TriageRow[]): TriageRow[] {
  return [...rows].sort((a, b) =>
    a.severityRank - b.severityRank
    || Number(b.escalated) - Number(a.escalated)
    || Number(b.overdue) - Number(a.overdue)
    || b.pendingCount - a.pendingCount
    || b.queueKm - a.queueKm
    || b.startSimSec - a.startSimSec
    || a.eventId.localeCompare(b.eventId),
  );
}
