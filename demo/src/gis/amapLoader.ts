/**
 * 高德 JS API 按需加载器。
 *
 * 本地演示使用 Vite 的 .env.local 注入密钥；正式环境应改为 serviceHost 代理，
 * securityJsCode 仅保存在网关或服务端，不能以此实现直接上线。
 */
export interface AMapMapInstance {
  setZoomAndCenter(zoom: number, center: [number, number]): void;
  setPitch(pitch: number): void;
  setRotation(rotation: number): void;
  add(overlays: AMapOverlay | AMapOverlay[]): void;
  remove(overlays: AMapOverlay | AMapOverlay[]): void;
  setBounds(bounds: [[number, number], [number, number]], options?: Record<string, unknown>): void;
  setCenter(center: [number, number]): void;
  setMapStyle(style: string): void;
  resize(): void;
  destroy(): void;
}

export interface AMapOverlay {
  on?(event: string, handler: () => void): void;
}

export interface AMapMarker extends AMapOverlay {}

export interface AMapApi {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => AMapMapInstance;
  Polyline: new (options: Record<string, unknown>) => AMapOverlay;
  Marker: new (options: Record<string, unknown>) => AMapMarker;
  InfoWindow: new (options: Record<string, unknown>) => { open(map: AMapMapInstance, position: [number, number]): void; close(): void };
}

declare global {
  interface Window {
    AMap?: AMapApi;
    _AMapSecurityConfig?: { securityJsCode?: string };
  }
}

let loadingPromise: Promise<AMapApi> | null = null;

export function loadAmap(): Promise<AMapApi> {
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loadingPromise) return loadingPromise;

  const key = import.meta.env.VITE_AMAP_KEY;
  const securityJsCode = import.meta.env.VITE_AMAP_SECURITY_JS_CODE;
  if (!key || !securityJsCode) return Promise.reject(new Error('未配置高德 JS API Key 或安全密钥'));

  // 必须先设置安全密钥，再请求 JS API 脚本。
  window._AMapSecurityConfig = { securityJsCode };
  loadingPromise = new Promise<AMapApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(key)}`;
    script.async = true;
    script.onload = () => window.AMap ? resolve(window.AMap) : reject(new Error('高德 JS API 加载完成但 AMap 对象不可用'));
    script.onerror = () => {
      // 失败不能永久占用单例：网络恢复或组件重新挂载后应允许重新请求地图脚本。
      loadingPromise = null;
      reject(new Error('高德 JS API 加载失败，请检查网络、Key 与域名白名单'));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
}
