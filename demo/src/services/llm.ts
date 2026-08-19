import type { SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import type { RoadId } from '../data/network';
import { tunnelAt } from '../data/network';
import { tracePathForStep, type CalcRecord, type TraceStep } from '../engine/trace';
import type { RuntimeEventInput } from '../engine/ingest';
import type { RadarFusionTraffic } from '../gis/radarFusionTraffic';
import type { ActiveDemoTwin } from '../gis/demoTwinScenario';
import type { EnvironmentState } from '../engine/conditions';
import { resolveGantryTrafficReading } from '../engine/gantryTraffic';
import { resolveTrafficMonitorReading } from '../engine/trafficMonitor';
import { resolveTrafficResponse } from '../engine/trafficResponse';
import { resourceById } from '../data/resources';

// ============================================================
// 可选 LLM 文案通道与值级溯源校验（开发规格 MVP · FR-D2/D3/D4 / 产品方案 3.5）
// 默认模板引擎兜底；启用 LLM 时对其输出做 ① JSON schema 校验 ② 值级比对——
// 文案中出现的桩号/资源 ID/ETA 分钟数必须与引擎产物逐字段一致，否则拒绝出案、回退模板。
// 规则优先仲裁：LLM 表述与引擎清单冲突时以引擎为准。
//
// 比对器为纯函数、可单测（FR-D3 关键断言：值错位注入被拒绝）；fetch 封装需真实端点，
// 本地不联调；运行期只有在用户配置 Key 后才调用 LLM。
// ============================================================

/** OpenAI 兼容端点配置（仅存 localStorage，导出物不含密钥）。 */
export type LlmProvider = 'qwen' | 'deepseek' | 'kimi' | 'custom';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
  provider?: LlmProvider;
}

export interface LlmProviderPreset {
  provider: Exclude<LlmProvider, 'custom'>;
  label: string;
  baseUrl: string;
  model: string;
}

export interface LlmModelOption {
  value: string;
  label: string;
}

export const LLM_PROVIDER_PRESETS: Record<Exclude<LlmProvider, 'custom'>, LlmProviderPreset> = {
  qwen: {
    provider: 'qwen',
    label: 'Qwen / 通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  deepseek: {
    provider: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
  },
  kimi: {
    provider: 'kimi',
    label: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
  },
};

export const LLM_MODEL_OPTIONS: Record<Exclude<LlmProvider, 'custom'>, LlmModelOption[]> = {
  qwen: [
    { value: 'qwen-plus', label: 'qwen-plus（均衡稳定）' },
    { value: 'qwen-turbo', label: 'qwen-turbo（速度优先）' },
    { value: 'qwen-max', label: 'qwen-max（复杂任务）' },
    { value: 'qwen3.7-plus', label: 'qwen3.7-plus（新版 Plus）' },
    { value: 'qwen3.7-max', label: 'qwen3.7-max（新版 Max）' },
    { value: 'qwen3.6-plus', label: 'qwen3.6-plus' },
    { value: 'qwen3.5-flash', label: 'qwen3.5-flash（轻量）' },
  ],
  deepseek: [
    { value: 'deepseek-v4-flash', label: 'deepseek-v4-flash（推荐）' },
    { value: 'deepseek-v4-pro', label: 'deepseek-v4-pro（高质量）' },
    { value: 'deepseek-chat', label: 'deepseek-chat（旧兼容名）' },
    { value: 'deepseek-reasoner', label: 'deepseek-reasoner（旧推理名）' },
  ],
  kimi: [
    { value: 'moonshot-v1-8k', label: 'moonshot-v1-8k' },
    { value: 'moonshot-v1-32k', label: 'moonshot-v1-32k' },
    { value: 'moonshot-v1-128k', label: 'moonshot-v1-128k' },
    { value: 'kimi-k2.5', label: 'kimi-k2.5' },
    { value: 'kimi-k2.7-code', label: 'kimi-k2.7-code' },
  ],
};

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  baseUrl: LLM_PROVIDER_PRESETS.qwen.baseUrl,
  apiKey: '',
  model: LLM_PROVIDER_PRESETS.qwen.model,
  timeoutMs: 30000,
  provider: 'qwen',
};

export const QWEN_LLM_PRESET: Pick<LlmConfig, 'baseUrl' | 'model' | 'provider'> = {
  baseUrl: LLM_PROVIDER_PRESETS.qwen.baseUrl,
  model: LLM_PROVIDER_PRESETS.qwen.model,
  provider: 'qwen',
};

const LLM_CONFIG_KEY = 'roadgov-mvp:llm';
const LLM_API_KEY_SESSION_KEY = 'roadgov-mvp:llm-api-key';
const LLM_ENV_KEYS = {
  baseUrl: 'VITE_LLM_BASE_URL',
  apiKey: 'VITE_LLM_API_KEY',
  qwenApiKey: 'VITE_LLM_QWEN_API_KEY',
  deepseekApiKey: 'VITE_LLM_DEEPSEEK_API_KEY',
  kimiApiKey: 'VITE_LLM_KIMI_API_KEY',
  model: 'VITE_LLM_MODEL',
  timeoutMs: 'VITE_LLM_TIMEOUT_MS',
  provider: 'VITE_LLM_PROVIDER',
} as const;

interface StoredLlmConfig {
  baseUrl?: unknown;
  model?: unknown;
  timeoutMs?: unknown;
  provider?: unknown;
}

function isLlmProvider(value: unknown): value is LlmProvider {
  return value === 'qwen' || value === 'deepseek' || value === 'kimi' || value === 'custom';
}

export function getLlmProviderLabel(provider?: LlmProvider): string {
  if (provider === 'custom') return '自定义兼容端点';
  return provider ? LLM_PROVIDER_PRESETS[provider].label : LLM_PROVIDER_PRESETS.qwen.label;
}

export function getLlmProviderPreset(provider: Exclude<LlmProvider, 'custom'>): Pick<LlmConfig, 'baseUrl' | 'model' | 'provider'> {
  const preset = LLM_PROVIDER_PRESETS[provider];
  return { baseUrl: preset.baseUrl, model: preset.model, provider };
}

