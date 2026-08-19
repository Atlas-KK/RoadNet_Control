// ============================================================
// 运行模式持久化与审计留痕（开发规格 MVP · FR-H1/H2 / 产品方案 四）
//
// SPEC-DEVIATION: SRS D1 建议 IndexedDB；此处改用 localStorage 同步实现。理由：
// 单机运行规模（数十起事件 + 数百条审计，远小于 5MB），同步 API 让 store 无需
// 引入异步动作，显著降低复杂度与出错面；localStorage 不可用时回退内存，绝不抛错
// （NFR-3 降级不静默失败——由 isPersistenceAvailable 上报供界面提示）。
// 审计流「只增不改」：仅追加、赋自增 seq，不提供改写接口。
// ============================================================

import type { AuditEntry } from '../domain/audit';
import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import type { CalcRecord, TraceStep } from '../engine/trace';
import type { DatasetRecord } from '../domain/dataset';
import type { EnvironmentState } from '../engine/conditions';
import type { MapTheme } from '../gis/mapTheme';
import type { ActiveDemoTwin } from '../gis/demoTwinScenario';

const NS = 'roadgov-mvp';
const AUDIT_KEY = `${NS}:audit`;
const RUNTIME_KEY = `${NS}:runtime`;
const RUNTIME_SNAPSHOT_VERSION = 3;

/** 可恢复的运行模式世界快照（刷新后「继续处置」）。 */
export interface RuntimeSnapshot {
  version: 3;
  savedAtReal: number;
  simSec: number;
  sceneBaseSec: number;
  events: SimEvent[];
  plans: Plan[];
  trace: TraceStep[];
  calcs: CalcRecord[];
  resourceOccupancy: Record<string, string>;
  environment: EnvironmentState;
  mapTheme?: MapTheme;
  datasetRecords: DatasetRecord[];
  timelineLog: { clock: string; text: string }[];
  activeDemoTwin?: ActiveDemoTwin;
}

// ---- 存储后端：localStorage，失败回退内存（保证永不抛错）----
const memory = new Map<string, string>();
let usingMemory = false;

function read(key: string): string | null {
  try {
    const v = window.localStorage.getItem(key);
    return v;
  } catch {
    usingMemory = true;
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    usingMemory = true;
    memory.set(key, value);
  }
}

function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    memory.delete(key);
  }
}

/** 持久化是否真正落盘（false 表示仅内存，界面应提示「本次处置不留痕」）。 */
export function isPersistenceAvailable(): boolean {
  try {
    const probe = `${NS}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function parse<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isEnvironmentState(value: unknown): value is EnvironmentState {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value.fogBands) || !isStringArray(value.offlineDeviceIds)) return false;
  return value.fogBands.every((band) => (
    isRecord(band)
    && typeof band.road === 'string'
    && isFiniteNumber(band.fromKp)
    && isFiniteNumber(band.toKp)
  ));
}

export function isRuntimeSnapshot(value: unknown): value is RuntimeSnapshot {
  if (!isRecord(value)) return false;
  if (value.version !== RUNTIME_SNAPSHOT_VERSION) return false;
  if (value.mapTheme !== undefined && value.mapTheme !== 'dark' && value.mapTheme !== 'light') return false;
  if (!isFiniteNumber(value.savedAtReal) || !isFiniteNumber(value.simSec) || !isFiniteNumber(value.sceneBaseSec)) return false;
  if (
    !Array.isArray(value.events)
    || !Array.isArray(value.plans)
    || !Array.isArray(value.trace)
    || !Array.isArray(value.calcs)
    || !Array.isArray(value.datasetRecords)
    || !Array.isArray(value.timelineLog)
  ) return false;
  if (!isRecord(value.resourceOccupancy)) return false;
  if (!Object.values(value.resourceOccupancy).every((item) => typeof item === 'string')) return false;
  if (value.activeDemoTwin !== undefined && (!isRecord(value.activeDemoTwin) || typeof value.activeDemoTwin.eventId !== 'string' || !isRecord(value.activeDemoTwin.script))) return false;
  return isEnvironmentState(value.environment);
}

// ---- 审计流（只增不改）----

/** 追加一条审计记录，返回带自增 seq 的完整记录。 */
export function appendAudit(entry: Omit<AuditEntry, 'seq'>): AuditEntry {
  const list = readAudit();
  const seq = (list[list.length - 1]?.seq ?? 0) + 1;
  const full: AuditEntry = { ...entry, seq };
  list.push(full);
  write(AUDIT_KEY, JSON.stringify(list));
  return full;
}

/** 读取全部审计记录（按 seq 升序）。 */
export function readAudit(): AuditEntry[] {
  const audit = parse<unknown>(read(AUDIT_KEY), []);
  return Array.isArray(audit) ? audit as AuditEntry[] : [];
}

// ---- 运行世界快照 ----

export function saveRuntime(snapshot: RuntimeSnapshot): void {
  write(RUNTIME_KEY, JSON.stringify(snapshot));
}

export function loadRuntime(): RuntimeSnapshot | null {
  const raw = read(RUNTIME_KEY);
  const snap = parse<unknown>(raw, null);
  if (isRuntimeSnapshot(snap)) return snap;

  // The five-case demo replaced the previous runtime dataset. Remove stale or
  // incompatible local state so old cards cannot reappear after refresh.
  if (raw != null) {
    remove(RUNTIME_KEY);
    remove(AUDIT_KEY);
  }
  return null;
}

/** 清空运行库（运行快照 + 审计流）。 */
export function clearPersistence(): void {
  remove(RUNTIME_KEY);
  remove(AUDIT_KEY);
  memory.clear();
}

/** 是否曾回退内存（诊断用）。 */
export function isUsingMemoryFallback(): boolean {
  return usingMemory;
}
