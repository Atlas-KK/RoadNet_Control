import { describe, expect, it } from 'vitest';
import { ACTIVE_MODULE_SESSION_KEY, DEFAULT_ACTIVE_MODULE, parseActiveModule, persistActiveModule, readActiveModule, type SessionStorageLike } from './appShellState';

function createStorage(initial: Record<string, string> = {}): SessionStorageLike {
  const values = new Map(Object.entries(initial));
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

describe('一级模块会话恢复', () => {
  it('首次进入默认打开驾驶舱', () => {
    expect(readActiveModule(createStorage())).toBe(DEFAULT_ACTIVE_MODULE);
    expect(DEFAULT_ACTIVE_MODULE).toBe('cockpit');
  });

  it('恢复上次选择的业务模块', () => {
    const storage = createStorage({ [ACTIVE_MODULE_SESSION_KEY]: 'intelligent_control' });
    expect(readActiveModule(storage)).toBe('intelligent_control');
    expect(persistActiveModule(storage, 'event_monitoring')).toBe(true);
    expect(readActiveModule(storage)).toBe('event_monitoring');
  });

  it('非法值回退到驾驶舱', () => {
    expect(parseActiveModule('unknown-module')).toBe('cockpit');
  });

  it('存储不可用时不阻断页面加载', () => {
    const unavailable: SessionStorageLike = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readActiveModule(unavailable)).toBe('cockpit');
    expect(persistActiveModule(unavailable, 'intelligent_control')).toBe(false);
  });
});