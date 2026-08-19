import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('loadAmap', () => {
  it('clears a failed load so a later mount can retry', async () => {
    vi.stubEnv('VITE_AMAP_KEY', 'test-key');
    vi.stubEnv('VITE_AMAP_SECURITY_JS_CODE', 'test-security-code');
    const scripts: Array<{ onerror?: () => void }> = [];
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {
      createElement: () => ({}),
      // 浏览器脚本加载事件异步触发；用微任务保持与真实时序一致。
      head: { appendChild: (script: { onerror?: () => void }) => { scripts.push(script); queueMicrotask(() => script.onerror?.()); } },
    });

    const { loadAmap } = await import('./amapLoader');
    await expect(loadAmap()).rejects.toThrow('高德 JS API 加载失败');
    await expect(loadAmap()).rejects.toThrow('高德 JS API 加载失败');

    // 两次均创建脚本，证明首次失败没有把 rejected Promise 缓存为永久状态。
    expect(scripts).toHaveLength(2);
  });
});
