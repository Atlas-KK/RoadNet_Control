// ============================================================
// 依据反向传导 / 真值维护（开发规格 §5.3 / 附录 A 案例四）
// 每条已生成措施携带 supports（支撑它的事实/依据集合）。
// 事实撤回 → 遍历所有措施：
//   supports 全失效 → 撤销（除非该措施保留残余价值 → 降级）；
//   部分失效 → 按剩余依据重跑参数模板 → 降级；
//   不受影响 → 保留。
// 支持级联：措施降级/撤销后其 produces 的派生事实同步失效（变长反向传导）。
// ============================================================

import type { TmsResult } from '../domain/tms';

export interface TmsMeasure {
  measureId: string;
  title: string;
  supports: string[];
  produces?: string; // 该措施「满效」时支撑的派生事实（如 全幅封道→长时间全幅中断）
  degradeInsteadOfRevoke?: boolean; // 依据全失效但仍有残余价值 → 降级而非撤销
  degradeLabel?: string; // 降级后的说明
}

/**
 * 对事实撤回执行反向依赖传导，输出每条措施的保留、降级或撤销结论。
 *
 * 算法持续把受影响措施产生的派生事实加入撤回集合，直到没有新增事实；
 * guard=10 是运行期防御性上限，用于阻止错误的循环依赖导致无限迭代。
 */
export function propagateRetraction(measures: TmsMeasure[], retracted: string[]): TmsResult[] {
  const retractedSet = new Set(retracted);

  // 级联到不动点：措施降级/撤销 → 其 produces 派生事实失效 → 再评估。
  let changed = true;
  let guard = 0;
  // 结论只由当前撤回集合与支持集决定，保持函数纯净以便每轮重复评估。
  const outcomeOf = (m: TmsMeasure): '保留' | '降级' | '撤销' => {
    const failed = m.supports.filter((s) => retractedSet.has(s));
    if (failed.length === 0) return '保留';
    if (failed.length === m.supports.length) return m.degradeInsteadOfRevoke ? '降级' : '撤销';
    return '降级';
  };
  while (changed && guard < 10) {
    changed = false;
    guard += 1;
    for (const m of measures) {
      const oc = outcomeOf(m);
      if (oc !== '保留' && m.produces && !retractedSet.has(m.produces)) {
        retractedSet.add(m.produces);
        changed = true;
      }
    }
  }

  return measures.map((m) => {
    const failed = m.supports.filter((s) => retractedSet.has(s));
    const outcome = outcomeOf(m);
    let reason: string;
    if (outcome === '保留') {
      reason = `依据 {${m.supports.join(', ')}} 未受影响`;
    } else if (outcome === '撤销') {
      reason = `唯一依据 {${failed.join(', ')}} 已撤回 → 撤销`;
    } else {
      const remaining = m.supports.filter((s) => !retractedSet.has(s));
      reason =
        remaining.length > 0
          ? `依据 {${failed.join(', ')}} 失效，剩 {${remaining.join(', ')}} → 重跑参数模板降级${m.degradeLabel ? '：' + m.degradeLabel : ''}`
          : `依据失效但保留残余价值 → 降级${m.degradeLabel ? '：' + m.degradeLabel : ''}`;
    }
    return { measureId: m.measureId, title: m.title, supports: m.supports, outcome, reason };
  });
}