function readEnvString(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readEnvProvider(): LlmConfig['provider'] | undefined {
  const provider = readEnvString(LLM_ENV_KEYS.provider);
  return isLlmProvider(provider) ? provider : undefined;
}

export function readConfiguredLlmApiKey(provider?: LlmProvider): string | undefined {
  if (provider === 'qwen') return readEnvString(LLM_ENV_KEYS.qwenApiKey) ?? readEnvString(LLM_ENV_KEYS.apiKey);
  if (provider === 'deepseek') return readEnvString(LLM_ENV_KEYS.deepseekApiKey) ?? readEnvString(LLM_ENV_KEYS.apiKey);
  if (provider === 'kimi') return readEnvString(LLM_ENV_KEYS.kimiApiKey) ?? readEnvString(LLM_ENV_KEYS.apiKey);
  return readEnvString(LLM_ENV_KEYS.apiKey);
}

function readEnvLlmConfig(): Partial<LlmConfig> {
  const timeoutText = readEnvString(LLM_ENV_KEYS.timeoutMs);
  const timeoutMs = timeoutText == null ? undefined : Number(timeoutText);
  const provider = readEnvProvider();
  const preset = provider && provider !== 'custom' ? LLM_PROVIDER_PRESETS[provider] : undefined;
  return {
    baseUrl: readEnvString(LLM_ENV_KEYS.baseUrl) ?? preset?.baseUrl,
    apiKey: readConfiguredLlmApiKey(provider),
    model: readEnvString(LLM_ENV_KEYS.model) ?? preset?.model,
    timeoutMs: timeoutMs != null && Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : undefined,
    provider,
  };
}

export function hasEnvLlmApiKey(provider?: LlmProvider): boolean {
  return readConfiguredLlmApiKey(provider) != null;
}

function getStorage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function isAllowedLlmBaseUrl(baseUrl: string): boolean {
  if (baseUrl.trim() === '') return true;
  try {
    const url = new URL(baseUrl);
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function loadLlmConfig(): LlmConfig {
  let stored: StoredLlmConfig = {};
  try {
    stored = JSON.parse(getStorage('local')?.getItem(LLM_CONFIG_KEY) ?? '{}') as StoredLlmConfig;
  } catch {
    stored = {};
  }
  const envConfig = readEnvLlmConfig();
  const provider = isLlmProvider(stored.provider) ? stored.provider : envConfig.provider ?? DEFAULT_LLM_CONFIG.provider;
  const preset = provider && provider !== 'custom' ? LLM_PROVIDER_PRESETS[provider] : undefined;
  const apiKey = getStorage('session')?.getItem(LLM_API_KEY_SESSION_KEY) || readConfiguredLlmApiKey(provider) || envConfig.apiKey || '';
  return {
    ...DEFAULT_LLM_CONFIG,
    baseUrl: typeof stored.baseUrl === 'string' ? stored.baseUrl : envConfig.baseUrl ?? preset?.baseUrl ?? DEFAULT_LLM_CONFIG.baseUrl,
    model: typeof stored.model === 'string' ? stored.model : envConfig.model ?? preset?.model ?? DEFAULT_LLM_CONFIG.model,
    timeoutMs: typeof stored.timeoutMs === 'number' && Number.isFinite(stored.timeoutMs)
      ? stored.timeoutMs
      : envConfig.timeoutMs ?? DEFAULT_LLM_CONFIG.timeoutMs,
    provider,
    apiKey,
  };
}

export function saveLlmConfig(config: LlmConfig): ValidationResult {
  if (!isAllowedLlmBaseUrl(config.baseUrl)) {
    return { ok: false, reasons: ['LLM endpoint must use HTTPS, localhost, or 127.0.0.1'] };
  }
  try {
    getStorage('local')?.setItem(LLM_CONFIG_KEY, JSON.stringify({
      baseUrl: config.baseUrl,
      model: config.model,
      timeoutMs: config.timeoutMs,
      provider: config.provider ?? 'custom',
    }));
    const session = getStorage('session');
    if (config.apiKey) session?.setItem(LLM_API_KEY_SESSION_KEY, config.apiKey);
    else session?.removeItem(LLM_API_KEY_SESSION_KEY);
  } catch {
    return { ok: false, reasons: ['LLM config storage is unavailable'] };
  }
  return { ok: true, reasons: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown, max = 500): value is string {
  return typeof value === 'string' && value.trim() !== '' && value.length <= max;
}

function isStringArray(value: unknown, maxItems = 12, maxLen = 80): value is string[] {
  return Array.isArray(value)
    && value.length <= maxItems
    && value.every((item) => typeof item === 'string' && item.length <= maxLen);
}

function normalizeLlmErrorReason(error: unknown, aborted: boolean, timeoutMs: number): string {
  const message = error instanceof Error ? error.message : '';
  const name = error instanceof Error ? error.name : '';
  if (aborted || name === 'AbortError' || /aborted|abort|signal is aborted/i.test(message)) {
    return `大模型响应超时或请求被中断（已等待 ${Math.round(timeoutMs / 1000)} 秒），可稍后重试或切换更快模型。`;
  }
  return message || '调用失败';
}

interface LlmRequestOptions {
  maxTokens?: number;
  timeoutMs?: number;
}

async function responseFailureReason(res: Response): Promise<string> {
  let detail = '';
  try {
    const raw = typeof res.text === 'function' ? await res.text() : '';
    if (raw) {
      const parsed = JSON.parse(raw) as { error?: { message?: unknown }; message?: unknown };
      const message = parsed.error?.message ?? parsed.message;
      detail = typeof message === 'string' ? message.trim() : raw.trim();
    }
  } catch {
    // 保留 HTTP 状态码；部分兼容端点的错误响应不是 JSON。
  }
  return detail ? `HTTP ${res.status}：${truncateText(detail, 180)}` : `HTTP ${res.status}`;
}

async function requestJsonObject(config: LlmConfig, system: string, prompt: string, options: LlmRequestOptions = {}): Promise<
  | { status: 'ok'; value: unknown }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string }
> {
  if (!config.baseUrl || !config.model) {
    return { status: 'unavailable', reason: '未配置 LLM 端点' };
  }
  if (!isAllowedLlmBaseUrl(config.baseUrl)) {
    return { status: 'unavailable', reason: 'LLM endpoint must use HTTPS or localhost' };
  }
  if (!config.apiKey) {
    return { status: 'unavailable', reason: '未配置 LLM API Key' };
  }
  const timeoutMs = Math.max(options.timeoutMs ?? config.timeoutMs, DEFAULT_LLM_CONFIG.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
    const body = {
      model: config.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: options.maxTokens ?? 900,
      response_format: { type: 'json_object' },
    };
    const send = (payload: Record<string, unknown>) => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let res = await send(body);
    let initialFailure: string | undefined;
    // 部分 OpenAI 兼容代理不支持 response_format。提示词已明确要求 JSON，故可安全降级重试一次。
    if (!res.ok && res.status === 400) {
      initialFailure = await responseFailureReason(res);
      const { response_format: _jsonMode, ...compatibilityBody } = body;
      res = await send(compatibilityBody);
    }
    if (!res.ok) return { status: 'unavailable', reason: initialFailure ?? await responseFailureReason(res) };
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    try {
      return { status: 'ok', value: JSON.parse(content) };
    } catch {
      return { status: 'rejected', reasons: ['输出非合法 JSON'] };
    }
  } catch (e) {
    return { status: 'unavailable', reason: normalizeLlmErrorReason(e, controller.signal.aborted, timeoutMs) };
  } finally {
    clearTimeout(timer);
  }
}

/** 引擎产物中允许出现在文案里的关键值白名单。 */
export interface EngineFacts {
  kps: number[];
  resourceIds: string[];
  etaMins: number[];
  measureIds?: string[];
}

/** LLM 应输出的结构化草稿（schema 目标）。 */
export interface LlmDraft {
  summary: string;
  measureNotes: { measureId: string; note: string }[];
  riskNote: string;
}

export function buildPlanNarrativeFacts(event: SimEvent, plan: Plan): EngineFacts {
  return {
    kps: [
      event.accidentKp,
      ...plan.measures.flatMap((measure) => Object.values(measure.params ?? {})
        .map((param) => Number(param.value))
        .filter((value) => Number.isFinite(value) && value >= 100 && value <= 1300)),
    ],
    resourceIds: plan.measures.flatMap((measure) => measure.resource?.id ? [measure.resource.id] : []),
    etaMins: plan.measures.flatMap((measure) => measure.resource?.etaMin != null ? [measure.resource.etaMin] : []),
    measureIds: plan.measures.map((measure) => measure.measureId),
  };
}

export function buildPlanNarrativePrompt(event: SimEvent, plan: Plan, conditions: string[] = []): string {
  const measures = plan.measures.map((measure) => ({
    measureId: measure.measureId,
    title: measure.title,
    tier: measure.tier,
    summary: measure.summary,
    resource: measure.resource,
    params: measure.params,
  }));
  return JSON.stringify({
    task: '为高速路网运行处置预案生成面向值班员的中文文案。只返回 JSON，不要 Markdown。',
    outputSchema: {
      summary: '不超过120字，说明事件、影响和处置重点',
      measureNotes: '数组，每项包含 measureId 和不超过40字 note，只能使用输入里的 measureId',
      riskNote: '不超过60字，说明下一步风险或复核重点',
    },
    hardRules: [
      '不得编造桩号、资源ID、ETA、措施ID或电话号码',
      '所有关键数值必须来自 input',
      'measureNotes.measureId 必须来自 input.plan.measures',
    ],
    input: {
      event: {
        id: event.id,
        road: event.road,
        accidentKp: event.accidentKp,
        label: event.label,
        lanesTotal: event.lanesTotal,
        lanesClosed: event.lanesClosed,
        q: event.q,
        congested: event.congested,
        severity: event.severity,
        casualties: event.casualties,
        hazmat: event.hazmat,
      },
      plan: {
        id: plan.id,
        version: plan.version,
        responsible: plan.responsible,
        confidence: plan.confidence,
        measures,
      },
      conditions,
    },
  });
}

export interface ValidationResult {
  ok: boolean;
  reasons: string[];
}

// ---- 值级归一化 ----

function nearlyIn(value: number, whitelist: number[], tol = 0.05): boolean {
  return whitelist.some((w) => Math.abs(w - value) <= tol);
}

/** 收集草稿全部文本。 */
function draftText(draft: LlmDraft): string {
  return [draft.summary, draft.riskNote, ...draft.measureNotes.map((m) => m.note)].join(' \n ');
}

/**
 * 值级溯源比对：抽取文案中的桩号（K1180/桩号1180/1180.0）、资源 ID（W-01/W-EX…）、
 * ETA（41min/41 分钟），逐一核对是否落在引擎产物白名单内；任一越界即判为不一致。
 * 归一化「1180 == 1180.0」「41min == 41 分钟」。
 */
export function verifyValueSourcing(draft: LlmDraft, facts: EngineFacts): ValidationResult {
  const text = draftText(draft);
  const reasons: string[] = [];

  // 桩号：需 K 或「桩号」前缀，避免误伤「封 2 车道」等普通数字。
  for (const m of text.matchAll(/(?:K|桩号)\s*(\d{3,4}(?:\.\d+)?)/g)) {
    const kp = Number(m[1]);
    if (!nearlyIn(kp, facts.kps)) reasons.push(`桩号 K${m[1]} 不在引擎产物白名单`);
  }
  // ETA：需 min/分钟 后缀。
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(?:min|分钟)/g)) {
    const eta = Number(m[1]);
    if (!nearlyIn(eta, facts.etaMins)) reasons.push(`ETA ${m[1]}min 不在引擎产物白名单`);
  }
  // 资源 ID：字母-编号形态（W-01 / W-EX / A-01 / L-02 / F-STA）。
  for (const m of text.matchAll(/\b([WALF]-[0-9A-Z]{2,})\b/g)) {
    if (!facts.resourceIds.includes(m[1])) reasons.push(`资源 ${m[1]} 不在引擎产物白名单`);
  }
  if (facts.measureIds) {
    for (const note of draft.measureNotes) {
      if (!facts.measureIds.includes(note.measureId)) reasons.push(`措施 ${note.measureId} 不在引擎产物白名单`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/** JSON schema 校验（字段/类型/长度上限，FR-D2）。 */
export function validateDraftSchema(value: unknown): ValidationResult {
  const reasons: string[] = [];
  const v = value as Partial<LlmDraft> | null;
  if (!v || typeof v !== 'object') return { ok: false, reasons: ['输出非对象'] };
  if (typeof v.summary !== 'string' || v.summary.length === 0 || v.summary.length > 120) {
    reasons.push('summary 缺失或超 120 字');
  }
  if (typeof v.riskNote !== 'string' || v.riskNote.length > 60) reasons.push('riskNote 缺失或超 60 字');
  if (!Array.isArray(v.measureNotes)) {
    reasons.push('measureNotes 非数组');
  } else if (v.measureNotes.some((m) => typeof m.measureId !== 'string' || typeof m.note !== 'string' || m.note.length > 40)) {
    reasons.push('measureNotes 项非法或 note 超 40 字');
  }
  return { ok: reasons.length === 0, reasons };
}

const ROAD_IDS: RoadId[] = ['G65', 'G65S', 'G56', 'S204'];
const EVENT_TYPE_IDS = ['E_追尾', 'E_侧翻', 'E_抛锚', 'E_危化泄漏'] as const;
const EVENT_DIRECTIONS = ['up', 'down', 'unknown'] as const;

export interface StructuredEventDraft extends Omit<RuntimeEventInput, 'vf'> {
  vf?: number;
  confidence: '高' | '中' | '低';
  normalizedText: string;
  missingFields: string[];
}

export interface GraphReasoningAiStep {
  stepId: string;
  title: string;
  chainExplanation: string;
  nodeStatements: {
    nodeId: string;
    nodeLabel: string;
    plainLanguage: string;
    roleInChain: string;
  }[];
  conclusionStatement: string;
  confidence: '高' | '中' | '低';
  operatorFocus: string[];
  evidenceRefs: { type: 'node' | 'edge' | 'step'; id: string; label: string }[];
  limits: string;
}

export interface GraphReasoningDraft {
  steps: GraphReasoningAiStep[];
}

export interface TrafficFlowCalcFinding {
  calcId: string;
  metric: string;
  value: string;
  plainMeaning: string;
  level: 'info' | 'success' | 'warning' | 'danger';
}

export interface TrafficFlowCalcDraft {
  title: string;
  summarySentence: string;
  indicatorFindings: TrafficFlowCalcFinding[];
  integratedConclusion: string;
  operatorImplication: string;
  uncertainty: string;
  evidenceRefs: { type: 'calc'; id: string; label: string }[];
}

export interface TwinSituationDraft {
  headline: string;
  commandConclusion: string;
  eventOverview: string;
  trafficImpact: {
    upstream: string;
    incidentPoint: string;
    downstream: string;
    overallLevel: '畅通' | '轻度拥堵' | '中度拥堵' | '重度拥堵' | '待判定';
  };
  responseProgress: { measure: string; status: string; detail: string }[];
  risks: { level: '高' | '中' | '低'; content: string }[];
  nextFocus: { timeWindow: string; action: string; trigger: string }[];
  confidenceNote: string;
}

export interface TwinSituationContext {
  plans: Plan[];
  activeDemoTwin?: ActiveDemoTwin;
  environment: EnvironmentState;
}

export type StructuredEventOutcome =
  | { status: 'ok'; draft: StructuredEventDraft }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

export type GraphReasoningOutcome =
  | { status: 'ok'; draft: GraphReasoningDraft }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

export type TrafficFlowCalcOutcome =
  | { status: 'ok'; draft: TrafficFlowCalcDraft }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

export type TwinSituationOutcome =
  | { status: 'ok'; draft: TwinSituationDraft }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

export interface ComprehensiveConclusionDraft {
  title: string;
  summarySentence: string;
  graphReasoning: GraphReasoningAiStep;
  trafficFlow: TrafficFlowCalcDraft;
  integratedConclusion: string;
  operatorImplication: string;
  confidence: '高' | '中' | '低';
  uncertainty: string;
  evidenceRefs: { type: 'node' | 'edge' | 'step' | 'calc'; id: string; label: string }[];
}

export type ComprehensiveConclusionOutcome =
  | { status: 'ok'; draft: ComprehensiveConclusionDraft }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function validateStructuredEventDraft(value: unknown): { ok: true; draft: StructuredEventDraft } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRecord(value)) return { ok: false, reasons: ['结构化事件输出非对象'] };
  if (!ROAD_IDS.includes(value.road as RoadId)) reasons.push('road 不在路网白名单');
  if (typeof value.accidentKp !== 'number' || !Number.isFinite(value.accidentKp)) reasons.push('accidentKp 缺失或非法');
  if (!EVENT_TYPE_IDS.includes(value.typeNodeId as typeof EVENT_TYPE_IDS[number])) reasons.push('typeNodeId 不在事件类型白名单');
  if (!isNonEmptyString(value.label, 80)) reasons.push('label 缺失或过长');
  if (typeof value.lanesTotal !== 'number' || value.lanesTotal < 1 || value.lanesTotal > 6) reasons.push('lanesTotal 缺失或非法');
  if (typeof value.lanesClosed !== 'number' || value.lanesClosed < 0 || value.lanesClosed > 6) reasons.push('lanesClosed 缺失或非法');
  if (typeof value.q !== 'number' || value.q < 0 || value.q > 12000) reasons.push('q 缺失或非法');
  if (!EVENT_DIRECTIONS.includes(value.direction as typeof EVENT_DIRECTIONS[number])) reasons.push('direction 缺失或非法');
  if (!['高', '中', '低'].includes(String(value.confidence))) reasons.push('confidence 缺失或非法');
  if (!isNonEmptyString(value.sourceKind, 30)) reasons.push('sourceKind 缺失或过长');
  if (!isNonEmptyString(value.normalizedText, 220)) reasons.push('normalizedText 缺失或过长');
  if (!isStringArray(value.missingFields, 8, 30)) reasons.push('missingFields 非法');
  const vf = parseOptionalNumber(value.vf);
  const casualties = parseOptionalNumber(value.casualties);
  const vehicles = parseOptionalNumber(value.vehicles);
  if (vf != null && (vf <= 0 || vf > 160)) reasons.push('vf 越界');
  if (casualties != null && (casualties < 0 || casualties > 99)) reasons.push('casualties 越界');
  if (vehicles != null && (vehicles < 0 || vehicles > 50)) reasons.push('vehicles 越界');
  const hazmat = parseOptionalBoolean(value.hazmat);
  if (value.hazmat != null && hazmat == null) reasons.push('hazmat 非布尔值');
  if (reasons.length > 0) return { ok: false, reasons };
  const lanesTotal = Math.round(value.lanesTotal as number);
  const lanesClosed = Math.min(lanesTotal, Math.round(value.lanesClosed as number));
  return {
    ok: true,
    draft: {
      sourceKind: String(value.sourceKind),
      road: value.road as RoadId,
      accidentKp: Number(value.accidentKp),
      typeNodeId: value.typeNodeId as string,
      label: String(value.label),
      lanesTotal,
      lanesClosed,
      q: Number(value.q),
      vf,
      casualties,
      hazmat,
      vehicles,
      direction: value.direction as StructuredEventDraft['direction'],
      confidence: value.confidence as StructuredEventDraft['confidence'],
      normalizedText: String(value.normalizedText),
      missingFields: value.missingFields as string[],
    },
  };
}

export function validateGraphReasoningDraft(
  value: unknown,
  allowedStepIds: string[],
  allowedNodeIds: string[] = [],
): { ok: true; draft: GraphReasoningDraft } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRecord(value)) return { ok: false, reasons: ['图谱解释输出非对象'] };
  if (!Array.isArray(value.steps)) reasons.push('steps 非数组');
  const steps: GraphReasoningAiStep[] = [];
  if (Array.isArray(value.steps)) {
    for (const item of value.steps) {
      if (!isRecord(item)) {
        reasons.push('steps 项非对象');
        continue;
      }
      const stepId = String(item.stepId);
      if (!allowedStepIds.includes(stepId)) reasons.push(`stepId ${stepId} 不在当前推理步骤内`);
      const title = '因果顺成推演结论';
      const chainExplanation = truncateText(
        compactText(item.chainExplanation || item.overall || item.plainLanguage || item.summary, '系统已沿当前高亮节点完成图谱推理。'),
        220,
      );
      const nodeStatements: GraphReasoningAiStep['nodeStatements'] = [];
      if (Array.isArray(item.nodeStatements)) {
        for (const node of item.nodeStatements) {
          if (!isRecord(node)) {
            continue;
          }
          const nodeId = String(node.nodeId);
          if (allowedNodeIds.length > 0 && !allowedNodeIds.includes(nodeId)) reasons.push(`nodeId ${nodeId} 不在当前推理路径内`);
          nodeStatements.push({
            nodeId,
            nodeLabel: truncateText(compactText(node.nodeLabel || node.label || nodeId, nodeId), 40),
            plainLanguage: truncateText(compactText(node.plainLanguage || node.meaning || node.note, '该节点参与本步图谱推理。'), 160),
            roleInChain: truncateText(compactText(node.roleInChain || node.role, '推导'), 30),
          });
        }
      }
      if (nodeStatements.length === 0 && allowedNodeIds[0]) {
        nodeStatements.push({
          nodeId: allowedNodeIds[0],
          nodeLabel: allowedNodeIds[0],
          plainLanguage: '该节点是本步图谱推理路径中的关键节点。',
          roleInChain: '推导',
        });
      }
      const conclusionStatement = truncateText(
        compactText(item.conclusionStatement || item.conclusion || chainExplanation, '本步图谱推理结论已由当前高亮路径形成。'),
        220,
      );
      const confidence = ['高', '中', '低'].includes(String(item.confidence)) ? item.confidence as '高' | '中' | '低' : '中';
      const operatorFocus = Array.isArray(item.operatorFocus)
        ? item.operatorFocus.map((focus) => truncateText(compactText(focus), 80)).filter(Boolean).slice(0, 3)
        : ['复核当前图谱节点对应的现场事实是否仍成立。'];
      const evidenceRefs: GraphReasoningAiStep['evidenceRefs'] = [];
      if (Array.isArray(item.evidenceRefs)) {
        for (const ref of item.evidenceRefs) {
          if (!isRecord(ref)) {
            continue;
          }
          const type = ['node', 'edge', 'step'].includes(String(ref.type)) ? String(ref.type) : 'node';
          const id = String(ref.id);
          if (!['node', 'edge', 'step'].includes(type)) reasons.push('evidenceRefs.type 非法');
          if (type === 'node' && allowedNodeIds.length > 0 && !allowedNodeIds.includes(id)) reasons.push(`evidenceRefs node ${id} 不在当前推理路径内`);
          if (type === 'step' && !allowedStepIds.includes(id)) reasons.push(`evidenceRefs step ${id} 不在当前推理步骤内`);
          evidenceRefs.push({ type: type as 'node' | 'edge' | 'step', id, label: truncateText(compactText(ref.label || ref.name || ref.id, id), 60) });
        }
      }
      if (evidenceRefs.length === 0) {
        const fallback = firstAllowedNodeRef(allowedNodeIds);
        if (fallback) evidenceRefs.push(fallback);
      }
      const rawLimits = compactText(item.limits, '');
      const limits = rawLimits.includes('交通流')
        ? truncateText(rawLimits, 120)
        : '该结论解释的是图谱因果链，不替代交通流指标综合结论。';
      if (allowedStepIds.includes(stepId)) {
        steps.push({
          stepId,
          title,
          chainExplanation,
          nodeStatements,
          conclusionStatement,
          confidence,
          operatorFocus,
          evidenceRefs,
          limits,
        });
      }
    }
  }
  if (steps.length === 0) reasons.push('steps 为空');
  return reasons.length === 0
    ? { ok: true, draft: { steps } }
    : { ok: false, reasons };
}

function allowedCalcValues(records: CalcRecord[]): string[] {
  return records.flatMap((record) => [record.result, record.summaryValue].filter((value): value is string => Boolean(value)));
}

export function validateTrafficFlowCalcDraft(value: unknown, records: CalcRecord[]): { ok: true; draft: TrafficFlowCalcDraft } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRecord(value)) return { ok: false, reasons: ['交通流计算解读输出非对象'] };
  const allowedCalcIds = records.map((record) => record.id);
  const allowedValues = allowedCalcValues(records);
  if (!isNonEmptyString(value.title, 40) || value.title !== '交通流计算综合解读') reasons.push('title 必须为交通流计算综合解读');
  if (!isNonEmptyString(value.summarySentence, 180)) reasons.push('summarySentence 缺失或过长');
  if (!Array.isArray(value.indicatorFindings)) reasons.push('indicatorFindings 非数组');
  const indicatorFindings: TrafficFlowCalcFinding[] = [];
  if (Array.isArray(value.indicatorFindings)) {
    for (const item of value.indicatorFindings) {
      if (!isRecord(item)) {
        reasons.push('indicatorFindings 项非对象');
        continue;
      }
      const calcId = String(item.calcId);
      if (!allowedCalcIds.includes(calcId)) reasons.push(`calcId ${calcId} 不在当前事件计算记录内`);
      if (!isNonEmptyString(item.metric, 40)) reasons.push('metric 缺失或过长');
      if (!isNonEmptyString(item.value, 50)) reasons.push('value 缺失或过长');
      if (!isNonEmptyString(item.plainMeaning, 180)) reasons.push('plainMeaning 缺失或过长');
      if (!['info', 'success', 'warning', 'danger'].includes(String(item.level))) reasons.push('level 非法');
      if (String(item.value).includes('未计算')) reasons.push(`calcId ${calcId} 已有结果时不得输出未计算`);
      indicatorFindings.push({
        calcId,
        metric: String(item.metric ?? ''),
        value: String(item.value ?? ''),
        plainMeaning: String(item.plainMeaning ?? ''),
        level: item.level as TrafficFlowCalcFinding['level'],
      });
    }
  }
  if (indicatorFindings.length === 0 && records.length > 0) reasons.push('indicatorFindings 为空');
  if (!isNonEmptyString(value.integratedConclusion, 220)) reasons.push('integratedConclusion 缺失或过长');
  if (!isNonEmptyString(value.operatorImplication, 180)) reasons.push('operatorImplication 缺失或过长');
  if (!isNonEmptyString(value.uncertainty, 140)) reasons.push('uncertainty 缺失或过长');
  if (!Array.isArray(value.evidenceRefs)) reasons.push('evidenceRefs 非数组');
  const evidenceRefs: TrafficFlowCalcDraft['evidenceRefs'] = [];
  if (Array.isArray(value.evidenceRefs)) {
    for (const ref of value.evidenceRefs) {
      if (!isRecord(ref)) {
        reasons.push('evidenceRefs 项非对象');
        continue;
      }
      const id = String(ref.id);
      if (ref.type !== 'calc') reasons.push('evidenceRefs.type 必须为 calc');
      if (!allowedCalcIds.includes(id)) reasons.push(`evidenceRefs calc ${id} 不在当前事件计算记录内`);
      if (!isNonEmptyString(ref.label, 60)) reasons.push('evidenceRefs.label 缺失或过长');
      evidenceRefs.push({ type: 'calc', id, label: String(ref.label ?? '') });
    }
  }
  const fullText = [
    value.summarySentence,
    value.integratedConclusion,
    value.operatorImplication,
    ...indicatorFindings.flatMap((item) => [item.value, item.plainMeaning]),
  ].join('\n');
  if (records.length > 0 && fullText.includes('未计算')) reasons.push('当前事件已有计算记录时不得笼统输出未计算');
  const mentionsKnownValue = allowedValues.length === 0 || allowedValues.some((text) => fullText.includes(text.replace(/^=\s*/, '').trim()) || fullText.includes(text.trim()));
  if (!mentionsKnownValue) reasons.push('输出未引用任何当前事件计算值');
  return reasons.length === 0
    ? {
        ok: true,
        draft: {
          title: String(value.title),
          summarySentence: String(value.summarySentence),
          indicatorFindings,
          integratedConclusion: String(value.integratedConclusion),
          operatorImplication: String(value.operatorImplication),
          uncertainty: String(value.uncertainty),
          evidenceRefs,
        },
      }
    : { ok: false, reasons };
}

