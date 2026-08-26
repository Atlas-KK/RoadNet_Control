// FR-EM-005 / FR-EM-011：未提交核实表单只保存到sessionStorage。
import type { MonitoringEventType, MonitoringLevel, TravelDirection } from '../../domain/monitoring';
import type { SessionStorageLike } from '../../appShellState';

export const VERIFICATION_DRAFT_PREFIX = 'roadgov-mvp:monitoring-verification-draft:v1:';

export interface VerificationDraftFields {
  eventType: MonitoringEventType;
  confirmedLevel: MonitoringLevel;
  roadCode: string;
  direction: TravelDirection;
  kilometer: string;
  lanesAffected: string;
  lanesTotal: string;
  vehicleCount: string;
  casualties: string;
  flowVehPerHour: string;
  speedKmh: string;
  hazardousMaterials: boolean;
  reason: string;
  notes: string;
}

export interface VerificationDraftSnapshot {
  version: 1;
  eventId: string;
  userId: string;
  savedAt: string;
  fields: VerificationDraftFields;
}

function key(eventId: string, userId: string): string {
  return `${VERIFICATION_DRAFT_PREFIX}${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function readVerificationDraft(storage: SessionStorageLike | undefined, eventId: string, userId: string): VerificationDraftSnapshot | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key(eventId, userId));
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || parsed.eventId !== eventId || parsed.userId !== userId
      || typeof parsed.savedAt !== 'string' || !isRecord(parsed.fields)) return undefined;
    const fields = parsed.fields;
    if (typeof fields.eventType !== 'string' || typeof fields.confirmedLevel !== 'string'
      || typeof fields.roadCode !== 'string' || typeof fields.direction !== 'string'
      || typeof fields.kilometer !== 'string' || typeof fields.lanesAffected !== 'string'
      || typeof fields.vehicleCount !== 'string' || typeof fields.casualties !== 'string'
      || typeof fields.hazardousMaterials !== 'boolean' || typeof fields.reason !== 'string'
      || typeof fields.notes !== 'string') return undefined;
    return {
      version: 1,
      eventId,
      userId,
      savedAt: parsed.savedAt,
      fields: {
        eventType: fields.eventType as MonitoringEventType,
        confirmedLevel: fields.confirmedLevel as MonitoringLevel,
        roadCode: fields.roadCode,
        direction: fields.direction as TravelDirection,
        kilometer: fields.kilometer,
        lanesAffected: fields.lanesAffected,
        lanesTotal: typeof fields.lanesTotal === 'string' ? fields.lanesTotal : '',
        vehicleCount: fields.vehicleCount,
        casualties: fields.casualties,
        flowVehPerHour: typeof fields.flowVehPerHour === 'string' ? fields.flowVehPerHour : '',
        speedKmh: typeof fields.speedKmh === 'string' ? fields.speedKmh : '',
        hazardousMaterials: fields.hazardousMaterials,
        reason: fields.reason,
        notes: fields.notes,
      },
    };
  } catch {
    return undefined;
  }
}

export function persistVerificationDraft(storage: SessionStorageLike | undefined, snapshot: VerificationDraftSnapshot): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key(snapshot.eventId, snapshot.userId), JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearVerificationDraft(storage: SessionStorageLike | undefined, eventId: string, userId: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key(eventId, userId), '');
    return true;
  } catch {
    return false;
  }
}