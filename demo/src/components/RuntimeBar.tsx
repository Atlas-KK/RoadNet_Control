import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { SIMULATED_ROADS } from '../gis/xiAnRing';
import type { RoadId } from '../data/network';
import { buildDataset, toJsonl } from '../engine/datasetBuilder';
import {
  generateStructuredEventReport,
  getLlmProviderLabel,
  getLlmProviderPreset,
  hasEnvLlmApiKey,
  LLM_MODEL_OPTIONS,
  loadLlmConfig,
  readConfiguredLlmApiKey,
  saveLlmConfig,
  type LlmConfig,
  type LlmProvider,
} from '../services/llm';
import { normalizeRuntimeEventInput } from './runtimeEventForm';

const EVENT_TYPES = [
  { id: 'E_追尾', label: '追尾事故' },
  { id: 'E_侧翻', label: '货车侧翻' },
  { id: 'E_抛锚', label: '车辆抛锚' },
  { id: 'E_危化泄漏', label: '危化品泄漏(疑似)' },
];
const SOURCES = ['CAM 视频检出', '12122 电话报警', '雷视融合', '人工巡查'];
const ROADS: RoadId[] = ['G65', 'G65S', 'G56', 'S204'];
const ROAD_DEFAULTS: Record<RoadId, { q: number; lanes: number }> = {
  G65: { q: 4300, lanes: 3 },
  G65S: { q: 3600, lanes: 3 },
  G56: { q: 3300, lanes: 2 },
  S204: { q: 1500, lanes: 2 },
};

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EventEntryForm({ onClose }: { onClose: () => void }) {
  const ingestEvent = useStore((s) => s.ingestEvent);
  const [road, setRoad] = useState<RoadId>('G65');
  const [kp, setKp] = useState('1190');
  const [typeNodeId, setType] = useState('E_追尾');
  const [sourceKind, setSource] = useState(SOURCES[0]);
  const [lanesTotal, setLanesTotal] = useState(3);
  const [lanesClosed, setLanesClosed] = useState(2);
  const [q, setQ] = useState('4300');
  const [casualties, setCasualties] = useState('');
  const [hazmat, setHazmat] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down' | 'unknown'>('up');
  const [error, setError] = useState('');
  const [rawReport, setRawReport] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiHint, setAiHint] = useState('');

  const applyRoad = (r: RoadId) => {
    setRoad(r);
    setQ(String(ROAD_DEFAULTS[r].q));
    setLanesTotal(ROAD_DEFAULTS[r].lanes);
    setKp(String(SIMULATED_ROADS[r].fromKp + (SIMULATED_ROADS[r].toKp - SIMULATED_ROADS[r].fromKp) / 2));
  };

  const parseRawReport = async () => {
    const text = rawReport.trim();
    if (!text) {
      setError('请先粘贴或输入原始接报内容');
      return;
    }
    setAiBusy(true);
    setError('');
    setAiHint('');
    const result = await generateStructuredEventReport(loadLlmConfig(), text);
    setAiBusy(false);
    if (result.status === 'ok') {
      const draft = result.draft;
      setSource(SOURCES.includes(draft.sourceKind) ? draft.sourceKind : '人工巡查');
      setRoad(draft.road);
      setKp(String(draft.accidentKp));
      setType(draft.typeNodeId);
      setLanesTotal(draft.lanesTotal);
      setLanesClosed(draft.lanesClosed);
      setQ(String(draft.q));
      setCasualties(draft.casualties == null ? '' : String(draft.casualties));
      setHazmat(Boolean(draft.hazmat));
      setDirection(draft.direction ?? 'unknown');
      setAiHint(`AI已结构化：${draft.normalizedText}（置信度：${draft.confidence}${draft.missingFields.length > 0 ? `；待核字段：${draft.missingFields.join('、')}` : ''}）`);
      return;
    }
    const message = result.status === 'rejected' ? result.reasons.join('；') : result.reason;
    setError(`AI结构化未完成：${message}`);
  };

  const submit = () => {
    const typeLabel = EVENT_TYPES.find((t) => t.id === typeNodeId)?.label ?? '事件';
    const normalized = normalizeRuntimeEventInput({
      sourceKind,
      road,
      kp,
      typeNodeId,
      typeLabel,
      lanesTotal,
      lanesClosed,
      q,
      casualties,
      hazmat,
      direction,
    });
    if (!normalized.ok) {
      setError(normalized.error);
      return;
    }
    try {
      ingestEvent(normalized.input);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '事件接入失败');
    }
  };

  const field = 'rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs text-[var(--color-ink)] hover:border-[var(--color-brand)] focus:border-[var(--color-brand)]';
  return (
    <Modal title="事件上报" onClose={onClose} testId="event-entry">
      <div className="mb-2 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold text-[var(--color-ink)]">原始接报结构化</span>
          <button
            type="button"
            onClick={parseRawReport}
            disabled={aiBusy}
            className="rounded bg-[var(--color-brand)] px-2 py-0.5 text-[10px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiBusy ? '解析中…' : 'AI解析'}
          </button>
        </div>
        <textarea
          className={`${field} min-h-16 w-full resize-none`}
          value={rawReport}
          onChange={(e) => setRawReport(e.target.value)}
          placeholder="例：12122报，G65上行K1179附近两车追尾，占用2条车道，疑似1人受伤，车流缓慢。"
        />
        {aiHint && <div className="mt-1 text-[10px] leading-snug text-[var(--color-brand-700)]">{aiHint}</div>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">来源
          <select className={field} value={sourceKind} onChange={(e) => setSource(e.target.value)}>
            {SOURCES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">事件类型
          <select className={field} value={typeNodeId} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">道路
          <select className={field} value={road} onChange={(e) => applyRoad(e.target.value as RoadId)}>
            {ROADS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">桩号 K
          <input className={field} value={kp} onChange={(e) => setKp(e.target.value)} inputMode="decimal" />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">总车道
          <input className={field} type="number" value={lanesTotal} onChange={(e) => setLanesTotal(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">占用车道
          <input className={field} type="number" value={lanesClosed} onChange={(e) => setLanesClosed(Number(e.target.value))} />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">断面流量 q (veh/h)
          <input className={field} value={q} onChange={(e) => setQ(e.target.value)} inputMode="numeric" />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">伤亡人数
          <input className={field} value={casualties} onChange={(e) => setCasualties(e.target.value)} inputMode="numeric" placeholder="可空" />
        </label>
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">方向
          <select className={field} value={direction} onChange={(e) => setDirection(e.target.value as 'up' | 'down' | 'unknown')}>
            <option value="up">上行</option>
            <option value="down">下行</option>
            <option value="unknown">未知</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-[var(--color-ink)] self-end pb-1">
          <input type="checkbox" checked={hazmat} onChange={(e) => setHazmat(e.target.checked)} />危化品
        </label>
      </div>
      {error && <div className="arco-alert arco-alert-error mt-2 text-[11px]" role="alert">{error}</div>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] text-[var(--color-ink)] hover:border-[var(--color-brand)] hover:text-[var(--color-brand-700)]">取消</button>
        <button type="button" onClick={submit} data-testid="event-entry-submit" className="px-4 py-1.5 text-xs rounded bg-[var(--color-brand)] text-white shadow-[0_2px_0_rgb(0_0_0/0.05)]">接入并研判</button>
      </div>
    </Modal>
  );
}

function ConfigModal({ onClose }: { onClose: () => void }) {
  const environment = useStore((s) => s.environment);
  const setEnvironment = useStore((s) => s.setEnvironment);
  const running = useStore((s) => s.running);
  const speed = useStore((s) => s.speed);
  const toggle = useStore((s) => s.toggle);
  const setSpeed = useStore((s) => s.setSpeed);
  const reset = useStore((s) => s.reset);
  const clearRuntime = useStore((s) => s.clearRuntime);
  const persistenceAvailable = useStore((s) => s.persistenceAvailable);
  const [llm, setLlm] = useState<LlmConfig>(() => loadLlmConfig());
  const [llmError, setLlmError] = useState('');
  const fogOn = environment.fogBands.length > 0;
  const envApiKeyReady = hasEnvLlmApiKey(llm.provider);

  const saveLlm = (next: LlmConfig) => {
    setLlm(next);
    const result = saveLlmConfig(next);
    setLlmError(result.ok ? '' : result.reasons[0] ?? 'LLM 配置保存失败');
  };
  const changeProvider = (provider: LlmProvider) => {
    if (provider === 'custom') {
      saveLlm({ ...llm, provider: 'custom' });
      return;
    }
    saveLlm({
      ...llm,
      ...getLlmProviderPreset(provider),
      apiKey: readConfiguredLlmApiKey(provider) ?? '',
    });
  };

  const field = 'w-full rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1.5 text-xs hover:border-[var(--color-brand)] focus:border-[var(--color-brand)]';
  const modelOptions = llm.provider && llm.provider !== 'custom' ? LLM_MODEL_OPTIONS[llm.provider] : [];
  const modelInPreset = modelOptions.some((option) => option.value === llm.model);
  const providerOptions: Array<{ value: LlmProvider; label: string; keyReady: boolean | null }> = [
    { value: 'qwen', label: 'Qwen / 通义千问', keyReady: hasEnvLlmApiKey('qwen') },
    { value: 'deepseek', label: 'DeepSeek', keyReady: hasEnvLlmApiKey('deepseek') },
    { value: 'kimi', label: 'Kimi / Moonshot', keyReady: hasEnvLlmApiKey('kimi') },
    { value: 'custom', label: '自定义 OpenAI 兼容端点', keyReady: null },
  ];
  const keyStatusText = llm.provider === 'custom'
    ? '自定义端点请手动填写 Key'
    : envApiKeyReady ? '已读取本地 Key' : '未读取到本地 Key';
  return (
    <Modal title="系统配置" onClose={onClose} testId="config">
      <div className="text-[11px] font-semibold text-[var(--color-ink)] mb-1">可选 LLM 文案通道（OpenAI 兼容）</div>
      <div className="grid grid-cols-1 gap-1.5">
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">模型类型
          <select className={field} value={llm.provider ?? 'custom'} onChange={(e) => changeProvider(e.target.value as LlmProvider)}>
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}{option.keyReady == null ? '' : option.keyReady ? '（Key已配置）' : '（Key未配置）'}
              </option>
            ))}
          </select>
        </label>
        <span className={`text-[10px] ${envApiKeyReady || llm.provider === 'custom' ? 'text-[var(--color-ink-soft)]' : 'text-[var(--color-warn)]'}`}>
          当前：{getLlmProviderLabel(llm.provider)} · {keyStatusText}
        </span>
        <input className={field} placeholder="baseUrl，如 https://host/v1" value={llm.baseUrl} onChange={(e) => saveLlm({ ...llm, baseUrl: e.target.value, provider: 'custom' })} />
        <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-ink-soft)]">模型版本
          {llm.provider && llm.provider !== 'custom' ? (
            <select className={field} value={llm.model} onChange={(e) => saveLlm({ ...llm, model: e.target.value })}>
              {!modelInPreset && llm.model && <option value={llm.model}>{llm.model}（当前自定义）</option>}
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          ) : (
            <input className={field} placeholder="model，如 qwen-plus / deepseek-v4-flash / moonshot-v1-8k" value={llm.model} onChange={(e) => saveLlm({ ...llm, model: e.target.value, provider: llm.provider ?? 'custom' })} />
          )}
        </label>
        {!envApiKeyReady && llm.provider !== 'custom' && (
          <div className="arco-alert arco-alert-warning text-[10px] leading-snug" role="status">
            当前模型版本可以选择，但 {getLlmProviderLabel(llm.provider)} 尚未读取到本地 Key；调用大模型前请在 API KEY.txt 或下方输入框补充。
          </div>
        )}
        <input
          className={field}
          type="password"
          autoComplete="new-password"
          placeholder={envApiKeyReady ? 'apiKey（已从 .env.local 读取，可临时覆盖）' : 'apiKey（可在此临时填写，或写入 .env.local）'}
          value={llm.apiKey}
          onChange={(e) => saveLlm({ ...llm, apiKey: e.target.value })}
        />
        <div className="text-[10px] text-[var(--color-ink-soft)]">未配置时模板引擎全功能可用；启动时会从 API KEY.txt 同步 DeepSeek/Qwen/Kimi 的 Key 到 demo/.env.local，页面临时输入会优先覆盖；baseUrl 仅允许 HTTPS 或本地开发地址。</div>
        {llmError && <div className="arco-alert arco-alert-error text-[10px]" role="alert">{llmError}</div>}
      </div>
      <div className="my-2 border-t border-[var(--color-line)]" />
      <div className="text-[11px] font-semibold text-[var(--color-ink)] mb-1">环境条件</div>
      <label className="flex items-center gap-2 text-[11px] text-[var(--color-ink)]">
        <input type="checkbox" checked={fogOn} onChange={(e) => setEnvironment({ ...environment, fogBands: e.target.checked ? [{ road: 'G65', fromKp: 1170, toKp: 1180.4 }] : [] })} />
        团雾带 G65 K1170-K1180.4（影响条件求值与封道点）
      </label>
      <div className="my-2 border-t border-[var(--color-line)]" />
      <div className="text-[11px] font-semibold text-[var(--color-ink)] mb-1">运行控制</div>
      <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] p-2">
        <button type="button" onClick={toggle} className="arco-button arco-button-outline arco-button-size-mini">
          {running ? '暂停运行' : '继续运行'}
        </button>
        <div className="flex items-center gap-1" aria-label="仿真速度">
          {([1, 4, 16] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setSpeed(item)}
              className={`arco-button arco-button-size-mini ${speed === item ? 'arco-button-primary' : 'text-[var(--color-ink-soft)]'}`}
            >
              {item}x
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { if (confirm('重置运行现场？建议先导出审计和数据集。')) { reset(); onClose(); } }}
          className="arco-button arco-button-size-mini ml-auto"
        >
          重置现场
        </button>
      </div>
      <div className="my-2 border-t border-[var(--color-line)]" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-[var(--color-ink-soft)]">{persistenceAvailable ? '● 持久化可用：处置留痕' : '● 持久化不可用：本次不留痕'}</span>
        <button type="button" onClick={() => { if (confirm('清空运行库（事件/预案/审计）？建议先导出。')) { clearRuntime(); onClose(); } }} className="arco-button arco-button-danger arco-button-size-mini">清空运行库</button>
      </div>
    </Modal>
  );
}