export function validateTwinSituationDraft(value: unknown): { ok: true; draft: TwinSituationDraft } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!isRecord(value)) return { ok: false, reasons: ['孪生态势输出非对象'] };
  for (const [key, max] of Object.entries({ headline: 60, commandConclusion: 120, eventOverview: 180, confidenceNote: 160 })) {
    if (!isNonEmptyString(value[key], max)) reasons.push(`${key} 缺失或过长`);
  }
  const trafficImpact = value.trafficImpact;
  if (!isRecord(trafficImpact)) {
    reasons.push('trafficImpact 缺失或非对象');
  } else {
    for (const [key, max] of Object.entries({ upstream: 120, incidentPoint: 120, downstream: 120 })) {
      if (!isNonEmptyString(trafficImpact[key], max)) reasons.push(`trafficImpact.${key} 缺失或过长`);
    }
    if (!['畅通', '轻度拥堵', '中度拥堵', '重度拥堵', '待判定'].includes(String(trafficImpact.overallLevel))) reasons.push('trafficImpact.overallLevel 非法');
  }
  const responseProgress = value.responseProgress;
  if (!Array.isArray(responseProgress) || responseProgress.length > 3 || !responseProgress.every((item) => isRecord(item)
    && isNonEmptyString(item.measure, 50)
    && isNonEmptyString(item.status, 20)
    && isNonEmptyString(item.detail, 120))) reasons.push('responseProgress 非法');
  const risks = value.risks;
  if (!Array.isArray(risks) || risks.length > 3 || !risks.every((item) => isRecord(item)
    && ['高', '中', '低'].includes(String(item.level))
    && isNonEmptyString(item.content, 120))) reasons.push('risks 非法');
  const nextFocus = value.nextFocus;
  if (!Array.isArray(nextFocus) || nextFocus.length > 3 || !nextFocus.every((item) => isRecord(item)
    && isNonEmptyString(item.timeWindow, 30)
    && isNonEmptyString(item.action, 100)
    && isNonEmptyString(item.trigger, 100))) reasons.push('nextFocus 非法');
  return reasons.length === 0
    ? {
        ok: true,
        draft: {
          headline: String(value.headline),
          commandConclusion: String(value.commandConclusion),
          eventOverview: String(value.eventOverview),
          trafficImpact: {
            upstream: String((trafficImpact as Record<string, unknown>).upstream),
            incidentPoint: String((trafficImpact as Record<string, unknown>).incidentPoint),
            downstream: String((trafficImpact as Record<string, unknown>).downstream),
            overallLevel: String((trafficImpact as Record<string, unknown>).overallLevel) as TwinSituationDraft['trafficImpact']['overallLevel'],
          },
          responseProgress: (responseProgress as Record<string, unknown>[]).map((item) => ({ measure: String(item.measure), status: String(item.status), detail: String(item.detail) })),
          risks: (risks as Record<string, unknown>[]).map((item) => ({ level: String(item.level) as '高' | '中' | '低', content: String(item.content) })),
          nextFocus: (nextFocus as Record<string, unknown>[]).map((item) => ({ timeWindow: String(item.timeWindow), action: String(item.action), trigger: String(item.trigger) })),
          confidenceNote: String(value.confidenceNote),
        },
      }
    : { ok: false, reasons };
}

