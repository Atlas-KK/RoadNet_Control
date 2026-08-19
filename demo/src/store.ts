import { create } from 'zustand';
import { tracePathForStep, type TraceStep, type CalcRecord, type TraceComprehensiveConclusion } from './engine/trace';
import { buildTriageRows, sortTriage } from './engine/triage';
import { ingestReport, type RuntimeEventInput } from './engine/ingest';
import { EMPTY_ENVIRONMENT, type EnvironmentState } from './engine/conditions';
import { propagateRetraction, type TmsMeasure } from './engine/tms';
import { assessSeverity } from './engine/severity';
import { computeFlow } from './engine/flowModel';
import { runReasoning } from './engine/reasoner';
import { buildPlanV1 } from './engine/planBuilder';
import { tunnelAt } from './data/network';
import { DEVICES } from './data/devices';
import type { EventProgressReport, SimEvent } from './domain/event';
import type { ChartSpec } from './domain/chart';
import type { MergeInfo } from './domain/merge';
import type { TmsResult } from './domain/tms';
import type { MeasureRunState, Plan, PlanMeasure } from './domain/plan';
import type { AuditEntry, AuditKind } from './domain/audit';
import * as persistence from './services/persistence';
import {
  buildLocalTwinSituationNarrative,
  buildPlanNarrativeFacts,
  buildPlanNarrativePrompt,
  generateComprehensiveConclusion,
  generateGraphReasoningExplanation,
  generateTrafficFlowCalcInterpretation,
  generatePlanNarrative,
  generateTwinSituationNarrative,
  loadLlmConfig,
  type LlmProvider,
} from './services/llm';
import type { PlanState, DiffStatus } from './engine/stateMachine';
import { buildRadarFusionTraffic } from './gis/radarFusionTraffic';
import type { MapTheme } from './gis/mapTheme';
import type { DemoCase } from './data/demoCases';
import { resolveDemoTwins, type ActiveDemoTwin } from './gis/demoTwinScenario';
import { buildEventFinalReport } from './engine/finalReport';
import { buildPlanCandidates } from './engine/planComparison';
import { buildMeasureDispatch } from './engine/commandDispatch';

export type Speed = 1 | 4 | 16;

export interface Highlight {
  edgeKeys: string[];
  nodeIds: string[];
  calcIds: string[];
  mapRefs: string[];
}

export interface TimelineEntry {
  clock: string;
  text: string;
}

export type TracePlaybackStatus = 'idle' | 'playing' | 'paused' | 'complete';

export interface TracePlayback {
  stepId: string | null;
  nodeIndex: number;
  status: TracePlaybackStatus;
}

const EMPTY_HL: Highlight = { edgeKeys: [], nodeIds: [], calcIds: [], mapRefs: [] };
const EMPTY_TRACE_PLAYBACK: TracePlayback = { stepId: null, nodeIndex: 0, status: 'idle' };
const RUNTIME_BASE_SEC = 10 * 3600;
const INACTIVE_PLAN_STATES = new Set<PlanState>(['已完成', '已作废', '已被替换']);
export const TWIN_NARRATIVE_REFRESH_MS = 30_000;
const MAX_TWIN_NARRATIVE_HISTORY = 12;

interface AppState {
  simSec: number;
  running: boolean;
  speed: Speed;
  sceneBaseSec: number;
  events: SimEvent[];
  trace: TraceStep[];
  calcs: CalcRecord[];
  activeStepId: string | null;
  tracePlayback: TracePlayback;
  highlight: Highlight;
  plans: Plan[];
  activePlanVersion: number;
  forcedInterrupt: string | null;
  mergeInfo: MergeInfo | null;
  timelineLog: TimelineEntry[];
  activeConditions: string[];
  tms: TmsResult[] | null;
  chart: ChartSpec | null;
  resourceOccupancy: Record<string, string>;
  mode: 'runtime';
  environment: EnvironmentState;
  mapTheme: MapTheme;
  audit: AuditEntry[];
  persistenceAvailable: boolean;
  runtimeSeq: number;
  focusedEventId: string | null;
  /** 当前加载的案例孪生脚本；五个演示案例共用，不影响手工上报。 */
  activeDemoTwin?: ActiveDemoTwin;

  play: () => void;
  pause: () => void;
  toggle: () => void;
  setSpeed: (s: Speed) => void;
  reset: () => void;
  tick: (dSimSec: number) => void;
  selectStep: (stepId: string | null) => void;
  startTracePlayback: (stepId: string) => void;
  toggleTracePlayback: () => void;
  pauseTracePlayback: () => void;
  advanceTracePlayback: () => void;
  previousTraceNode: () => void;
  nextTraceNode: () => void;
  restartTracePlayback: () => void;
  setActivePlanVersion: (v: number) => void;
  focusEvent: (eventId: string | null) => void;
  selectPlanCandidate: (planId: string, version: number, candidateId: string) => void;
  confirmPlanCandidate: (planId: string, version: number) => void;
  confirmMeasure: (planId: string, version: number, measureId: string) => void;
  setForcedInterrupt: (measureId: string | null) => void;
  ingestEvent: (input: RuntimeEventInput) => void;
  loadDemoCase: (demoCase: DemoCase) => void;
  setEnvironment: (env: EnvironmentState) => void;
  setMapTheme: (theme: MapTheme) => void;
  rejectMeasure: (planId: string, version: number, measureId: string, reason: string) => void;
  voidPlan: (planId: string, reason: string) => void;
  falsifyEvent: (eventId: string, reason: string) => void;
  clearRuntime: () => void;
  reviseEventFacts: (eventId: string, retractedFacts: string[], note: string) => void;
  submitProgressReport: (eventId: string, input: {
    reporter: string;
    source: string;
    description: string;
    kind: EventProgressReport['kind'];
    changes: EventProgressReport['changes'];
  }) => void;
  noteOverdueEscalation: (measureId: string, title: string) => void;
  requestTraceExplanation: (eventId: string) => void;
  requestTwinNarrative: (eventId: string) => void;
}

function isActivePlan(plan: Plan): boolean {
  return !INACTIVE_PLAN_STATES.has(plan.state);
}

function highlightFromStep(step: TraceStep): Highlight {
  const edgeKeys = (step.edges ?? []).map((e) => `${e.from}->${e.to}`);
  const nodeIds = Array.from(
    new Set((step.edges ?? []).flatMap((e) => [e.from, e.to].filter(Boolean) as string[])),
  );
  return { edgeKeys, nodeIds, calcIds: step.calcs ?? [], mapRefs: step.mapRefs ?? [] };
}

function mergeTraceAiConclusion(
  step: TraceStep,
  provider: LlmProvider,
  model: string,
): TraceComprehensiveConclusion | undefined {
  const graph = step.aiGraphConclusion;
  const calc = step.aiCalcInterpretation;
  if (!graph && !calc) return undefined;
  return {
    provider,
    model,
    generatedAt: Math.max(graph?.generatedAt ?? 0, calc?.generatedAt ?? 0),
    title: '交通事件综合研判结论',
    summarySentence: [graph?.chainExplanation, calc?.summarySentence].filter(Boolean).join('；'),
    chainExplanation: graph?.chainExplanation ?? '事理图谱推理结论尚未生成，当前先依据交通流计算结果研判。',
    nodeStatements: graph?.nodeStatements ?? [],
    indicatorFindings: calc?.indicatorFindings ?? [],
    integratedConclusion: calc?.integratedConclusion ?? graph?.conclusionStatement ?? '当前事件综合结论尚未形成。',
    operatorImplication: calc?.operatorImplication ?? graph?.operatorFocus.join('；') ?? '请结合现场复核结果继续处置。',
    confidence: graph?.confidence ?? '中',
    uncertainty: calc?.uncertainty ?? graph?.limits ?? '结论基于当前事件已完成的规则推理与计算记录。',
    evidenceRefs: [
      ...(graph?.evidenceRefs ?? []),
      ...(calc?.evidenceRefs ?? []),
    ],
  };
}

