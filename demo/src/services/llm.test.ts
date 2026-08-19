import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generatePlanNarrative,
  buildLocalTwinSituationNarrative,
  buildPlanNarrativeFacts,
  buildPlanNarrativePrompt,
  isAllowedLlmBaseUrl,
  LLM_MODEL_OPTIONS,
  buildTrafficFlowCalcPrompt,
  buildComprehensiveConclusionPrompt,
  loadLlmConfig,
  readConfiguredLlmApiKey,
  QWEN_LLM_PRESET,
  validateDraftSchema,
  validateGraphReasoningDraft,
  validateStructuredEventDraft,
  validateTrafficFlowCalcDraft,
  validateComprehensiveConclusionDraft,
  validateTwinSituationDraft,
  verifyValueSourcing,
  type EngineFacts,
  type LlmDraft,
} from './llm';
import type { Plan } from '../domain/plan';
import type { SimEvent } from '../domain/event';
import type { CalcRecord, TraceStep } from '../engine/trace';
import { EMPTY_ENVIRONMENT } from '../engine/conditions';

const FACTS: EngineFacts = {
  kps: [1195, 1150],
  resourceIds: ['W-01'],
  etaMins: [36],
};

const GOOD: LlmDraft = {
  summary: 'G65 桩号1195 追尾占 1 车道，调派 W-01 清障，预计 36 分钟到位。',
  measureNotes: [{ measureId: 'M_调清障', note: 'W-01 从 K1150 出发，ETA 36min' }],
  riskNote: '低置信项已标注。',
};

const PLAN_FOR_QWEN = {
  id: 'PLAN-EV-R001',
  version: 1,
  label: 'V1',
  state: '待确认',
  responsible: '指挥中心',
  confidence: '中高',
  measures: [
    {
      id: 'M1',
      measureId: 'M_调清障',
      title: '调清障',
      tier: '资源类',
      summary: '调派清障车',
      params: {},
      resource: { id: 'W-01', etaMin: 36 },
      supports: [],
      runState: '待确认',
      shownAtMs: 1,
    },
  ],
};