export function buildStructuredEventPrompt(rawReport: string): string {
  return JSON.stringify({
    task: '将高速公路事件接报文本结构化为运行工作台字段。只返回 JSON。',
    outputSchema: {
      sourceKind: '来源，如 12122 电话报警/雷视融合/人工巡查/CAM 视频检测',
      road: ROAD_IDS,
      accidentKp: '数字桩号，不带 K',
      typeNodeId: EVENT_TYPE_IDS,
      label: '简短事件标题',
      lanesTotal: '总车道数',
      lanesClosed: '占用车道数',
      q: '断面流量 veh/h；未知时按道路常见值保守估计',
      vf: '自由流速度，可省略',
      casualties: '伤亡人数，可省略',
      hazmat: '是否危化品，可省略',
      vehicles: '涉事车辆数，可省略',
      direction: EVENT_DIRECTIONS,
      confidence: ['高', '中', '低'],
      normalizedText: '一句话复述接报内容',
      missingFields: '无法从文本确认但会影响处置的字段',
    },
    hardRules: [
      'road 必须来自白名单',
      'typeNodeId 必须来自白名单',
      '未明确方向时 direction 返回 unknown',
      '不要编造电话号码、车牌、人员姓名',
    ],
    rawReport,
  });
}

function stepNodeIds(step: TraceStep): string[] {
  return Array.from(new Set([
    ...tracePathForStep(step).map((node) => node.id),
    ...(step.edges ?? []).flatMap((edge) => [edge.from, edge.to]),
  ].filter(Boolean)));
}