function emptyRuntimeState(): Omit<AppState, 'persistenceAvailable' | 'audit' | keyof RuntimeActions> {
  return {
    simSec: 0,
    running: true,
    speed: 1,
    sceneBaseSec: RUNTIME_BASE_SEC,
    events: [],
    trace: [],
    calcs: [],
    activeStepId: null,
    tracePlayback: EMPTY_TRACE_PLAYBACK,
    highlight: EMPTY_HL,
    plans: [],
    activePlanVersion: 1,
    forcedInterrupt: null,
    mergeInfo: null,
    timelineLog: [],
    activeConditions: [],
    tms: null,
    chart: null,
    resourceOccupancy: {},
    mode: 'runtime',
    environment: EMPTY_ENVIRONMENT,
    mapTheme: 'light',
    runtimeSeq: 0,
    focusedEventId: null,
    activeDemoTwin: undefined,
  };
}

function applyDemoTwinMeasures(
  plans: Plan[],
  activeDemoTwin: ActiveDemoTwin | undefined,
  simSec: number,
  focusedEventId: string | null,
): Plan[] {
  if (!activeDemoTwin || !focusedEventId) return plans;
  const phaseByEventId = new Map(resolveDemoTwins(activeDemoTwin, simSec).map((item) => [item.eventId, item.phase]));
  if (phaseByEventId.size === 0) return plans;
  return plans.map((plan) => {
    const eventId = plan.id.replace(/^PLAN-/, '');
    const phase = phaseByEventId.get(eventId);
    // 演示脚本只能推进当前处置事件，不能改变未聚焦事件的指令状态。
    if (eventId !== focusedEventId || !phase || !isActivePlan(plan)) return plan;
    const issueIds = new Set(phase.autoIssueMeasureIds ?? []);
    let changed = false;
    const measures = plan.measures.map((measure) => {
      if (phase.completion?.finalizeEvent && measure.runState !== '已完成') {
        changed = true;
        return { ...measure, runState: '已完成' as MeasureRunState, confirmMs: measure.confirmMs ?? 0, confirmSimSec: measure.confirmSimSec ?? phase.atSimSec };
      }
      if (!issueIds.has(measure.measureId) || measure.runState !== '待确认') return measure;
      changed = true;
      return { ...measure, runState: '已下发' as MeasureRunState, confirmMs: 0, confirmSimSec: phase.atSimSec };
    });
    if (!changed) return plan;
    if (phase.completion?.finalizeEvent) return { ...plan, measures, state: '已完成' as PlanState };
    const pending = measures.some((measure) => measure.runState === '待确认');
    return { ...plan, measures, state: pending ? '已确认' as PlanState : '已下发' as PlanState };
  });
}

type RuntimeActions = Pick<AppState,
  | 'play'
  | 'pause'
  | 'toggle'
  | 'setSpeed'
  | 'reset'
   | 'tick'
   | 'selectStep'
   | 'startTracePlayback'
   | 'toggleTracePlayback'
   | 'pauseTracePlayback'
   | 'advanceTracePlayback'
   | 'previousTraceNode'
   | 'nextTraceNode'
   | 'restartTracePlayback'
  | 'setActivePlanVersion'
  | 'focusEvent'
  | 'selectPlanCandidate'
  | 'confirmPlanCandidate'
  | 'confirmMeasure'
  | 'setForcedInterrupt'
  | 'ingestEvent'
  | 'loadDemoCase'
  | 'setEnvironment'
  | 'setMapTheme'
  | 'rejectMeasure'
  | 'voidPlan'
  | 'falsifyEvent'
  | 'clearRuntime'
  | 'reviseEventFacts'
  | 'submitProgressReport'
  | 'noteOverdueEscalation'
  | 'requestTraceExplanation'
  | 'requestTwinNarrative'
>;

