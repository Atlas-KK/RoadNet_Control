import { describe, expect, it } from 'vitest';
import {
  ACTIVE_MODULE_SESSION_KEY,
  DEFAULT_ACTIVE_MODULE,
  parseActiveModule,
  persistActiveModule,
  readActiveModule,
  type SessionStorageLike,
} from './appShellState';

function createStorage(initial: Record<string, string> = {}): SessionStorageLike {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

describe('FR-EM-001 一级模块会话恢复', () => {
  it('首次进入默认打开事件监测', () => {
    expect(readActiveModule(createStorage())).toBe(DEFAULT_ACTIVE_MODULE);
  });

  it('恢复上次选择的智能管控模块', () => {
    const storage = createStorage({ [ACTIVE_MODULE_SESSION_KEY]: 'intelligent_control' });
    expect(readActiveModule(storage)).toBe('intelligent_control');
  });

  it('非法值回退到事件监测', () => {
    expect(parseActiveModule('unknown-module')).toBe('event_monitoring');
  });

  it('只写入sessionStorage兼容接口', () => {
    const storage = createStorage();
    expect(persistActiveModule(storage, 'intelligent_control')).toBe(true);
    expect(readActiveModule(storage)).toBe('intelligent_control');
  });

  it('存储不可用时不阻断页面加载', () => {
    const unavailable: SessionStorageLike = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    expect(readActiveModule(unavailable)).toBe('event_monitoring');
    expect(persistActiveModule(unavailable, 'intelligent_control')).toBe(false);
  });
});