function AuditDrawer({ onClose, onExport }: { onClose: () => void; onExport: () => void }) {
  const audit = useStore((s) => s.audit);
  return (
    <div className="fixed inset-0 z-[300] flex justify-end" data-testid="audit-drawer">
      <button type="button" aria-label="关闭审计" className="flex-1 bg-[#020812]/70" onClick={onClose} />
      <div className="w-[420px] max-w-[80vw] h-full bg-[var(--color-panel)] border-l border-[var(--color-line)] flex flex-col shadow-[0_24px_80px_rgb(0_0_0/0.45)]">
        <header className="h-12 shrink-0 px-3.5 flex items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-panel-2)]">
          <span className="text-sm font-semibold text-[var(--color-ink)]">审计留痕 · 只增不改（{audit.length}）</span>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onExport} className="text-xs text-[var(--color-brand-700)]">导出审计</button>
            <button type="button" onClick={onClose} className="text-xs text-[var(--color-ink-soft)]">关闭</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {audit.length === 0 && <div className="text-xs text-[var(--color-ink-soft)] p-2">暂无审计记录</div>}
          {[...audit].reverse().map((e) => (
            <div key={e.seq} className="rounded border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2.5 py-2">
              <div className="flex items-center justify-between text-[10px] text-[var(--color-ink-soft)]">
                <span className="text-[var(--color-brand-700)] font-medium">#{e.seq} {e.kind}</span>
                <span>{new Date(e.tsReal).toLocaleTimeString('zh-CN')}</span>
              </div>
              <div className="text-[11px] text-[var(--color-ink)]">{e.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Modal({ title, testId, onClose, children }: { title: string; testId?: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[300] grid place-items-center" data-testid={testId}>
      <button type="button" aria-label="关闭" className="absolute inset-0 bg-[#020812]/80" onClick={onClose} />
      <div className="relative w-[520px] max-w-[92vw] rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4 shadow-[0_24px_80px_rgb(0_0_0/0.55)]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[var(--color-ink)]">{title}</h3>
          <button type="button" onClick={onClose} className="text-xs text-[var(--color-ink-soft)]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function RuntimeBar() {
  const events = useStore((s) => s.events);
  const plans = useStore((s) => s.plans);
  const trace = useStore((s) => s.trace);
  const environment = useStore((s) => s.environment);
  const audit = useStore((s) => s.audit);
  const [open, setOpen] = useState<null | 'entry' | 'config' | 'audit'>(null);

  useEffect(() => {
    const openEntry = () => setOpen('entry');
    window.addEventListener('roadgov:open-event-entry', openEntry);
    return () => window.removeEventListener('roadgov:open-event-entry', openEntry);
  }, []);

  const exportDataset = () => downloadText(`roadgov-dataset-${Date.now()}.jsonl`, toJsonl(buildDataset({ events, plans, trace, environment })));
  const exportAudit = () => downloadText(`roadgov-audit-${Date.now()}.json`, JSON.stringify(audit, null, 2));

  return (
    <div className="runtime-bar flex items-center gap-1" data-testid="runtime-bar">
      <button type="button" onClick={() => setOpen('config')} className="arco-button arco-button-size-mini" title="系统设置">
        <span aria-hidden="true" className="arco-icon">⚙</span><span>设置</span>
      </button>
      <button type="button" onClick={exportDataset} className="arco-button arco-button-size-mini" title="导出训练数据集">
        <span aria-hidden="true" className="arco-icon">▣</span><span>数据集</span>
      </button>
      <button type="button" onClick={() => setOpen('audit')} className="arco-button arco-button-size-mini" title="查看或导出审计留痕">
        <span aria-hidden="true" className="arco-icon">◷</span><span>审计 {audit.length > 0 && `(${audit.length})`}</span>
      </button>
      {open === 'entry' && <EventEntryForm onClose={() => setOpen(null)} />}
      {open === 'config' && <ConfigModal onClose={() => setOpen(null)} />}
      {open === 'audit' && <AuditDrawer onClose={() => setOpen(null)} onExport={exportAudit} />}
    </div>
  );
}
