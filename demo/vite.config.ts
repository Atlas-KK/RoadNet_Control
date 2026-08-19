import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR || 'node_modules/.vite',
  plugins: [react(), tailwindcss()],
  build: {
    // MapLibre 已通过动态 import 拆为独立异步包；其 WebGL 渲染内核约 1MB，
    // 不进入首屏主包，因此按该依赖的合理体积提高单块提示阈值。
    chunkSizeWarningLimit: 1100,
  },
});