export const useStore = create<AppState>((set, get) => {
  const escalatedAudited = new Set<string>();
  const traceAiInFlight = new Set<string>();
  const twinAiInFlight = new Set<string>();

  const nextFocusedEventId = (events: SimEvent[], plans: Plan[], simSec: number) => {
    const active = events.filter((event) => !event.finalized && !event.falsePositive);
    const rows = buildTriageRows(active.map((event) => {
      const latest = plans
        .filter((plan) => plan.id === `PLAN-${event.id}` && isActivePlan(plan))
        .sort((a, b) => b.version - a.version)[0];
      return {
        event,
        pendingShownAtMs: latest?.measures.filter((measure) => measure.runState === '待确认').map((measure) => measure.shownAtMs) ?? [],
        simSec,
      };
    }), Date.now());
    return sortTriage(rows)[0]?.eventId ?? null;
  };

  const pushAudit = (kind: AuditKind, summary: string, extra?: Partial<AuditEntry>) => {
    const base: Omit<AuditEntry, 'seq'> = {
      tsReal: Date.now(),
      tsSim: get().sceneBaseSec + get().simSec,
      kind,
      summary,
      ...extra,
    };
    const full = persistence.appendAudit(base);
    set((s) => ({ audit: [...s.audit, full].slice(-500) }));
  };

  const persistRuntime = () => {
    const s = get();
    persistence.saveRuntime({
      version: 3,
      savedAtReal: Date.now(),
      simSec: s.simSec,
      sceneBaseSec: s.sceneBaseSec,
      events: s.events,
      plans: s.plans,
      trace: s.trace,
      calcs: s.calcs,
      resourceOccupancy: s.resourceOccupancy,
      environment: s.environment,
      mapTheme: s.mapTheme,
      datasetRecords: [],
      timelineLog: s.timelineLog,
      activeDemoTwin: s.activeDemoTwin,
    });
  };

  const providerOf = (config: { provider?: LlmProvider }): LlmProvider => config.provider ?? 'custom';

  const requestPlanAiNarrative = (event: SimEvent, plan: Plan, conditions: string[]) => {
    const config = loadLlmConfig();
    if (!config.baseUrl || !config.model || !config.apiKey) return;
    const provider = providerOf(config);
    set((s) => ({
      plans: s.plans.map((p) => p.id === plan.id && p.version === plan.version ? { ...p, aiStatus: { status: 'pending' } } : p),
    }));
    persistRuntime();

    generatePlanNarrative(config, buildPlanNarrativePrompt(event, plan, conditions), buildPlanNarrativeFacts(event, plan))
      .then((outcome) => {
        if (outcome.status === 'ok') {
          set((s) => ({
            plans: s.plans.map((p) => p.id === plan.id && p.version === plan.version
              ? {
                  ...p,
                  aiNarrative: { provider, model: config.model, generatedAt: Date.now(), ...outcome.draft },
                  aiStatus: { status: 'ok' },
                }
              : p),
          }));
          pushAudit('预案生成', `${event.id} Qwen 文案生成完成`, { eventId: event.id, planId: plan.id, version: plan.version });
        } else {
          const reason = outcome.status === 'rejected' ? outcome.reasons.join('；') : outcome.reason;
          set((s) => ({
            plans: s.plans.map((p) => p.id === plan.id && p.version === plan.version
              ? { ...p, aiStatus: { status: outcome.status, reason } }
              : p),
          }));
          pushAudit('预案生成', `${event.id} Qwen 文案未采用：${reason}`, { eventId: event.id, planId: plan.id, version: plan.version });
        }
        persistRuntime();
      })
      .catch((e: unknown) => {
        const reason = e instanceof Error ? e.message : 'Qwen 调用失败';
        set((s) => ({
          plans: s.plans.map((p) => p.id === plan.id && p.version === plan.version
            ? { ...p, aiStatus: { status: 'unavailable', reason } }
            : p),
        }));
        pushAudit('预案生成', `${event.id} Qwen 文案调用失败：${reason}`, { eventId: event.id, planId: plan.id, version: plan.version });
        persistRuntime();
      });
  };

  const _requestLegacyTraceAiExplanation = (event: SimEvent, steps: TraceStep[], calcs: CalcRecord[]) => {
    const config = loadLlmConfig();
    if (steps.length === 0 || traceAiInFlight.has(event.id)) return;
    const stepIds = new Set(steps.map((step) => step.id));
    if (!config.baseUrl || !config.model || !config.apiKey) {
      const reason = !config.apiKey ? '未配置 LLM API Key' : '未配置 LLM 端点或模型';
      set((s) => ({
        events: s.events.map((item) => item.id === event.id
          ? { ...item, aiTraceStatus: { status: 'unavailable', reason } }
          : item),
        trace: s.trace.map((step) => stepIds.has(step.id)
          ? {
              ...step,
              aiStatus: { status: 'unavailable', reason },
              aiGraphStatus: { status: 'unavailable', reason },
              aiCalcStatus: { status: 'unavailable', reason },
            }
          : step),
      }));
      persistRuntime();
      return;
    }
    const provider = providerOf(config);
    traceAiInFlight.add(event.id);
    set((s) => ({
      events: s.events.map((item) => item.id === event.id
        ? { ...item, aiTraceStatus: { status: 'pending' } }
        : item),
      trace: s.trace.map((step) => stepIds.has(step.id)
        ? { ...step, aiStatus: { status: 'pending' }, aiGraphStatus: { status: 'pending' }, aiCalcStatus: { status: 'pending' } }
        : step),
    }));
    persistRuntime();

    (async () => {
      const graphResult = await generateGraphReasoningExplanation(config, event, steps, calcs)
        .then((value) => ({ status: 'fulfilled' as const, value }))
        .catch((reason: unknown) => ({ status: 'rejected' as const, reason }));
        if (graphResult.status === 'fulfilled' && graphResult.value.status === 'ok') {
          const outcome = graphResult.value;
          const byStep = new Map(outcome.draft.steps.map((step) => [step.stepId, step]));
          set((s) => ({
            trace: s.trace.map((step) => {
              const ai = byStep.get(step.id);
              return ai
                ? {
                    ...step,
                    aiGraphConclusion: {
                      provider,
                      model: config.model,
                      generatedAt: Date.now(),
                      title: ai.title,
                      chainExplanation: ai.chainExplanation,
                      nodeStatements: ai.nodeStatements,
                      conclusionStatement: ai.conclusionStatement,
                      confidence: ai.confidence,
                      operatorFocus: ai.operatorFocus,
                      evidenceRefs: ai.evidenceRefs,
                      limits: ai.limits,
                    },
                    aiGraphStatus: { status: 'ok' },
                  }
                : step;
            }),
          }));
          pushAudit('推理批次', `${event.id} 因果顺成推演结论生成完成`, { eventId: event.id });
        } else {
          const reason = graphResult.status === 'rejected'
            ? graphResult.reason instanceof Error ? graphResult.reason.message : '图谱推理解释调用失败'
            : graphResult.value.status === 'rejected'
              ? graphResult.value.reasons.join('；')
              : graphResult.value.status === 'unavailable'
                ? graphResult.value.reason
                : '图谱推理解释未生成';
          set((s) => ({
            trace: s.trace.map((step) => stepIds.has(step.id)
              ? { ...step, aiGraphStatus: { status: graphResult.status === 'fulfilled' ? graphResult.value.status : 'unavailable', reason } }
              : step),
          }));
          pushAudit('推理批次', `${event.id} 因果顺成推演结论未采用：${reason}`, { eventId: event.id });
        }

        const calcResult = await generateTrafficFlowCalcInterpretation(config, event, calcs)
          .then((value) => ({ status: 'fulfilled' as const, value }))
          .catch((reason: unknown) => ({ status: 'rejected' as const, reason }));
        if (calcResult.status === 'fulfilled' && calcResult.value.status === 'ok') {
          const draft = calcResult.value.draft;
          set((s) => ({
            trace: s.trace.map((step) => stepIds.has(step.id)
              ? {
                  ...step,
                  aiCalcInterpretation: {
                    provider,
                    model: config.model,
                    generatedAt: Date.now(),
                    ...draft,
                  },
                  aiCalcStatus: { status: 'ok' },
                }
              : step),
          }));
          pushAudit('推理批次', `${event.id} 交通流计算综合解读生成完成`, { eventId: event.id });
        } else {
          const reason = calcResult.status === 'rejected'
            ? calcResult.reason instanceof Error ? calcResult.reason.message : '交通流计算解读调用失败'
            : calcResult.value.status === 'rejected'
              ? calcResult.value.reasons.join('；')
              : calcResult.value.status === 'unavailable'
                ? calcResult.value.reason
                : '交通流计算解读未生成';
          set((s) => ({
            trace: s.trace.map((step) => stepIds.has(step.id)
              ? { ...step, aiCalcStatus: { status: calcResult.status === 'fulfilled' ? calcResult.value.status : 'unavailable', reason } }
              : step),
          }));
          pushAudit('推理批次', `${event.id} 交通流计算综合解读未采用：${reason}`, { eventId: event.id });
        }

        set((s) => ({
          events: s.events.map((item) => {
            if (item.id !== event.id) return item;
            const candidate = s.trace.find((traceStep) => stepIds.has(traceStep.id));
            const conclusion = candidate ? mergeTraceAiConclusion(candidate, provider, config.model) : undefined;
            const generated = Boolean(conclusion);
            return {
              ...item,
              aiTraceConclusion: conclusion,
              aiTraceStatus: generated
                ? { status: 'ok' as const }
                : { status: 'unavailable' as const, reason: '大模型综合结论未生成，当前显示规则计算结果。' },
            };
          }),
          trace: s.trace.map((step) => {
            if (!stepIds.has(step.id)) return step;
            const graphOk = step.aiGraphStatus?.status === 'ok' || step.aiGraphConclusion;
            const calcOk = step.aiCalcStatus?.status === 'ok' || step.aiCalcInterpretation;
            const aiComprehensiveConclusion = mergeTraceAiConclusion(step, provider, config.model);
            return graphOk || calcOk
              ? { ...step, aiStatus: { status: 'ok' }, aiComprehensiveConclusion, aiComprehensiveStatus: { status: 'ok' } }
              : step.aiStatus?.status === 'pending'
                ? { ...step, aiStatus: { status: 'unavailable', reason: '大模型解读未生成' }, aiComprehensiveStatus: { status: 'unavailable', reason: '大模型解读未生成' } }
                : step;
          }),
        }));
        persistRuntime();
      })()
      .finally(() => traceAiInFlight.delete(event.id));
  };

  const requestTraceAiExplanation = (event: SimEvent, steps: TraceStep[], calcs: CalcRecord[]) => {
    const config = loadLlmConfig();
    if (steps.length === 0 || traceAiInFlight.has(event.id)) return;
    const stepIds = new Set(steps.map((step) => step.id));
    const setUnavailable = (reason: string) => {
      set((s) => ({
        events: s.events.map((item) => item.id === event.id
          ? { ...item, aiTraceStatus: { status: 'unavailable', reason } }
          : item),
        trace: s.trace.map((step) => stepIds.has(step.id)
          ? {
              ...step,
              aiStatus: { status: 'unavailable', reason },
              aiComprehensiveStatus: { status: 'unavailable', reason },
            }
          : step),
      }));
    };

    if (!config.baseUrl || !config.model || !config.apiKey) {
      setUnavailable(!config.apiKey ? '未配置 LLM API Key' : '未配置 LLM 端点或模型');
      persistRuntime();
      return;
    }

    const provider = providerOf(config);
    traceAiInFlight.add(event.id);
    set((s) => ({
      events: s.events.map((item) => item.id === event.id
        ? { ...item, aiTraceStatus: { status: 'pending' } }
        : item),
      trace: s.trace.map((step) => stepIds.has(step.id)
        ? {
            ...step,
            aiStatus: { status: 'pending' },
            aiComprehensiveStatus: { status: 'pending' },
          }
        : step),
    }));
    persistRuntime();

    generateComprehensiveConclusion(config, event, steps, calcs)
      .then((outcome) => {
        if (outcome.status === 'ok') {
          const draft = outcome.draft;
          const conclusion: TraceComprehensiveConclusion = {
            provider,
            model: config.model,
            generatedAt: Date.now(),
            title: draft.title,
            summarySentence: draft.summarySentence,
            chainExplanation: draft.graphReasoning.chainExplanation,
            nodeStatements: draft.graphReasoning.nodeStatements,
            indicatorFindings: draft.trafficFlow.indicatorFindings,
            integratedConclusion: draft.integratedConclusion,
            operatorImplication: draft.operatorImplication,
            confidence: draft.confidence,
            uncertainty: draft.uncertainty,
            evidenceRefs: draft.evidenceRefs,
          };
          set((s) => ({
            events: s.events.map((item) => item.id === event.id
              ? { ...item, aiTraceConclusion: conclusion, aiTraceStatus: { status: 'ok' } }
              : item),
            trace: s.trace.map((step) => stepIds.has(step.id)
              ? {
                  ...step,
                  aiComprehensiveConclusion: conclusion,
                  aiComprehensiveStatus: { status: 'ok' },
                  aiStatus: { status: 'ok' },
                }
              : step),
          }));
          pushAudit('推理批次', `${event.id} 事件综合研判结论生成完成`, { eventId: event.id });
        } else {
          // 综合 JSON 偶发不符合格式时，沿用旧的分段校验链作为兼容兜底。
          if (outcome.status === 'rejected') {
            traceAiInFlight.delete(event.id);
            _requestLegacyTraceAiExplanation(event, steps, calcs);
            return;
          }
          const reason = outcome.reason;
          setUnavailable(reason);
          pushAudit('推理批次', `${event.id} 事件综合研判结论未采用：${reason}`, { eventId: event.id });
        }
        persistRuntime();
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : '大模型综合研判调用失败';
        setUnavailable(reason);
        pushAudit('推理批次', `${event.id} 事件综合研判调用失败：${reason}`, { eventId: event.id });
        persistRuntime();
      })
      .finally(() => traceAiInFlight.delete(event.id));
  };

  const requestTwinAiNarrative = (eventId: string) => {
    const s = get();
    const event = s.events.find((item) => item.id === eventId && !item.finalized && !item.falsePositive);
    if (!event || twinAiInFlight.has(eventId)) return;
    const config = loadLlmConfig();
    const traffic = buildRadarFusionTraffic(s.events, s.simSec, eventId, s.plans, s.activeDemoTwin);
    const requestedSimSec = s.simSec;
    const context = {
      plans: s.plans,
      activeDemoTwin: s.activeDemoTwin,
      environment: s.environment,
    };
    const saveTwinNarrative = (
      provider: LlmProvider,
      model: string,
      draft: ReturnType<typeof buildLocalTwinSituationNarrative>,
    ) => {
      const narrative = { provider, model, generatedAt: Date.now(), simSec: requestedSimSec, ...draft };
      set((state) => ({
        events: state.events.map((item) => item.id === eventId
          ? {
              ...item,
              aiTwinNarrative: narrative,
              aiTwinNarrativeHistory: [
                ...(item.aiTwinNarrativeHistory?.length
                  ? item.aiTwinNarrativeHistory
                  : item.aiTwinNarrative ? [item.aiTwinNarrative] : []),
                narrative,
              ].slice(-MAX_TWIN_NARRATIVE_HISTORY),
              aiTwinStatus: { status: 'ok' },
            }
          : item),
      }));
    };
    const saveLocalTwinNarrative = (reason: string) => {
      saveTwinNarrative('custom', '本地规则引擎', buildLocalTwinSituationNarrative(event, traffic, requestedSimSec, context));
      pushAudit('推理批次', `${eventId} 态势简报已降级为本地规则引擎：${reason}`, { eventId });
    };
    if (!config.baseUrl || !config.model || !config.apiKey) {
      const reason = !config.apiKey ? '未配置 LLM API Key' : '未配置 LLM 端点或模型';
      saveLocalTwinNarrative(reason);
      persistRuntime();
      return;
    }
    const provider = providerOf(config);
    twinAiInFlight.add(eventId);
    set((state) => ({
      events: state.events.map((item) => item.id === eventId ? { ...item, aiTwinStatus: { status: 'pending' } } : item),
    }));
    persistRuntime();

    generateTwinSituationNarrative(config, event, traffic, s.simSec, context)
      .then((outcome) => {
        if (outcome.status === 'ok') {
          saveTwinNarrative(provider, config.model, outcome.draft);
          pushAudit('推理批次', `${eventId} 事件孪生态势讲解生成完成`, { eventId });
        } else {
          const reason = outcome.status === 'rejected' ? outcome.reasons.join('；') : outcome.reason;
          saveLocalTwinNarrative(reason);
        }
        persistRuntime();
      })
      .catch((e: unknown) => {
        const reason = e instanceof Error ? e.message : 'Qwen 调用失败';
        saveLocalTwinNarrative(reason);
        persistRuntime();
      })
      .finally(() => twinAiInFlight.delete(eventId));
  };

  const requestTraceAiExplanationByEvent = (eventId: string) => {
    if (traceAiInFlight.has(eventId)) return;
    const s = get();
    const event = s.events.find((item) => item.id === eventId && !item.finalized && !item.falsePositive);
    if (!event) return;
    if (event.aiTraceConclusion || event.aiTraceStatus?.status === 'pending') return;
    const needsAi = (step: TraceStep) => (
      step.eventId === eventId
      && (
        step.aiComprehensiveConclusion == null
        && (
          step.aiComprehensiveStatus == null
          || step.aiComprehensiveStatus.status === 'idle'
          || step.aiComprehensiveStatus.status === 'rejected'
          || step.aiComprehensiveStatus.status === 'unavailable'
          || (!step.aiGraphConclusion || !step.aiCalcInterpretation)
        )
      )
      && (
        step.aiGraphStatus == null
        || step.aiGraphStatus.status === 'idle'
        || step.aiGraphStatus.status === 'rejected'
        || step.aiGraphStatus.status === 'unavailable'
        || step.aiCalcStatus == null
        || step.aiCalcStatus.status === 'idle'
        || step.aiCalcStatus.status === 'rejected'
        || step.aiCalcStatus.status === 'unavailable'
      )
    );
    const activeStep = s.activeStepId ? s.trace.find((step) => step.id === s.activeStepId && needsAi(step)) : undefined;
    const steps = activeStep ? [activeStep] : s.trace.filter(needsAi).slice(0, 1);
    if (steps.length === 0) return;
    requestTraceAiExplanation(event, steps, s.calcs.filter((calc) => calc.eventId === eventId));
  };

  const snap = persistence.loadRuntime();
  const initial = snap
    ? {
        ...emptyRuntimeState(),
        running: false,
        simSec: snap.simSec,
        sceneBaseSec: snap.sceneBaseSec,
        events: snap.events,
        plans: snap.plans,
        trace: snap.trace,
        calcs: snap.calcs,
        resourceOccupancy: snap.resourceOccupancy,
        environment: snap.environment,
        mapTheme: snap.mapTheme ?? 'light',
        timelineLog: snap.timelineLog,
        runtimeSeq: snap.events.filter((e) => e.id.startsWith('EV-R')).length,
        activeDemoTwin: snap.activeDemoTwin,
      }
    : emptyRuntimeState();

  return {
    ...initial,
    audit: persistence.readAudit(),
    persistenceAvailable: persistence.isPersistenceAvailable(),

    play: () => set({ running: true }),
    pause: () => set({ running: false }),
    toggle: () => set((s) => ({ running: !s.running })),
    setSpeed: (speed) => set({ speed }),
    setMapTheme: (mapTheme) => {
      set({ mapTheme });
      persistRuntime();
    },
    tick: (dSimSec) => {
      const previousSimSec = get().simSec;
      set((s) => {
        const simSec = s.simSec + dSimSec;
        return { simSec };
      });
      const activeDemoTwin = get().activeDemoTwin;
      if (!activeDemoTwin) return;
      for (const revision of activeDemoTwin.script.revisions ?? []) {
        if (revision.simSec > get().simSec || revision.simSec <= previousSimSec || activeDemoTwin.appliedRevisionIds?.includes(revision.id)) continue;
        const eventId = activeDemoTwin.eventIds?.[revision.eventIndex];
        if (!eventId) continue;
        get().reviseEventFacts(eventId, revision.retractedFacts, revision.note);
        set((state) => ({
          activeDemoTwin: state.activeDemoTwin
            ? { ...state.activeDemoTwin, appliedRevisionIds: [...(state.activeDemoTwin.appliedRevisionIds ?? []), revision.id] }
            : undefined,
        }));
        persistRuntime();
      }
      // Fact corrections can create a new plan version. Apply the terminal phase to that version before freezing the report.
      set((state) => ({
        plans: applyDemoTwinMeasures(state.plans, state.activeDemoTwin, get().simSec, get().focusedEventId),
      }));
      const completed = resolveDemoTwins(activeDemoTwin, get().simSec)
        .filter((item) => item.eventId === get().focusedEventId)
        .filter((item) => item.phase.completion?.finalizeEvent)
        .filter((item) => !get().events.find((event) => event.id === item.eventId)?.finalized);
      if (completed.length > 0) {
        const completionByEventId = new Map(completed.map((item) => [item.eventId, { completion: item.phase.completion!, queuedVehicleCount: item.phase.traffic.queuedVehicleCount }]));
        set((state) => ({
          events: state.events.map((event) => {
            const terminal = completionByEventId.get(event.id);
            if (!terminal) return event;
            return {
              ...event,
              stage: terminal.completion.stage,
              finalized: true,
              finalReport: buildEventFinalReport({
                event,
                plans: state.plans,
                trace: state.trace,
                activeDemoTwin,
                simSec: get().simSec,
                completion: terminal.completion,
                queueCleared: terminal.queuedVehicleCount === 0,
              }),
            };
          }),
        }));
        completed.forEach((item) => pushAudit('事件处置闭环', `${item.eventId} ${item.phase.completion!.note}`, { eventId: item.eventId }));
        persistRuntime();
      }
    },
    reset: () => {
      persistence.clearPersistence();
      escalatedAudited.clear();
      set({ ...emptyRuntimeState(), audit: [] });
    },

    setActivePlanVersion: (v) => set({ activePlanVersion: v }),
    focusEvent: (eventId) => {
      const latest = eventId
        ? get().plans.filter((plan) => plan.id === `PLAN-${eventId}`).sort((a, b) => b.version - a.version)[0]
        : undefined;
      set({ focusedEventId: eventId, ...(latest ? { activePlanVersion: latest.version } : {}) });
    },
    selectPlanCandidate: (planId, version, candidateId) => {
      set((state) => ({
        plans: state.plans.map((plan) => {
          if (plan.id !== planId || plan.version !== version || plan.decisionConfirmedAt) return plan;
          const candidate = plan.candidates?.find((item) => item.id === candidateId);
          return candidate ? { ...plan, selectedCandidateId: candidateId, measures: candidate.measures.map((measure) => ({ ...measure, params: { ...measure.params }, supports: [...measure.supports] })) } : plan;
        }),
      }));
      persistRuntime();
    },
    confirmPlanCandidate: (planId, version) => {
      const plan = get().plans.find((item) => item.id === planId && item.version === version);
      const candidate = plan?.candidates?.find((item) => item.id === plan.selectedCandidateId);
      if (!plan || !candidate || plan.decisionConfirmedAt) return;
      // 候选方案的比较时间不应侵占措施人工确认时限；策略确认后才开始控制/预测措施的计时。
      const confirmedAt = Date.now();
      set((state) => ({
        plans: state.plans.map((item) => item.id === planId && item.version === version
          ? {
              ...item,
              decisionConfirmedAt: confirmedAt,
              decisionConfirmedSimSec: state.simSec,
              measures: item.measures.map((measure) => measure.runState === '待确认' && measure.tier !== '实况类'
                ? { ...measure, shownAtMs: confirmedAt }
                : measure),
            }
          : item),
      }));
      pushAudit('预案确认', `确认策略 ${candidate.label}，进入措施确认队列`, { planId, version });
      persistRuntime();
    },
    setForcedInterrupt: (measureId) => set({ forcedInterrupt: measureId }),
    selectStep: (stepId) => {
      if (stepId == null) {
        set({ activeStepId: null, highlight: EMPTY_HL, tracePlayback: EMPTY_TRACE_PLAYBACK });
        return;
      }
      const step = get().trace.find((t) => t.id === stepId);
      if (!step) return;
      if (get().activeStepId === stepId) {
        set({ activeStepId: null, highlight: EMPTY_HL, tracePlayback: EMPTY_TRACE_PLAYBACK });
        return;
      }
      set({ activeStepId: stepId, highlight: highlightFromStep(step), tracePlayback: EMPTY_TRACE_PLAYBACK });
    },
    startTracePlayback: (stepId) => {
      const step = get().trace.find((item) => item.id === stepId);
      if (!step) return;
      const path = tracePathForStep(step);
      set({
        activeStepId: stepId,
        highlight: highlightFromStep(step),
        tracePlayback: { stepId, nodeIndex: 0, status: path.length > 0 ? 'playing' : 'complete' },
      });
    },
    toggleTracePlayback: () => set((s) => {
      if (!s.tracePlayback.stepId) return s;
      if (s.tracePlayback.status === 'complete') {
        return { tracePlayback: { ...s.tracePlayback, nodeIndex: 0, status: 'playing' } };
      }
      return {
        tracePlayback: {
          ...s.tracePlayback,
          status: s.tracePlayback.status === 'playing' ? 'paused' : 'playing',
        },
      };
    }),
    pauseTracePlayback: () => set((s) => ({
      tracePlayback: s.tracePlayback.stepId
        ? { ...s.tracePlayback, status: 'paused' }
        : s.tracePlayback,
    })),
    advanceTracePlayback: () => set((s) => {
      const playback = s.tracePlayback;
      if (!playback.stepId || playback.status !== 'playing') return s;
      const step = s.trace.find((item) => item.id === playback.stepId);
      if (!step) return { tracePlayback: EMPTY_TRACE_PLAYBACK };
      const lastIndex = Math.max(0, tracePathForStep(step).length - 1);
      if (playback.nodeIndex >= lastIndex) {
        return { tracePlayback: { ...playback, nodeIndex: lastIndex, status: 'complete' } };
      }
      const nextIndex = playback.nodeIndex + 1;
      return {
        tracePlayback: {
          ...playback,
          nodeIndex: nextIndex,
          status: nextIndex >= lastIndex ? 'complete' : 'playing',
        },
      };
    }),
    previousTraceNode: () => set((s) => {
      const playback = s.tracePlayback;
      if (!playback.stepId) return s;
      const step = s.trace.find((item) => item.id === playback.stepId);
      if (!step) return s;
      return {
        tracePlayback: {
          ...playback,
          nodeIndex: Math.max(0, playback.nodeIndex - 1),
          status: 'paused',
        },
      };
    }),
    nextTraceNode: () => set((s) => {
      const playback = s.tracePlayback;
      if (!playback.stepId) return s;
      const step = s.trace.find((item) => item.id === playback.stepId);
      if (!step) return s;
      const lastIndex = Math.max(0, tracePathForStep(step).length - 1);
      const nextIndex = Math.min(lastIndex, playback.nodeIndex + 1);
      return {
        tracePlayback: {
          ...playback,
          nodeIndex: nextIndex,
          status: nextIndex >= lastIndex ? 'complete' : 'paused',
        },
      };
    }),
    restartTracePlayback: () => set((s) => {
      if (!s.tracePlayback.stepId) return s;
      const step = s.trace.find((item) => item.id === s.tracePlayback.stepId);
      if (!step) return s;
      const path = tracePathForStep(step);
      return {
        tracePlayback: {
          ...s.tracePlayback,
          nodeIndex: 0,
          status: path.length > 0 ? 'playing' : 'complete',
        },
      };
    }),

    confirmMeasure: (planId, version, measureId) => {
      const target = get().plans.find((plan) => plan.id === planId && plan.version === version);
      if (target?.candidates?.length && !target.decisionConfirmedAt) return;
      set((s) => ({
        plans: s.plans.map((pl) => {
          if (pl.id !== planId || pl.version !== version) return pl;
          const measures = pl.measures.map((m) => {
            if (m.id !== measureId || m.runState !== '待确认') return m;
            const shownAtMs = Number.isFinite(m.shownAtMs) ? m.shownAtMs : Date.now();
            const eventId = planId.replace(/^PLAN-/, '');
            return {
              ...m,
              runState: '已下发' as MeasureRunState,
              confirmMs: Math.max(0, Date.now() - shownAtMs),
              confirmSimSec: s.simSec,
              dispatch: buildMeasureDispatch(m, s.events.find((event) => event.id === eventId), s.environment, s.simSec),
            };
          });
          const pending = measures.filter((m) => m.runState === '待确认');
          const anyIssued = measures.some((m) => m.runState === '已下发');
          const state: PlanState = pending.length === 0 ? '已下发' : anyIssued ? '已确认' : pl.state;
          return { ...pl, measures, state };
        }),
      }));
      pushAudit('措施确认', `确认措施 ${measureId}`, { planId, version });
      persistRuntime();
    },

    ingestEvent: (input) => {
      const s = get();
      const seq = s.runtimeSeq + 1;
      const newEventId = `EV-R${String(seq).padStart(3, '0')}`;
      const result = ingestReport(input, {
        events: s.events,
        resourceOccupancy: s.resourceOccupancy,
        environment: s.environment,
        simSec: s.simSec,
        sceneBaseSec: s.sceneBaseSec,
        newEventId,
      });
      pushAudit('事件接入', `接入 ${input.sourceKind}：${input.road} K${input.accidentKp} ${input.label}`);
      if (result.kind === 'merged') {
        set((st) => ({
          events: st.events.map((e) => (e.id === result.targetId ? { ...e, ...result.patch } : e)),
          mergeInfo: {
            targetId: result.targetId,
            sources: [input.sourceKind],
            scoreRows: result.decision.scoreRows,
            total: result.decision.total,
            decision: result.decision.decision,
          },
        }));
        pushAudit('事件归并', `${input.sourceKind} 高置信并入 ${result.targetId}（总分 ${result.decision.total.toFixed(2)}）`, {
          eventId: result.targetId,
          payload: { scoreRows: result.decision.scoreRows },
        });
      } else {
        set((st) => ({
          events: [...st.events, result.event],
          trace: [...st.trace, ...result.trace],
          calcs: [...st.calcs, ...result.calcs],
          plans: [...st.plans, result.plan],
          activePlanVersion: result.plan.version,
          activeConditions: result.conditions,
          runtimeSeq: seq,
          focusedEventId: st.focusedEventId ?? result.event.id,
        }));
        pushAudit('推理批次', `${newEventId} 五步推理产出 ${result.trace.length} 步`, { eventId: newEventId });
        pushAudit('预案生成', `${newEventId} V1 管控预案生成（${result.plan.measures.length} 项措施）`, {
          eventId: newEventId,
          planId: result.plan.id,
          version: 1,
        });
        if (result.caseLinkGroup) pushAudit('事件归并', `中置信并案标记 ${result.caseLinkGroup}，两事件独立跟踪`, { eventId: newEventId });
        if (result.conflict?.status === 'conflict') pushAudit('推理批次', `分流冲突自动裁剪：${result.conflict.reason}`, { eventId: newEventId });
        if (result.selfReference?.selfReference) pushAudit('推理批次', `自引用检测命中：${result.selfReference.recommendation}`, { eventId: newEventId });
        requestPlanAiNarrative(result.event, result.plan, result.conditions);
        // 规则推理和交通流计算已完成，后台自动生成事件级综合研判。
        requestTraceAiExplanation(result.event, result.trace, result.calcs);
      }
      persistRuntime();
    },

    loadDemoCase: (demoCase) => {
      // 案例加载是演示入口：先清空旧运行库，再按脚本顺序走统一事件接入管道。
      get().clearRuntime();
      set({
        sceneBaseSec: demoCase.sceneBaseSec,
        simSec: 0,
        running: false,
        environment: demoCase.environment,
      });

      for (const item of demoCase.events) {
        set({ simSec: item.simSec });
        get().ingestEvent(item.input);
        const eventId = get().events.at(-1)?.id;
        if (eventId && item.occupyResources?.length) {
          set((state) => ({
            resourceOccupancy: item.occupyResources!.reduce<Record<string, string>>(
              (occupancy, resourceId) => ({ ...occupancy, [resourceId]: eventId }),
              state.resourceOccupancy,
            ),
          }));
        }
      }

      const scriptedEventId = demoCase.twinScript
        ? get().events[demoCase.twinScript.eventIndex]?.id
        : undefined;
      const scriptStartSec = demoCase.twinScript?.phases[0]?.atSimSec;
      set({
        simSec: scriptStartSec ?? demoCase.finalSimSec ?? demoCase.events.at(-1)?.simSec ?? 0,
        running: false,
        activeDemoTwin: demoCase.twinScript && scriptedEventId
          ? { eventId: scriptedEventId, eventIds: get().events.map((event) => event.id), script: demoCase.twinScript }
          : undefined,
      });
      pushAudit('演示案例', `加载${demoCase.title}：${demoCase.summary}`);
      persistRuntime();
    },

    setEnvironment: (env) => {
      set({ environment: env });
      persistRuntime();
    },

    rejectMeasure: (planId, version, measureId, reason) => {
      set((st) => ({
        plans: st.plans.map((pl) => pl.id === planId && pl.version === version
          ? { ...pl, measures: pl.measures.map((m) => (m.id === measureId ? { ...m, rejectReason: reason } : m)) }
          : pl),
      }));
      pushAudit('措施打回', `打回措施 ${measureId}：${reason}`, { planId, version });
      persistRuntime();
    },

    voidPlan: (planId, reason) => {
      set((st) => {
        const target = st.plans.filter((p) => p.id === planId && isActivePlan(p)).at(-1);
        if (!target) return {};
        return {
          plans: st.plans.map((p) => p.id === planId && p.version === target.version
            ? { ...p, state: '已作废' as PlanState, voidReason: reason, archived: true }
            : p),
        };
      });
      pushAudit('预案作废', `作废预案 ${planId}：${reason}`, { planId });
      persistRuntime();
    },

    falsifyEvent: (eventId, reason) => {
      set((st) => {
        const events = st.events.map((e) => (e.id === eventId ? { ...e, falsePositive: true, finalized: true } : e));
        const plans = st.plans.map((pl) => pl.id === `PLAN-${eventId}` && pl.state !== '已完成'
          ? { ...pl, state: '已作废' as PlanState, voidReason: `事件证伪：${reason}`, archived: true }
          : pl);
        return {
          events,
          plans,
          focusedEventId: st.focusedEventId === eventId ? nextFocusedEventId(events, plans, st.simSec) : st.focusedEventId,
        };
      });
      pushAudit('事件证伪', `事件 ${eventId} 证伪 → 作废预案并归档：${reason}`, { eventId });
      persistRuntime();
    },

    clearRuntime: () => {
      persistence.clearPersistence();
      escalatedAudited.clear();
      set({ ...emptyRuntimeState(), audit: [] });
    },

    submitProgressReport: (eventId, input) => {
      const s = get();
      const event = s.events.find((item) => item.id === eventId && !item.finalized && !item.falsePositive);
      const previous = s.plans.filter((item) => item.id === `PLAN-${eventId}` && isActivePlan(item)).at(-1);
      if (!event || !previous) return;

      const changes = Object.fromEntries(Object.entries(input.changes).filter(([, value]) => value !== undefined)) as EventProgressReport['changes'];
      const sequence = (event.progressReports?.length ?? 0) + 1;
      const reportId = `R-${eventId}-${String(sequence).padStart(3, '0')}`;
      const now = Date.now();
      const flow = computeFlow({
        eventId,
        accidentKp: event.accidentKp,
        lanesTotal: event.lanesTotal,
        lanesClosed: changes.lanesClosed ?? event.lanesClosed,
        q: changes.q ?? event.q,
        vf: event.vf,
      });
      const nextEvent: SimEvent = {
        ...event,
        ...changes,
        congested: flow.congested,
        w: flow.w,
      };
      nextEvent.severity = assessSeverity({
        lanesTotal: nextEvent.lanesTotal,
        lanesClosed: nextEvent.lanesClosed,
        casualties: nextEvent.casualties,
        hazmat: nextEvent.hazmat,
        inTunnel: tunnelAt(nextEvent.road, nextEvent.accidentKp) != null,
        congested: nextEvent.congested,
      }).level;

      const materiallyChanged = Object.keys(changes).some((key) => event[key as keyof SimEvent] !== changes[key as keyof EventProgressReport['changes']]);
      const report: EventProgressReport = {
        id: reportId,
        eventId,
        sequence,
        kind: input.kind,
        submittedSimSec: s.simSec,
        reporter: input.reporter,
        source: input.source,
        description: input.description,
        changes,
      };

      if (!materiallyChanged) {
        set((state) => ({
          events: state.events.map((item) => item.id === eventId
            ? { ...item, progressReports: [...(item.progressReports ?? []), report] }
            : item),
        }));
        pushAudit(input.kind === '订正续报' ? '续报订正' : '人工续报', `${eventId} 提交 ${input.kind} ${reportId}（仅补充描述）`, { eventId, payload: { report } });
        persistRuntime();
        return;
      }

      const tunnel = tunnelAt(nextEvent.road, nextEvent.accidentKp);
      const fogBand = s.environment.fogBands.find((band) => band.road === nextEvent.road && band.toKp >= nextEvent.accidentKp - 10 && band.fromKp <= nextEvent.accidentKp + 2);
      const executablePoints = DEVICES.filter((device) => device.kind === 'vms' && device.road === nextEvent.road && device.online).map((device) => ({ id: device.id, kp: device.kp }));
      const reason = runReasoning({
        eventId,
        road: nextEvent.road,
        accidentKp: nextEvent.accidentKp,
        lanesTotal: nextEvent.lanesTotal,
        lanesClosed: nextEvent.lanesClosed,
        q: nextEvent.q,
        vf: nextEvent.vf,
        typeNodeId: nextEvent.typeNodeId,
        eventLabel: nextEvent.label,
        casualties: nextEvent.casualties,
        hazmat: nextEvent.hazmat,
        tunnel: tunnel ? { fromKp: tunnel.fromKp, toKp: tunnel.toKp } : undefined,
        fogBand: fogBand ? { fromKp: fogBand.fromKp, toKp: fogBand.toKp } : undefined,
        wind: nextEvent.wind,
        spillLighterThanAir: nextEvent.spillLighterThanAir,
        executablePoints,
      });
      const version = previous.version + 1;
      const generated = buildPlanV1(nextEvent, reason.measures);
      const previousMeasures = new Map(previous.measures.map((measure) => [measure.measureId, measure]));
      const nextMeasures: PlanMeasure[] = generated.measures.map((measure, index) => {
        const old = previousMeasures.get(measure.measureId);
        return {
          ...measure,
          id: `${eventId}-V${version}-${old ? 'I' : 'N'}${index + 1}`,
          diff: old ? '继承' : '新增',
          runState: old?.runState ?? measure.runState,
          shownAtMs: old?.shownAtMs ?? now,
          confirmMs: old?.confirmMs,
          confirmSimSec: old?.confirmSimSec,
        };
      });
      previous.measures.filter((measure) => !nextMeasures.some((candidate) => candidate.measureId === measure.measureId)).forEach((measure, index) => {
        nextMeasures.push({
          ...measure,
          id: `${eventId}-V${version}-R${index + 1}`,
          title: `撤销：${measure.title}`,
          diff: '撤销',
          runState: '待确认',
          shownAtMs: now,
          confirmMs: undefined,
          confirmSimSec: undefined,
        });
      });
      const newPlan: Plan = {
        ...generated,
        version,
        label: `V${version} 管控预案 · 基于续报 ${reportId}`,
        measures: nextMeasures,
        candidates: buildPlanCandidates(nextEvent, nextMeasures),
        selectedCandidateId: 'A',
      };
      report.triggeredPlanVersion = version;
      const changedFields = Object.keys(changes).join('、');
      set((state) => ({
        events: state.events.map((item) => item.id === eventId
          ? { ...nextEvent, progressReports: [...(item.progressReports ?? []), report] }
          : item),
        plans: [
          ...state.plans.map((plan) => plan.id === previous.id && plan.version === previous.version ? { ...plan, state: '已被替换' as PlanState } : plan),
          newPlan,
        ],
        trace: [...state.trace, {
          id: `T-${eventId}-REPORT-${sequence}`,
          eventId,
          phase: '推演',
          title: `${input.kind} ${reportId}：${changedFields} 发生变化，重新研判`,
          dataSources: ['事件快照', '本面板', '规则'],
          conclusion: `已基于 ${reportId} 生成 V${version} 管控预案，共 ${nextMeasures.length} 项措施。`,
          specRef: '运行模式·人工续报联动',
        }],
        calcs: [...state.calcs, ...reason.calcs.map((calc) => ({ ...calc, id: `${calc.id}-R${sequence}` }))],
        activePlanVersion: version,
      }));
      pushAudit(input.kind === '订正续报' ? '续报订正' : '人工续报', `${eventId} 提交 ${input.kind} ${reportId}：${changedFields}`, { eventId, payload: { report } });
      pushAudit('预案生成', `${eventId} 基于 ${reportId} 生成 V${version} 管控预案（${nextMeasures.length} 项措施）`, { eventId, planId: newPlan.id, version });
      requestPlanAiNarrative(nextEvent, newPlan, s.activeConditions);
      persistRuntime();
    },

    reviseEventFacts: (eventId, retractedFacts, note) => {
      const s = get();
      const planId = `PLAN-${eventId}`;
      const prev = s.plans.filter((p) => p.id === planId && isActivePlan(p)).at(-1);
      const event = s.events.find((e) => e.id === eventId);
      if (!prev || !event) return;

      const tmsMeasures: TmsMeasure[] = prev.measures.map((m) => ({
        measureId: m.measureId,
        title: m.title,
        supports: m.facts ?? [],
        degradeInsteadOfRevoke: m.measureId === 'M_全封',
        degradeLabel: m.measureId === 'M_全封' ? '降级为封闭 2 车道 + 限速 40km/h' : undefined,
      }));
      const results = propagateRetraction(tmsMeasures, retractedFacts);
      const now = Date.now();
      const resultOf = (measureId: string) => results.find((r) => r.measureId === measureId);
      const measures: PlanMeasure[] = prev.measures.map((m, i) => {
        const outcome = resultOf(m.measureId)?.outcome ?? '保留';
        if (outcome === '撤销') {
          return {
            ...m,
            id: `${eventId}-V${prev.version + 1}-R${i + 1}`,
            diff: '撤销' as DiffStatus,
            title: `撤销：${m.title}`,
            runState: '待确认' as MeasureRunState,
            shownAtMs: now,
            confirmMs: undefined,
          };
        }
        if (outcome === '降级') {
          const reason = resultOf(m.measureId)?.reason ?? '';
          return {
            ...m,
            id: `${eventId}-V${prev.version + 1}-D${i + 1}`,
            diff: '降级' as DiffStatus,
            summary: `${m.summary}；${reason}`,
            runState: '待确认' as MeasureRunState,
            shownAtMs: now,
            confirmMs: undefined,
          };
        }
        return {
          ...m,
          id: `${eventId}-V${prev.version + 1}-I${i + 1}`,
          diff: '继承' as DiffStatus,
          shownAtMs: m.runState === '待确认' ? now : m.shownAtMs,
          confirmMs: m.runState === '待确认' ? undefined : m.confirmMs,
        };
      });
      const newPlan: Plan = {
        id: planId,
        version: prev.version + 1,
        label: `V${prev.version + 1} 属性修正`,
        state: '待确认',
        responsible: prev.responsible,
        confidence: prev.confidence,
        measures,
        candidates: buildPlanCandidates(event, measures),
        selectedCandidateId: 'A',
      };
      const summaryLine = results.map((r) => `${r.title}→${r.outcome}`).join('；');
      const reportSequence = (event.progressReports?.length ?? 0) + 1;
      const correctiveReport: EventProgressReport = {
        id: `R-${eventId}-${String(reportSequence).padStart(3, '0')}`,
        eventId,
        sequence: reportSequence,
        kind: '订正续报',
        submittedSimSec: s.simSec,
        reporter: '本机值班席',
        source: '现场核实',
        description: note,
        changes: {
          ...(retractedFacts.includes('F_泄漏') ? { hazmat: false } : {}),
          ...(retractedFacts.includes('F_伤亡') ? { casualties: 0 } : {}),
        },
        triggeredPlanVersion: newPlan.version,
      };
      set((st) => {
        const hazmatRetracted = retractedFacts.includes('F_泄漏');
        const casualtyRetracted = retractedFacts.includes('F_伤亡');
        return {
          tms: results,
          plans: [
            ...st.plans.map((p) => p.id === planId && p.version === prev.version ? { ...p, state: '已被替换' as PlanState } : p),
            newPlan,
          ],
          activePlanVersion: newPlan.version,
          events: st.events.map((e) => {
            if (e.id !== eventId) return e;
            const hazmat = hazmatRetracted ? false : e.hazmat;
            const casualties = casualtyRetracted ? 0 : e.casualties;
            const severity = assessSeverity({
              lanesTotal: e.lanesTotal,
              lanesClosed: e.lanesClosed,
              casualties,
              hazmat,
              inTunnel: tunnelAt(e.road, e.accidentKp) != null,
              congested: e.congested,
            });
            return { ...e, hazmat, casualties, severity: severity.level, progressReports: [...(e.progressReports ?? []), correctiveReport] };
          }),
          trace: [...st.trace, {
            id: `T-${eventId}-REVISE-${now}`,
            eventId,
            phase: '撤销传导',
            title: `属性修正：撤回 ${retractedFacts.join('、')} → ${note}`,
            dataSources: ['规则'],
            conclusion: summaryLine,
            specRef: '附录A·案例四 / §5.3',
          }],
        };
      });
      pushAudit('续报订正', `${eventId} 提交订正续报 ${correctiveReport.id}：${note}`, { eventId, payload: { report: correctiveReport } });
      pushAudit('版本流转', `${eventId} 基于订正续报生成 V${prev.version + 1} 管控预案（${summaryLine}）：${note}`, {
        eventId,
        planId,
        version: prev.version + 1,
      });
      persistRuntime();
    },

    noteOverdueEscalation: (measureId, title) => {
      if (escalatedAudited.has(measureId)) return;
      escalatedAudited.add(measureId);
      pushAudit('超时升级', `控制类措施「${title}」确认超时 → 逐级升级通知值班长`);
      pushAudit('最小安全动作', `持续超时：仅自动执行实况类与联动提醒，控制类维持待确认（${title}）`);
      persistRuntime();
    },

    requestTraceExplanation: requestTraceAiExplanationByEvent,
    requestTwinNarrative: requestTwinAiNarrative,
  };
});

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __store?: typeof useStore }).__store = useStore;
}