function calcLevel(record: CalcRecord): TrafficFlowCalcFinding['level'] {
  return record.conclusionTone ?? 'info';
}

function compactText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => compactText(item)).filter(Boolean).join('、');
  if (isRecord(value)) {
    for (const key of ['label', 'name', 'text', 'title', 'id', 'nodeLabel']) {
      const text = compactText(value[key]);
      if (text) return text;
    }
    return Object.values(value).map((item) => compactText(item)).filter(Boolean).slice(0, 3).join('、');
  }
  return fallback;
}

function truncateText(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function firstAllowedNodeRef(allowedNodeIds: string[]): GraphReasoningAiStep['evidenceRefs'][number] | undefined {
  const id = allowedNodeIds[0];
  return id ? { type: 'node', id, label: id } : undefined;
}

export function buildGraphReasoningPrompt(event: SimEvent, steps: TraceStep[], calcs: CalcRecord[]): string {
  return JSON.stringify({
    task: '用中文解释当前单步事理图谱为什么顺成推导。只输出 JSON，不输出 Markdown。',
    outputShape: 'steps:[{stepId,title,chainExplanation,nodeStatements,conclusionStatement,confidence,operatorFocus,evidenceRefs,limits}]',
    rules: [
      'title 固定为 因果顺成推演结论',
      'nodeStatements 只引用 allowedNodeIds 中的节点，最多 4 个',
      '只解释图谱链路，不解释交通流公式或指标综合判断',
      'limits 必须包含“交通流”二字',
    ],
    input: {
      event: {
        id: event.id,
        road: event.road,
        accidentKp: event.accidentKp,
        label: event.label,
        severity: event.severity,
      },
      steps: steps.map((step) => ({
        id: step.id,
        phase: step.phase,
        title: step.title,
        conclusion: step.conclusion,
        tracePath: tracePathForStep(step),
        edges: (step.edges ?? []).slice(0, 12),
        allowedNodeIds: stepNodeIds(step),
        ruleFacts: [
          step.conclusion,
          ...calcs.filter((calc) => (step.calcs ?? []).includes(calc.id)).map((calc) => calc.conclusion).filter(Boolean).slice(0, 2),
        ],
      })),
    },
  });
}

export function buildTrafficFlowCalcPrompt(event: SimEvent, calcs: CalcRecord[]): string {
  return JSON.stringify({
    task: '按照“交通流计算过程与结论解读 Skill”，合并大模型解读和规则计算结论，只解释当前事件的交通流计算过程与综合结论。只返回 JSON。',
    outputSchema: {
      title: '固定为 交通流计算综合解读',
      summarySentence: '一句话说清当前交通流状态',
      indicatorFindings: [{
        calcId: '必须来自 input.allowedCalcIds',
        metric: '指标名称，如瓶颈通行能力/行驶密度/排队密度/排队回溯速度',
        value: '保留原单位的指标值',
        plainMeaning: '这个数值对现场处置意味着什么',
        level: ['info', 'success', 'warning', 'danger'],
      }],
      integratedConclusion: '综合已提供指标判断是否拥堵、是否有外溢风险、处置优先级是什么',
      operatorImplication: '值班员下一步应关注什么',
      uncertainty: '说明只基于当前事件已计算指标',
      evidenceRefs: '引用当前事件计算记录',
    },
    hardRules: [
      '只使用 input.event 和 input.calcRecords，不解释事理图谱推理链',
      '禁止展示或引用其他事件的计算记录',
      '禁止编造未传入的指标值',
      '禁止只复述公式，必须给出普通人能理解的含义和处置影响',
      '已有 result 时不得说未计算',
      '不得改变单位或把 veh/h、veh/km、km/h 混用',
    ],
    input: {
      event: {
        id: event.id,
        road: event.road,
        accidentKp: event.accidentKp,
        label: event.label,
        lanesTotal: event.lanesTotal,
        lanesClosed: event.lanesClosed,
        q: event.q,
        severity: event.severity,
      },
      allowedCalcIds: calcs.map((calc) => calc.id),
      indicatorOrder: ['capacity', 'drivingDensity', 'queueDensity', 'spillbackSpeed', 'queueLength', 'arrivalTime'],
      calcRecords: calcs.map((calc) => ({
        id: calc.id,
        label: calc.label,
        formula: calc.formula,
        substitution: calc.substitution,
        result: calc.result,
        conclusion: calc.conclusion,
        summaryRole: calc.summaryRole,
        summaryValue: calc.summaryValue,
        conclusionTone: calc.conclusionTone,
        level: calcLevel(calc),
      })),
    },
  });
}

export function buildComprehensiveConclusionPrompt(event: SimEvent, steps: TraceStep[], calcs: CalcRecord[]): string {
  return JSON.stringify({
    task: '根据当前事件已经完成的事理图谱推理和交通流规则计算，生成一条面向值班员的综合研判结论。只返回 JSON，不返回 Markdown。',
    outputSchema: {
      title: '固定为交通事件综合研判结论',
      summarySentence: '一句话说明事件因果链与交通流状态的关系',
      graphReasoning: {
        stepId: '必须来自 input.allowedStepIds',
        title: '固定为因果顺成推演结论',
        chainExplanation: '用通俗语言解释本次推理链如何从事件节点走到影响节点',
        nodeStatements: [{ nodeId: '必须来自 input.allowedNodeIds', nodeLabel: '节点名称', plainLanguage: '该节点对推理的含义', roleInChain: '起因/影响/处置依据' }],
        conclusionStatement: '对图谱推理链的结论声明',
        confidence: '高/中/低',
        operatorFocus: ['值班员需要复核的重点'],
        evidenceRefs: [{ type: 'node', id: '必须来自输入', label: '证据名称' }],
        limits: '说明图谱解释与交通流指标分别承担什么作用',
      },
      trafficFlow: {
        title: '固定为交通流计算综合解读',
        summarySentence: '一句话说明本次交通流状态',
        indicatorFindings: [{ calcId: '必须来自 input.allowedCalcIds', metric: '指标名称', value: '保留原单位的指标值', plainMeaning: '这个指标对现场处置的含义', level: 'info/warning/danger/success' }],
        integratedConclusion: '综合瓶颈通行能力、行驶密度、排队密度、回溯速度等指标后的结论',
        operatorImplication: '值班员下一步应关注什么',
        uncertainty: '说明只基于本次事件已计算指标',
        evidenceRefs: [{ type: 'calc', id: '必须来自 input.allowedCalcIds', label: '计算记录名称' }],
      },
      integratedConclusion: '把图谱因果链和交通流指标合并成一条最终结论，不重复抄写两个子结论',
      operatorImplication: '面向现场处置的下一步建议',
      confidence: '高/中/低',
      uncertainty: '数据边界和人工复核提示',
      evidenceRefs: '引用输入中的节点、步骤和计算记录',
    },
    hardRules: [
      '图谱只解释因果链，交通流只解释本次事件的计算记录，最终结论必须把两者关联起来',
      '只允许使用 input 中的事件、步骤、节点和计算值，禁止编造数字、桩号或资源',
      '已经有 result 的指标不得写成未计算，必须保留 veh/h、veh/km、km/h 等原单位',
      '不能把图谱推理结论和交通流结论分别重复输出，必须形成一条综合判断',
    ],
    input: {
      event: {
        id: event.id,
        road: event.road,
        accidentKp: event.accidentKp,
        label: event.label,
        lanesTotal: event.lanesTotal,
        lanesClosed: event.lanesClosed,
        q: event.q,
        severity: event.severity,
      },
      allowedStepIds: steps.map((step) => step.id),
      allowedNodeIds: Array.from(new Set(steps.flatMap(stepNodeIds))),
      steps: steps.map((step) => ({
        id: step.id,
        phase: step.phase,
        title: step.title,
        conclusion: step.conclusion,
        tracePath: tracePathForStep(step),
        edges: (step.edges ?? []).slice(0, 12),
      })),
      allowedCalcIds: calcs.map((calc) => calc.id),
      calcRecords: calcs.map((calc) => ({
        id: calc.id,
        label: calc.label,
        formula: calc.formula,
        substitution: calc.substitution,
        result: calc.result,
        conclusion: calc.conclusion,
        summaryRole: calc.summaryRole,
        summaryValue: calc.summaryValue,
        conclusionTone: calc.conclusionTone,
      })),
    },
  });
}

function comprehensiveString(value: unknown, fallback: string, max: number): string {
  return truncateText(compactText(value, fallback), max);
}

export function validateComprehensiveConclusionDraft(
  value: unknown,
  steps: TraceStep[],
  calcs: CalcRecord[],
): { ok: true; draft: ComprehensiveConclusionDraft } | { ok: false; reasons: string[] } {
  if (!isRecord(value)) return { ok: false, reasons: ['综合研判输出非对象'] };
  const allowedStepIds = steps.map((step) => step.id);
  const allowedNodeIds = Array.from(new Set(steps.flatMap(stepNodeIds)));
  const graphRaw = isRecord(value.graphReasoning) ? value.graphReasoning : value.graph;
  const graphResult = validateGraphReasoningDraft({ steps: [graphRaw] }, allowedStepIds, allowedNodeIds);
  if (!graphResult.ok) return { ok: false, reasons: graphResult.reasons.map((reason) => `图谱：${reason}`) };
  const trafficRaw = isRecord(value.trafficFlow) ? value.trafficFlow : value.calcInterpretation;
  const trafficResult = validateTrafficFlowCalcDraft(trafficRaw, calcs);
  if (!trafficResult.ok) return { ok: false, reasons: trafficResult.reasons.map((reason) => `交通流：${reason}`) };
  const reasons: string[] = [];
  if (!isNonEmptyString(value.summarySentence, 220)) reasons.push('summarySentence 缺失或过长');
  if (!isNonEmptyString(value.integratedConclusion, 260)) reasons.push('integratedConclusion 缺失或过长');
  if (!isNonEmptyString(value.operatorImplication, 180)) reasons.push('operatorImplication 缺失或过长');
  if (!isNonEmptyString(value.uncertainty, 140)) reasons.push('uncertainty 缺失或过长');
  const confidence = ['高', '中', '低'].includes(String(value.confidence)) ? value.confidence as ComprehensiveConclusionDraft['confidence'] : '中';
  const refs = Array.isArray(value.evidenceRefs)
    ? value.evidenceRefs.filter(isRecord).map((ref) => ({
        type: ['node', 'edge', 'step', 'calc'].includes(String(ref.type)) ? String(ref.type) as ComprehensiveConclusionDraft['evidenceRefs'][number]['type'] : 'step',
        id: String(ref.id ?? ''),
        label: comprehensiveString(ref.label ?? ref.name ?? ref.id, String(ref.id ?? ''), 60),
      })).filter((ref) => (
        (ref.type === 'calc' ? calcs.some((calc) => calc.id === ref.id) : ref.type === 'step' ? allowedStepIds.includes(ref.id) : ref.type === 'node' ? allowedNodeIds.includes(ref.id) : true)
      ))
    : [];
  if (refs.length === 0) refs.push(...graphResult.draft.steps[0].evidenceRefs, ...trafficResult.draft.evidenceRefs);
  return reasons.length === 0
    ? {
        ok: true,
        draft: {
          title: '交通事件综合研判结论',
          summarySentence: String(value.summarySentence),
          graphReasoning: graphResult.draft.steps[0],
          trafficFlow: trafficResult.draft,
          integratedConclusion: String(value.integratedConclusion),
          operatorImplication: String(value.operatorImplication),
          confidence,
          uncertainty: String(value.uncertainty),
          evidenceRefs: refs,
        },
      }
    : { ok: false, reasons };
}

export function buildTwinSituationPrompt(
  event: SimEvent,
  traffic: RadarFusionTraffic,
  simSec: number,
  context: TwinSituationContext,
): string {
  const counts = traffic.vehicles.reduce<Record<string, number>>((acc, vehicle) => {
    acc[vehicle.status] = (acc[vehicle.status] ?? 0) + 1;
    return acc;
  }, {});
  const speeds = traffic.vehicles.map((vehicle) => vehicle.speedKmh).filter((speed) => Number.isFinite(speed));
  const avgSpeed = speeds.length > 0 ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : 0;
  const plan = context.plans
    .filter((item) => item.id === `PLAN-${event.id}` && !['已被替换', '已作废'].includes(item.state))
    .sort((a, b) => b.version - a.version)[0];
  const response = resolveTrafficResponse(event, context.plans, simSec);
  const monitor = resolveTrafficMonitorReading(event, context.plans, simSec, context.activeDemoTwin);
  const gantry = resolveGantryTrafficReading(event, context.plans, simSec, context.activeDemoTwin);
  const tunnel = tunnelAt(event.road, event.accidentKp);
  const fogBand = context.environment.fogBands.find((band) => band.road === event.road
    && band.toKp >= event.accidentKp - 10 && band.fromKp <= event.accidentKp + 2);
  const measures = plan?.measures.slice(0, 8).map((measure) => {
    const resource = measure.resource ? resourceById(measure.resource.id) : undefined;
    return {
      measureId: measure.measureId,
      title: measure.title,
      summary: measure.summary,
      status: measure.runState,
      resource: measure.resource ? {
        id: measure.resource.id,
        label: resource?.label ?? measure.resource.id,
        etaMinutes: measure.resource.etaMin,
      } : undefined,
    };
  }) ?? [];
  return JSON.stringify({
    task: '生成面向高速公路路网指挥员的事件实时态势简报。先给指挥结论，再说明事件、交通影响、处置、风险和下一步关注。只返回 JSON。',
    outputSchema: {
      headline: '不超过60字：位置、类型和总体态势',
      commandConclusion: '不超过120字：是否可控、最需要指挥员关注的结论',
      eventOverview: '不超过180字：位置、方向、类型、车道影响和核实状态',
      trafficImpact: {
        upstream: '不超过120字：上游门架能力、队尾和趋势，区分事实/预测',
        incidentPoint: '不超过120字：事故点剩余车道、瓶颈能力和通行状态',
        downstream: '不超过120字：下游门架能力和回堵情况',
        overallLevel: ['畅通', '轻度拥堵', '中度拥堵', '重度拥堵', '待判定'],
      },
      responseProgress: [{ measure: '措施或资源名称', status: '待确认/已确认/已下发/自动执行/已完成/在途/已到场/受阻', detail: '仅使用输入提供的执行状态、资源和 ETA' }],
      risks: [{ level: ['高', '中', '低'], content: '风险、触发条件和注意事项' }],
      nextFocus: [{ timeWindow: '10分钟内/15分钟内/持续监测', action: '需确认或决策事项', trigger: '量化触发条件；缺失时写待核实' }],
      confidenceNote: '明确哪些是接报事实、动态演示数据、雷视融合仿真或模型预测，并提醒人工复核',
    },
    hardRules: [
      '首句和 commandConclusion 必须优先给出总体态势和指挥结论，不要先罗列数据',
      '只能使用 input 中的事实、模型结果和资源信息；缺失时写待核实或暂无数据',
      '不得编造伤亡、危化品、人员、车辆、资源、ETA、措施状态或电话号码',
      '仅当 input.response.measures 中存在 etaMinutes 时才能写预计到位时间',
      '不得把动态演示门架数据、雷视融合仿真或模型预测描述为生产实测',
      '必须区分已接报事实、模型/仿真判断和趋势预测',
      'responseProgress、risks、nextFocus 最多各 3 项',
    ],
    input: {
      simSec,
      event: {
        id: event.id,
        road: event.road,
        accidentKp: event.accidentKp,
        label: event.label,
        lanesTotal: event.lanesTotal,
        lanesClosed: event.lanesClosed,
        q: event.q,
        w: event.w,
        severity: event.severity,
        sourceKind: event.sourceKind ?? '来源待核实',
        verificationStatus: '系统接报，待现场复核',
        direction: event.direction ?? 'unknown',
        casualties: event.casualties ?? '待核实',
        hazmat: event.hazmat == null ? '待核实' : event.hazmat,
      },
      traffic: {
        incidentCapacityVehPerHour: monitor.capacityVehPerHour,
        queueTailKp: Number(response.queueTailKp.toFixed(2)),
        queueLengthKm: Number(response.queueLengthKm.toFixed(2)),
        queueTrend: response.stage,
        upstreamGantry: gantry.upstream && gantry.upstreamPoint ? {
          name: gantry.upstream.gantry.label,
          searchRadiusKm: gantry.upstream.searchRadiusKm,
          normalCapacityVehPerHour: gantry.upstreamPoint.normalCapacityVehPerHour,
          realtimeCapacityVehPerHour: gantry.upstreamPoint.realtimeCapacityVehPerHour,
          retentionRate: gantry.upstreamPoint.retentionRate,
        } : '暂无数据',
        downstreamGantry: gantry.downstream && gantry.downstreamPoint ? {
          name: gantry.downstream.gantry.label,
          searchRadiusKm: gantry.downstream.searchRadiusKm,
          normalCapacityVehPerHour: gantry.downstreamPoint.normalCapacityVehPerHour,
          realtimeCapacityVehPerHour: gantry.downstreamPoint.realtimeCapacityVehPerHour,
          retentionRate: gantry.downstreamPoint.retentionRate,
        } : '暂无数据',
        overallCongestionLevel: gantry.congestionLevel ?? '待判定',
        vehicleCount: traffic.vehicles.length,
        statusCounts: counts,
        averageSpeedKmh: Number(avgSpeed.toFixed(1)),
        coverage: traffic.coverage.map((coverage) => coverage.label),
        laneCount: traffic.lanes.length,
        incidentTargets: traffic.vehicles.filter((vehicle) => vehicle.status === 'incident').map((vehicle) => ({
          id: vehicle.id,
          kp: Number(vehicle.kp.toFixed(2)),
          lane: vehicle.lane,
          kind: vehicle.kind,
        })),
      },
      response: {
        planVersion: plan?.version ?? '暂无有效预案',
        responsible: plan?.responsible ?? '待确认',
        measures,
      },
      riskContext: {
        tunnel: tunnel ? `${tunnel.id} K${tunnel.fromKp}–K${tunnel.toKp}` : '无',
        fogBand: fogBand ? `${event.road} K${fogBand.fromKp}–K${fogBand.toKp}` : '无',
        queueTailPrediction: response.queueLengthKm > 0 ? `当前模型队尾 K${response.queueTailKp.toFixed(2)}` : '当前未形成模型排队',
        secondaryAccidentRisk: gantry.minRetentionRate != null && gantry.minRetentionRate < 0.7
          ? '上游能力保持率低于70%，存在后方减速和二次事故风险，属模型判断'
          : '暂未达到模型二次事故风险阈值',
      },
      dataSources: {
        reportedFacts: ['事件接报字段、预案措施及其执行状态'],
        modelOrSimulation: ['事故点交通流模型、雷视融合仿真、队尾趋势预测'],
        demoData: ['上下游门架正常/实时能力为动态演示数据'],
      },
    },
  });
}

export type LlmOutcome =
  | { status: 'ok'; draft: LlmDraft }
  | { status: 'rejected'; reasons: string[] }
  | { status: 'unavailable'; reason: string };

/**
 * 调用 LLM 生成预案文案并做双重校验。任何失败（网络/超时/schema/值级）均返回非 ok，
 * 由调用方回退模板文案并写审计流。
 */
export async function generatePlanNarrative(
  config: LlmConfig,
  prompt: string,
  facts: EngineFacts,
): Promise<LlmOutcome> {
  const result = await requestJsonObject(config, '你是路网处置预案文案助手。只输出 JSON，字段 summary/measureNotes/riskNote。关键数值必须来自输入，不得杜撰。', prompt);
  if (result.status !== 'ok') return result;
  const schema = validateDraftSchema(result.value);
  if (!schema.ok) return { status: 'rejected', reasons: schema.reasons };
  const draft = result.value as LlmDraft;
  const sourcing = verifyValueSourcing(draft, facts);
  if (!sourcing.ok) return { status: 'rejected', reasons: sourcing.reasons };
  return { status: 'ok', draft };
}

export async function generateStructuredEventReport(config: LlmConfig, rawReport: string): Promise<StructuredEventOutcome> {
  const result = await requestJsonObject(
    config,
    '你是高速公路事件接报结构化助手。只输出合法 JSON，不输出 Markdown。无法确认的字段要标入 missingFields，不得编造车牌、人员、电话。',
    buildStructuredEventPrompt(rawReport),
  );
  if (result.status !== 'ok') return result;
  const schema = validateStructuredEventDraft(result.value);
  return schema.ok ? { status: 'ok', draft: schema.draft } : { status: 'rejected', reasons: schema.reasons };
}

export async function generateGraphReasoningExplanation(
  config: LlmConfig,
  event: SimEvent,
  steps: TraceStep[],
  calcs: CalcRecord[],
): Promise<GraphReasoningOutcome> {
  const result = await requestJsonObject(
    config,
    '你是路网事理图谱推理解释助手。只解释输入中的单步图谱链路，不讲交通流计算。只输出合法 JSON。',
    buildGraphReasoningPrompt(event, steps, calcs),
    { maxTokens: 520, timeoutMs: 45000 },
  );
  if (result.status !== 'ok') return result;
  const schema = validateGraphReasoningDraft(
    result.value,
    steps.map((step) => step.id),
    Array.from(new Set(steps.flatMap(stepNodeIds))),
  );
  return schema.ok ? { status: 'ok', draft: schema.draft } : { status: 'rejected', reasons: schema.reasons };
}

export async function generateTrafficFlowCalcInterpretation(
  config: LlmConfig,
  event: SimEvent,
  calcs: CalcRecord[],
): Promise<TrafficFlowCalcOutcome> {
  const result = await requestJsonObject(
    config,
    '你是高速公路交通流计算解读助手。你的任务是把当前事件的计算记录解释成值班员能理解的业务结论。你只能使用输入中的 event 和 calcRecords。你需要综合瓶颈通行能力、行驶密度、排队密度、排队回溯速度、排队长度等已提供指标，说明它们对拥堵、队尾外溢和处置优先级的含义。你不解释事理图谱推理链，不输出图谱推理结论。只输出合法 JSON。',
    buildTrafficFlowCalcPrompt(event, calcs),
  );
  if (result.status !== 'ok') return result;
  const schema = validateTrafficFlowCalcDraft(result.value, calcs);
  return schema.ok ? { status: 'ok', draft: schema.draft } : { status: 'rejected', reasons: schema.reasons };
}

export async function generateComprehensiveConclusion(
  config: LlmConfig,
  event: SimEvent,
  steps: TraceStep[],
  calcs: CalcRecord[],
): Promise<ComprehensiveConclusionOutcome> {
  const result = await requestJsonObject(
    config,
    '你是高速公路事件综合研判助手。请把事理图谱因果链和本次事件交通流计算结果合并解释，最终只输出一条面向值班员的综合结论。只输出合法 JSON。',
    buildComprehensiveConclusionPrompt(event, steps, calcs),
    { maxTokens: 1100, timeoutMs: 60000 },
  );
  if (result.status !== 'ok') return result;
  const schema = validateComprehensiveConclusionDraft(result.value, steps, calcs);
  return schema.ok ? { status: 'ok', draft: schema.draft } : { status: 'rejected', reasons: schema.reasons };
}

/**
 * 外部大模型不可用时的确定性兜底简报。它只消费现有事件、交通模型和处置状态，
 * 与 AI 生成结果使用同一份数据结构，因此可以继续按时间片保存和回看。
 */
export function buildLocalTwinSituationNarrative(
  event: SimEvent,
  traffic: RadarFusionTraffic,
  simSec: number,
  context: TwinSituationContext,
): TwinSituationDraft {
  const plan = context.plans
    .filter((item) => item.id === `PLAN-${event.id}`)
    .sort((a, b) => b.version - a.version)[0];
  const response = resolveTrafficResponse(event, context.plans, simSec);
  const monitor = resolveTrafficMonitorReading(event, context.plans, simSec, context.activeDemoTwin);
  const gantry = resolveGantryTrafficReading(event, context.plans, simSec, context.activeDemoTwin);
  const overallLevel: TwinSituationDraft['trafficImpact']['overallLevel'] = gantry.congestionLevel
    ?? (event.congested ? '中度拥堵' : '畅通');
  const issuedMeasures = plan?.measures
    .filter((measure) => ['已下发', '自动执行', '已完成'].includes(measure.runState))
    .slice(0, 3) ?? [];
  const availableLanes = Math.max(0, event.lanesTotal - event.lanesClosed);
  const queueNote = event.congested
    ? `模型队尾 K${response.queueTailKp.toFixed(1)}，队列约 ${response.queueLengthKm.toFixed(1)}km。`
    : '当前模型未识别持续排队，保持监测。';
  const gantryNote = (label: string, point: { realtimeCapacityVehPerHour: number; retentionRate: number } | null) => point
    ? `${label} ${point.realtimeCapacityVehPerHour} veh/h，保持率 ${(point.retentionRate * 100).toFixed(0)}%。`
    : '暂无同向门架数据。';

  return {
    headline: `${event.road} K${event.accidentKp} ${event.label}`,
    commandConclusion: event.congested
      ? `当前${overallLevel}，优先管控上游队尾并核实现场。`
      : '当前交通总体可控，保持现场和设备状态核实。',
    eventOverview: `系统接报 ${event.road} K${event.accidentKp} 发生${event.label}，当前占用 ${event.lanesClosed}/${event.lanesTotal} 条车道；现场信息待人工复核。`,
    trafficImpact: {
      upstream: gantryNote(gantry.upstream?.gantry.label ?? '上游门架', gantry.upstreamPoint),
      incidentPoint: `可用 ${availableLanes} 条车道，模型能力 ${monitor.capacityVehPerHour} veh/h。`,
      downstream: gantryNote(gantry.downstream?.gantry.label ?? '下游门架', gantry.downstreamPoint),
      overallLevel,
    },
    responseProgress: issuedMeasures.length > 0
      ? issuedMeasures.map((measure) => ({
        measure: measure.title,
        status: measure.runState,
        detail: measure.summary,
      }))
      : [{
        measure: '统一处置时序',
        status: '待确认',
        detail: '尚无已下发措施，待指挥员确认后执行。',
      }],
    risks: [{
      level: event.congested ? '中' : '低',
      content: `${queueNote} 雷视融合仿真目标 ${traffic.vehicles.length} 个，仅用于动态演示。`,
    }],
    nextFocus: [{
      timeWindow: '持续监测',
      action: '核实现场占道、上游队尾及关联设备状态。',
      trigger: '队尾继续上游回溯、通行能力下降或设备状态异常。',
    }],
    confidenceNote: '本地规则简报：基于模拟事件、交通模型、门架读数和已确认处置状态生成，不替代现场实况与人工复核。',
  };
}

export async function generateTwinSituationNarrative(
  config: LlmConfig,
  event: SimEvent,
  traffic: RadarFusionTraffic,
  simSec: number,
  context: TwinSituationContext,
): Promise<TwinSituationOutcome> {
  const result = await requestJsonObject(
    config,
    '你是高速公路路网运行指挥中心的事件实时态势简报助手。面向值班指挥员，输出完整事件态势而非单一雷视数据解读。只输出合法 JSON；必须区分接报事实、动态演示数据、雷视融合仿真和模型预测。',
    buildTwinSituationPrompt(event, traffic, simSec, context),
    { maxTokens: 1200 },
  );
  if (result.status !== 'ok') return result;
  const schema = validateTwinSituationDraft(result.value);
  return schema.ok ? { status: 'ok', draft: schema.draft } : { status: 'rejected', reasons: schema.reasons };
}
