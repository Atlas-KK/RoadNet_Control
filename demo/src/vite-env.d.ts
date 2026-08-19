/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LLM_BASE_URL?: string;
  readonly VITE_LLM_API_KEY?: string;
  readonly VITE_LLM_QWEN_API_KEY?: string;
  readonly VITE_LLM_DEEPSEEK_API_KEY?: string;
  readonly VITE_LLM_KIMI_API_KEY?: string;
  readonly VITE_LLM_MODEL?: string;
  readonly VITE_LLM_TIMEOUT_MS?: string;
  readonly VITE_LLM_PROVIDER?: 'qwen' | 'deepseek' | 'kimi' | 'custom';
  readonly VITE_AMAP_KEY?: string;
  readonly VITE_AMAP_SECURITY_JS_CODE?: string;
}