const EVENT_FOR_QWEN = {
  id: 'EV-R001',
  road: 'G65',
  accidentKp: 1195,
  lanesTotal: 3,
  lanesClosed: 2,
  q: 4300,
  typeNodeId: 'E_追尾',
  label: 'G65 K1195 追尾事故',
  startSimSec: 0,
  congested: true,
  w: 12,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('LLM 值级溯源比对', () => {
  it('全部关键值取自引擎产物 → 通过', () => {
    expect(verifyValueSourcing(GOOD, FACTS).ok).toBe(true);
  });

  it('杜撰桩号 → 拒绝', () => {
    const bad: LlmDraft = { ...GOOD, summary: 'G65 K1180 追尾…' };
    const r = verifyValueSourcing(bad, FACTS);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((s) => s.includes('K1180'))).toBe(true);
  });

  it('值错位：把不在白名单的资源 ID 填入 → 拒绝', () => {
    const bad: LlmDraft = { ...GOOD, measureNotes: [{ measureId: 'M_调清障', note: '改派 W-EX 到位' }] };
    const r = verifyValueSourcing(bad, FACTS);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((s) => s.includes('W-EX'))).toBe(true);
  });

  it('杜撰 ETA 分钟数 → 拒绝', () => {
    const bad: LlmDraft = { ...GOOD, riskNote: '预计 99 分钟到位' };
    const r = verifyValueSourcing(bad, FACTS);
    expect(r.ok).toBe(false);
  });

  it('归一化：1195 与桩号1195、36min 与 36 分钟等价', () => {
    const ok: LlmDraft = { ...GOOD, summary: 'K1195 事故，ETA 36 分钟' };
    expect(verifyValueSourcing(ok, FACTS).ok).toBe(true);
  });

  it('普通数字（封 2 车道）不误判为桩号', () => {
    const ok: LlmDraft = { ...GOOD, summary: '封闭 2 车道，保留 1 车道' };
    expect(verifyValueSourcing(ok, FACTS).ok).toBe(true);
  });

  it('schema 校验拦截超长与缺字段', () => {
    expect(validateDraftSchema({ summary: '', measureNotes: [], riskNote: '' }).ok).toBe(false);
    expect(validateDraftSchema({ summary: 'x'.repeat(200), measureNotes: [], riskNote: '' }).ok).toBe(false);
    expect(validateDraftSchema({ summary: 'ok', measureNotes: [], riskNote: '' }).ok).toBe(true);
  });

  it('LLM endpoint 仅允许 HTTPS 或本地开发地址', () => {
    expect(isAllowedLlmBaseUrl('https://api.example.com/v1')).toBe(true);
    expect(isAllowedLlmBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isAllowedLlmBaseUrl('http://127.0.0.1:11434/v1')).toBe(true);
    expect(isAllowedLlmBaseUrl('http://api.example.com/v1')).toBe(false);
  });

  it('Qwen 预设使用 OpenAI 兼容端点和 qwen-plus', () => {
    expect(QWEN_LLM_PRESET.baseUrl).toContain('dashscope');
    expect(QWEN_LLM_PRESET.model).toBe('qwen-plus');
  });

  it('可从 Vite 本地环境变量读取 Qwen API Key 与模型配置', () => {
    vi.stubEnv('VITE_LLM_API_KEY', 'sk-env-demo');
    vi.stubEnv('VITE_LLM_QWEN_API_KEY', '');
    vi.stubEnv('VITE_LLM_MODEL', 'qwen-turbo');
    vi.stubEnv('VITE_LLM_TIMEOUT_MS', '15000');
    vi.stubEnv('VITE_LLM_PROVIDER', 'qwen');

    const config = loadLlmConfig();

    expect(config.apiKey).toBe('sk-env-demo');
    expect(config.model).toBe('qwen-turbo');
    expect(config.timeoutMs).toBe(15000);
    expect(config.provider).toBe('qwen');
  });

  it('按模型类型读取对应的本地 API Key', () => {
    vi.stubEnv('VITE_LLM_QWEN_API_KEY', 'sk-qwen');
    vi.stubEnv('VITE_LLM_DEEPSEEK_API_KEY', 'sk-deepseek');
    vi.stubEnv('VITE_LLM_KIMI_API_KEY', 'sk-kimi');

    expect(readConfiguredLlmApiKey('qwen')).toBe('sk-qwen');
    expect(readConfiguredLlmApiKey('deepseek')).toBe('sk-deepseek');
    expect(readConfiguredLlmApiKey('kimi')).toBe('sk-kimi');
  });

  it('DeepSeek/Qwen/Kimi 均提供可选模型版本', () => {
    expect(LLM_MODEL_OPTIONS.qwen.map((option) => option.value)).toContain('qwen-plus');
    expect(LLM_MODEL_OPTIONS.deepseek.map((option) => option.value)).toContain('deepseek-v4-flash');
    expect(LLM_MODEL_OPTIONS.kimi.map((option) => option.value)).toContain('moonshot-v1-8k');
  });

  it('Qwen prompt 和事实白名单来自当前事件与预案', () => {
    const facts = buildPlanNarrativeFacts(EVENT_FOR_QWEN as SimEvent, PLAN_FOR_QWEN as unknown as Plan);
    expect(facts.kps).toContain(1195);
    expect(facts.resourceIds).toContain('W-01');
    expect(facts.etaMins).toContain(36);
    expect(facts.measureIds).toContain('M_调清障');
    expect(buildPlanNarrativePrompt(EVENT_FOR_QWEN as SimEvent, PLAN_FOR_QWEN as unknown as Plan)).toContain('G65 K1195 追尾事故');
  });

  it('Qwen 输出不存在的措施 ID 会被拒绝', () => {
    const bad: LlmDraft = { ...GOOD, measureNotes: [{ measureId: 'M_FAKE', note: '伪造措施' }] };
    const result = verifyValueSourcing(bad, { ...FACTS, measureIds: ['M_调清障'] });
    expect(result.ok).toBe(false);
  });

  it('事件接报结构化输出必须落在道路和事件类型白名单内', () => {
    const ok = validateStructuredEventDraft({
      sourceKind: '12122 电话报警',
      road: 'G65',
      accidentKp: 1179,
      typeNodeId: 'E_追尾',
      label: 'G65 K1179 追尾事故',
      lanesTotal: 3,
      lanesClosed: 2,
      q: 4300,
      direction: 'up',
      confidence: '中',
      normalizedText: 'G65上行K1179两车追尾，占用2条车道。',
      missingFields: [],
    });
    expect(ok.ok).toBe(true);
    expect(validateStructuredEventDraft({ ...((ok as { draft: unknown }).draft as object), road: 'G99' }).ok).toBe(false);
  });

  it('图谱推理解释只能引用当前步骤 ID', () => {
    const result = validateGraphReasoningDraft({
      steps: [{
        stepId: 'T-1',
        title: '因果顺成推演结论',
        chainExplanation: '本次推理从事故占道开始，判断事故点通行受阻并触发后方拥堵链条。',
        nodeStatements: [{
          nodeId: 'N-1',
          nodeLabel: '车道占用',
          plainLanguage: '事故占用了车道，是后续拥堵判断的起点。',
          roleInChain: '起因',
        }],
        conclusionStatement: '本步图谱推理结论是事故占道已经触发后方拥堵链条。',
        confidence: '中',
        operatorFocus: ['复核队尾是否接近上游枢纽'],
        evidenceRefs: [{ type: 'node', id: 'N-1', label: '车道占用' }],
        limits: '该结论解释的是图谱因果链，不替代交通流指标综合结论。',
      }],
    }, ['T-1'], ['N-1']);
    expect(result.ok).toBe(true);
    expect(validateGraphReasoningDraft({ ...(result.ok ? result.draft : {}), steps: [{ ...(result.ok ? result.draft.steps[0] : {}), stepId: 'T-FAKE' }] }, ['T-1'], ['N-1']).ok).toBe(false);
    expect(validateGraphReasoningDraft({ ...(result.ok ? result.draft : {}), steps: [{ ...(result.ok ? result.draft.steps[0] : {}), nodeStatements: [{ ...(result.ok ? result.draft.steps[0].nodeStatements[0] : {}), nodeId: 'N-FAKE' }] }] }, ['T-1'], ['N-1']).ok).toBe(false);
  });

  it('图谱推理解释可修正非关键展示字段，避免大模型小格式偏差导致整段失败', () => {
    const result = validateGraphReasoningDraft({
      steps: [{
        stepId: 'T-1',
        chainExplanation: '系统已沿当前节点完成顺成推导。',
        nodeStatements: [{
          nodeId: 'N-1',
          nodeLabel: { label: '车道占用' },
          plainLanguage: '该节点是本步推理起点。',
          roleInChain: '起因',
        }],
        conclusionStatement: '本步图谱推理结论已经形成。',
        evidenceRefs: [{ type: 'node', id: 'N-1', label: { name: '车道占用' } }],
      }],
    }, ['T-1'], ['N-1']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.steps[0].title).toBe('因果顺成推演结论');
      expect(result.draft.steps[0].confidence).toBe('中');
      expect(result.draft.steps[0].operatorFocus).toHaveLength(1);
      expect(result.draft.steps[0].limits).toContain('交通流');
      expect(result.draft.steps[0].evidenceRefs[0].label).toBe('车道占用');
    }
  });

  it('交通流计算解读只能引用当前事件计算记录且不能把已计算指标说成未计算', () => {
    const records = [{
      id: 'C-EV-R001-01',
      eventId: 'EV-R001',
      label: '瓶颈通行能力',
      formula: 'C_b = (n - k) x C_lane x a',
      substitution: '= (3 - 3) x 1800 x 0.85',
      result: '= 0 veh/h',
      conclusion: '事故占用全部车道，瓶颈通行能力降为 0。',
      conclusionTone: 'danger',
      summaryRole: 'capacity',
      summaryValue: '0 veh/h',
      badges: [],
    }] as CalcRecord[];
    expect(buildTrafficFlowCalcPrompt(EVENT_FOR_QWEN as SimEvent, records)).toContain('交通流计算综合解读');
    const ok = validateTrafficFlowCalcDraft({
      title: '交通流计算综合解读',
      summarySentence: '事故点通行能力为 0 veh/h，上游车辆无法从事故点释放。',
      indicatorFindings: [{
        calcId: 'C-EV-R001-01',
        metric: '瓶颈通行能力',
        value: '0 veh/h',
        plainMeaning: '事故点已经没有车辆释放能力，上游会持续积压。',
        level: 'danger',
      }],
      integratedConclusion: '综合已计算指标，本次事件应按严重拥堵风险处置。',
      operatorImplication: '值班员应重点监控上游队尾和分流条件。',
      uncertainty: '以上解读基于当前事件已计算指标。',
      evidenceRefs: [{ type: 'calc', id: 'C-EV-R001-01', label: '瓶颈通行能力' }],
    }, records);
    expect(ok.ok).toBe(true);
    expect(validateTrafficFlowCalcDraft({
      ...(ok.ok ? ok.draft : {}),
      indicatorFindings: [{ ...(ok.ok ? ok.draft.indicatorFindings[0] : {}), value: '未计算' }],
    }, records).ok).toBe(false);
  });

  it('图谱与交通流由一次综合模型输出统一结论，并校验证据范围', () => {
    const steps = [{
      id: 'T-1',
      eventId: 'EV-R001',
      phase: '推演',
      title: '后方拥堵',
      dataSources: ['图谱'],
      conclusion: '事件占道导致后方拥堵',
      specRef: '3.3.7',
      path: [{ id: 'N-1', label: '车道占用' }],
    }] as unknown as TraceStep[];
    const records = [{
      id: 'C-EV-R001-01',
      eventId: 'EV-R001',
      label: '瓶颈通行能力',
      formula: 'C_b = (n - k) x C_lane x a',
      substitution: '= 0',
      result: '= 0 veh/h',
      conclusion: '瓶颈通行能力为 0 veh/h',
      summaryRole: 'capacity',
      summaryValue: '0 veh/h',
      conclusionTone: 'danger',
      badges: [],
    }] as unknown as CalcRecord[];
    const prompt = buildComprehensiveConclusionPrompt(EVENT_FOR_QWEN as SimEvent, steps, records);
    expect(prompt).toContain('EV-R001');
    expect(prompt).toContain('C-EV-R001-01');
    const result = validateComprehensiveConclusionDraft({
      title: '交通事件综合研判结论',
      summarySentence: '车道占用引起通行能力下降并形成拥堵风险。',
      graphReasoning: {
        stepId: 'T-1',
        title: '因果顺成推演结论',
        chainExplanation: '车道占用导致后方拥堵。',
        nodeStatements: [{ nodeId: 'N-1', nodeLabel: '车道占用', plainLanguage: '事故占用车道。', roleInChain: '起因' }],
        conclusionStatement: '图谱链路成立。',
        confidence: '中',
        operatorFocus: ['复核现场占道状态'],
        evidenceRefs: [{ type: 'node', id: 'N-1', label: '车道占用' }],
        limits: '图谱解释不替代交通流指标综合结论。',
      },
      trafficFlow: {
        title: '交通流计算综合解读',
        summarySentence: '当前通行能力为 0 veh/h。',
        indicatorFindings: [{ calcId: 'C-EV-R001-01', metric: '瓶颈通行能力', value: '0 veh/h', plainMeaning: '上游车辆无法正常通过。', level: 'danger' }],
        integratedConclusion: '存在严重拥堵风险。',
        operatorImplication: '重点关注上游排队。',
        uncertainty: '基于本次事件已完成的计算记录。',
        evidenceRefs: [{ type: 'calc', id: 'C-EV-R001-01', label: '瓶颈通行能力' }],
      },
      integratedConclusion: '车道占用使通行能力降为 0 veh/h，应按拥堵风险处置。',
      operatorImplication: '优先复核现场占道和上游队尾。',
      confidence: '中',
      uncertainty: '结论基于当前事件数据。',
      evidenceRefs: [{ type: 'node', id: 'N-1', label: '车道占用' }, { type: 'calc', id: 'C-EV-R001-01', label: '瓶颈通行能力' }],
    }, steps, records);
    expect(result.ok).toBe(true);
    expect(validateComprehensiveConclusionDraft({
      title: '交通事件综合研判结论',
      summarySentence: 'x',
      graphReasoning: { stepId: 'T-FAKE' },
      trafficFlow: {},
      integratedConclusion: 'x',
      operatorImplication: 'x',
      uncertainty: 'x',
    }, steps, records).ok).toBe(false);
  });

  it('事件态势简报要求指挥结论、影响、处置、风险和关注项完整', () => {
    expect(validateTwinSituationDraft({
      headline: 'G65 K1180追尾事故已造成上游通行能力下降',
      commandConclusion: '当前按中度拥堵处置，优先控制上游队尾并跟踪清障到场。',
      eventOverview: 'G65 K1180双向三车道中发生追尾事故，事故方向占用2条车道。',
      trafficImpact: {
        upstream: '上游门架能力保持率62%，慢行范围正在扩大。',
        incidentPoint: '事故点受占道影响，排队长度约1.2km。',
        downstream: '下游门架能力保持率86%，目前保持通行。',
        overallLevel: '中度拥堵',
      },
      responseProgress: [{ measure: '调度清障', status: '已下发', detail: '清障资源已通知，预计18分钟到位。' }],
      risks: [{ level: '中', content: '上游队尾持续回溯时，存在二次事故风险。' }],
      nextFocus: [{ timeWindow: '未来10分钟', action: '复核队尾位置并视情发布预警', trigger: '队尾继续向上游回溯' }],
      confidenceNote: '门架能力为动态演示数据，现场处置状态以调度回执为准。',
    }).ok).toBe(true);
    expect(validateTwinSituationDraft({ headline: '缺字段' }).ok).toBe(false);
  });

  it('未配置 API Key 时不发起 LLM 请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: '', timeoutMs: 100 },
      'prompt',
      FACTS,
    );
    expect(result.status).toBe('unavailable');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('LLM HTTP 成功返回合法 JSON 时采用草稿', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(GOOD) } }],
      }),
    } as Response);

    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1/', model: 'demo', apiKey: 'sk-demo', timeoutMs: 1000 },
      'prompt',
      { ...FACTS, measureIds: ['M_调清障'] },
    );

    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.draft.summary).toBe(GOOD.summary);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer sk-demo' }),
      }),
    );
  });

  it('LLM HTTP 非 2xx 返回 unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 500 } as Response);

    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-demo', timeoutMs: 1000 },
      'prompt',
      FACTS,
    );

    expect(result).toEqual({ status: 'unavailable', reason: 'HTTP 500' });
  });

  it('外部模型不可用时可生成符合简报结构的本地规则兜底', () => {
    const draft = buildLocalTwinSituationNarrative(
      EVENT_FOR_QWEN as SimEvent,
      { vehicles: [] } as never,
      120,
      { plans: [PLAN_FOR_QWEN as unknown as Plan], environment: EMPTY_ENVIRONMENT },
    );

    expect(validateTwinSituationDraft(draft).ok).toBe(true);
    expect(draft.headline).toContain('G65');
    expect(draft.confidenceNote).toContain('本地规则简报');
  });

  it('兼容端点拒绝 JSON 模式时，移除 response_format 后重试一次', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: { message: 'response_format is unsupported' } }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(GOOD) } }] }),
      } as Response);

    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-demo', timeoutMs: 1000 },
      'prompt',
      { ...FACTS, measureIds: ['M_调清障'] },
    );

    expect(result.status).toBe('ok');
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const retryOptions = vi.mocked(globalThis.fetch).mock.calls[1]?.[1] as RequestInit;
    expect(JSON.parse(String(retryOptions.body))).not.toHaveProperty('response_format');
  });

  it('LLM 返回非法 JSON 时拒绝采用', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'not-json' } }] }),
    } as Response);

    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-demo', timeoutMs: 1000 },
      'prompt',
      FACTS,
    );

    expect(result).toEqual({ status: 'rejected', reasons: ['输出非合法 JSON'] });
  });

  it('LLM 返回伪造关键值时拒绝采用', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ ...GOOD, riskNote: '预计 99 分钟到位' }) } }],
      }),
    } as Response);

    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-demo', timeoutMs: 1000 },
      'prompt',
      FACTS,
    );

    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reasons.some((reason) => reason.includes('99'))).toBe(true);
  });

  it('LLM 调用异常或超时中断时返回 unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));

    const result = await generatePlanNarrative(
      { baseUrl: 'https://api.example.com/v1', model: 'demo', apiKey: 'sk-demo', timeoutMs: 1 },
      'prompt',
      FACTS,
    );

    expect(result.status).toBe('unavailable');
  });
});
