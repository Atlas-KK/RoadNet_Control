// FR-EM-001：一级模块仅保存临时 UI 上下文，不进入业务 Store。
export type ActiveModule = 'cockpit' | 'event_monitoring' | 'intelligent_control';

export const DEFAULT_ACTIVE_MODULE: ActiveModule = 'cockpit';
export const ACTIVE_MODULE_SESSION_KEY = 'roadgov-mvp:active-module';

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseActiveModule(value: unknown): ActiveModule {
  return value === 'cockpit' || value === 'event_monitoring' || value === 'intelligent_control'
    ? value
    : DEFAULT_ACTIVE_MODULE;
}

export function readActiveModule(storage?: SessionStorageLike): ActiveModule {
  if (!storage) return DEFAULT_ACTIVE_MODULE;
  try {
    return parseActiveModule(storage.getItem(ACTIVE_MODULE_SESSION_KEY));
  } catch {
    return DEFAULT_ACTIVE_MODULE;
  }
}

export function persistActiveModule(storage: SessionStorageLike | undefined, activeModule: ActiveModule): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ACTIVE_MODULE_SESSION_KEY, activeModule);
    return true;
  } catch {
    return false;
  }
}

export function getBrowserSessionStorage(): SessionStorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}
