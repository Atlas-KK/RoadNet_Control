// ============================================================
// 预案 V1 构建（从 store 抽出，供场景 spawnEvent 与运行模式 ingest 共用）
// 由事件推理措施构建首版管控预案：占道触发 + 可能的拥堵触发措施（已在 reasoner 内 gate）。
// ============================================================

import type { SimEvent } from '../domain/event';
import type { Plan, PlanMeasure } from '../domain/plan';
import { classifyMeasure } from './review';
import type { runReasoning } from './reasoner';
import { etaMinTo, resourceById } from '../data/resources';

/**
 * 构建首版管控预案 V1。
 * @param ev 事件实例。
 * @param measures reasoner 输出的措施清单。
 * @param wreckerEtaMin 清障车 ETA（被占用时由资源链推理给出；缺省按驻点车程）。
 */
export function buildPlanV1(
  ev: SimEvent,
  measures: ReturnType<typeof runReasoning>['measures'],
  wreckerEtaMin?: number,
): Plan {
  const now = Date.now();
  const supportsOf = (measureId: string): string[] => {
    const fromCongestion = ['M_预置分流', 'M_限速', 'M_拥堵预警'].includes(measureId);
    return fromCongestion
      ? [`T-${ev.id}-04`, `T-${ev.id}-05`]
      : [`T-${ev.id}-03`, `T-${ev.id}-05`];
  };
  // 措施 → 语义事实映射（附录A·案例四撤销传导的输入）。与 supports（trace 步骤 id）
  // 是两套独立标注：supports 回答「界面点哪一步能看到依据」，facts 回答「哪个事实一旦
  // 撤回，这条措施要保留/降级/撤销」。
  const factsOf = (measureId: string): string[] => {
    switch (measureId) {
      case 'M_封车道':
      case 'M_调清障':
      case 'M_实况':
        return ['F_占道'];
      case 'M_预置分流':
      case 'M_限速':
      case 'M_拥堵预警':
        return ['F_拥堵'];
      case 'M_调消防':
        return ['F_泄漏'];
      case 'M_全封':
        return ['F_泄漏', 'F_占道'];
      case 'M_通风':
        return ['F_泄漏', 'F_隧道'];
      case 'M_调120':
        return ['F_伤亡'];
      default:
        return [];
    }
  };
  const planMeasures: PlanMeasure[] = measures.map((m, i) => {
    const tier = classifyMeasure(m.measureId);
    let resource: PlanMeasure['resource'];
    const resourceId = m.measureId === 'M_调清障'
      ? 'W-01'
      : m.measureId === 'M_调消防'
        ? ev.road === 'G65S' ? 'F-ZNS' : 'F-STA'
        : m.measureId === 'M_调120'
          ? 'A-01'
          : undefined;
    if (resourceId) {
      const assigned = resourceById(resourceId);
      if (assigned) {
        resource = {
          id: resourceId,
          etaMin: m.measureId === 'M_调清障'
            ? wreckerEtaMin ?? Math.round(etaMinTo(assigned, ev.accidentKp, undefined, ev.road))
            : Math.round(etaMinTo(assigned, ev.accidentKp, undefined, ev.road)),
        };
      }
    }
    return {
      id: `${ev.id}-V1-M${i + 1}`,
      measureId: m.measureId,
      title: m.title,
      tier,
      summary: m.summary,
      params: m.params,
      resource,
      supports: supportsOf(m.measureId),
      facts: factsOf(m.measureId),
      runState: tier === '实况类' ? '自动执行' : '待确认',
      shownAtMs: now,
    };
  });
  return {
    id: `PLAN-${ev.id}`,
    version: 1,
    label: 'V1 管控预案',
    state: '待确认',
    responsible: '路网监控指挥中心 / 交警 / 路政',
    confidence: '中高置信（规则+图谱推理，交通流模型定量）',
    measures: planMeasures,
  };
}
