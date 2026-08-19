import { useMemo, type ReactNode } from 'react';
import type { SimEvent } from '../domain/event';

interface TwinNarrativePanelProps {
  event?: SimEvent;
}

function formatRealClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false });
}

function riskClass(level: '高' | '中' | '低'): string {
  if (level === '高') return 'border-[var(--color-danger)] bg-[var(--color-danger-50)] text-[var(--color-danger)]';
  if (level === '中') return 'border-[var(--color-warn)] bg-[var(--color-warn-50)] text-[var(--color-warn)]';
  return 'border-[var(--color-pass-100)] bg-[var(--color-pass-50)] text-[var(--color-pass)]';
}

function BriefSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--color-brand-200)] pt-1.5">
      <h3 className="text-[9px] font-semibold text-[var(--color-brand-700)]">{title}</h3>
      <div className="mt-0.5 text-[9px] leading-4 text-[var(--color-ink)]">{children}</div>
    </section>
  );
}

/** 事件全量态势简报：兼容历史旧版叙事记录。 */
export default function TwinNarrativePanel({ event }: TwinNarrativePanelProps) {
  const history = useMemo(() => {
    if (!event) return [];
    if (event.aiTwinNarrativeHistory?.length) return event.aiTwinNarrativeHistory;
    return event.aiTwinNarrative ? [event.aiTwinNarrative] : [];
  }, [event]);
  const latest = history.at(-1);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] text-[var(--color-ink)]" data-testid="twin-ai-narrative">
      <header className="flex h-[48px] shrink-0 items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-[var(--color-ink)]">
            <span aria-hidden="true" className="arco-icon text-[var(--color-brand-700)]">◉</span>
            <span>事件实时态势感知</span>
          </div>
          <div className="mt-0.5 truncate text-[9px] text-[var(--color-ink-soft)]">{event ? `${event.id} · ${event.road} K${event.accidentKp}` : '请选择左侧事件进入事件孪生视角'}</div>
        </div>
        <div className="shrink-0 text-right text-[8px] text-[var(--color-ink-soft)]">
          <div className="text-[var(--color-brand-700)]">每30秒更新</div>
          <div>{latest?.model ?? event?.aiTwinNarrative?.model ?? 'Qwen'}{history.length ? ` · ${history.length}个时间片` : ''}</div>
        </div>
      </header>

      {!event ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-[11px] leading-5 text-[var(--color-ink-soft)]">聚焦一个事件并进入“事件孪生”，这里将按时间片展示完整态势简报。</div>
      ) : (
        <>
          {event.aiTwinStatus?.status === 'pending' && (
            <div className="border-b border-[var(--color-line)] bg-[var(--color-brand-50)] px-3 py-1.5 text-[9px] text-[var(--color-brand-700)]">正在生成最新态势简报…</div>
          )}

          {latest ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
              <article className="border-l-2 border-[var(--color-brand)] pl-3">
                <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[8px] text-[var(--color-ink-soft)]">
                  <span>最新时间片</span>
                  <span>生成 {formatRealClock(latest.generatedAt)}</span>
                  <span className="rounded bg-[var(--color-brand-50)] px-1 text-[var(--color-brand-700)]">指挥简报</span>
                </div>
                <div className="space-y-1.5 rounded border border-[var(--color-brand-200)] bg-[var(--color-brand-50)] px-2.5 py-2">
                  <div className="text-[10px] font-semibold leading-4 text-[var(--color-ink)]">{latest.headline}</div>
                  <div className="rounded border border-[var(--color-brand-200)] bg-white/70 px-2 py-1 text-[9px] font-medium leading-4 text-[var(--color-ink)]">
                    {latest.commandConclusion ?? latest.situation ?? '待生成指挥结论'}
                  </div>

                  <BriefSection title="事件概况">
                    {latest.eventOverview ?? latest.situation ?? '暂无事件概况'}
                  </BriefSection>

                  {latest.trafficImpact ? (
                    <BriefSection title={`交通影响 · ${latest.trafficImpact.overallLevel}`}>
                      <div>上游：{latest.trafficImpact.upstream}</div>
                      <div>事故点：{latest.trafficImpact.incidentPoint}</div>
                      <div>下游：{latest.trafficImpact.downstream}</div>
                    </BriefSection>
                  ) : (
                    <BriefSection title="交通影响">{latest.trafficDynamics ?? '暂无交通影响研判'}</BriefSection>
                  )}

                  {latest.responseProgress?.length ? (
                    <BriefSection title="处置进展">
                      <ul className="space-y-1">
                        {latest.responseProgress.map((item, index) => (
                          <li key={`${item.measure}-${index}`}>
                            <span className="mr-1 rounded border border-[var(--color-brand-200)] bg-white px-1 text-[8px] text-[var(--color-brand-700)]">{item.status}</span>
                            <span className="font-medium">{item.measure}</span>：{item.detail}
                          </li>
                        ))}
                      </ul>
                    </BriefSection>
                  ) : latest.operationalFocus ? (
                    <BriefSection title="处置进展">{latest.operationalFocus}</BriefSection>
                  ) : null}

                  {latest.risks?.length ? (
                    <BriefSection title="风险提示">
                      <ul className="space-y-1">
                        {latest.risks.map((item, index) => (
                          <li key={`${item.level}-${index}`}>
                            <span className={`mr-1 rounded border px-1 text-[8px] ${riskClass(item.level)}`}>{item.level}风险</span>{item.content}
                          </li>
                        ))}
                      </ul>
                    </BriefSection>
                  ) : null}

                  {latest.nextFocus?.length ? (
                    <BriefSection title="下一步关注">
                      <ul className="space-y-1">
                        {latest.nextFocus.map((item, index) => (
                          <li key={`${item.timeWindow}-${index}`}><span className="font-medium">{item.timeWindow}</span>：{item.action}（触发条件：{item.trigger}）</li>
                        ))}
                      </ul>
                    </BriefSection>
                  ) : null}

                  <div className="border-t border-[var(--color-brand-200)] pt-1 text-[8px] leading-3.5 text-[var(--color-ink-soft)]">数据说明：{latest.confidenceNote}</div>
                </div>
              </article>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
              <article className="rounded border border-[var(--color-warn-100)] bg-[var(--color-warn-50)] px-2.5 py-2 text-[9px] leading-4 text-[var(--color-ink)]">
                <div className="font-semibold text-[var(--color-warn)]">本地规则态势简报</div>
                <div className="mt-0.5 text-[8px] text-[var(--color-ink-soft)]">AI 简报暂不可用，已使用当前事件和交通模型快照兜底展示。</div>
                {event.aiTwinStatus?.reason && <div className="mt-1 rounded bg-white/70 px-1.5 py-1 text-[8px] text-[var(--color-ink-soft)]">AI 调用信息：{event.aiTwinStatus.reason}</div>}
                <div className="mt-2 space-y-1.5 border-t border-[var(--color-warn-100)] pt-1.5">
                  <BriefSection title="事件概况">{event.road} K{event.accidentKp} 发生{event.label}，当前占用 {event.lanesClosed}/{event.lanesTotal} 条车道。</BriefSection>
                  <BriefSection title="交通影响">当前断面流量 {event.q} veh/h，{event.congested ? '交通拥堵已形成，需持续关注上游队尾变化。' : '当前未形成持续拥堵，保持监测。'}</BriefSection>
                  <BriefSection title="处置重点">优先核实现场占道与设备状态；已确认措施以统一处置时序的下发回执为准。</BriefSection>
                  <BriefSection title="数据说明">该简报来自本地模拟事件与交通模型，不替代现场实况和人工复核。</BriefSection>
                </div>
              </article>
            </div>
          )}
        </>
      )}
    </section>
  );
}
