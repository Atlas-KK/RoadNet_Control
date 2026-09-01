import { useState } from 'react';
import type { MonitoringListItem } from '../selectors';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
} from '../selectors';
import { selectCurrentSimulatedUser, useMonitoringStore } from '../store';
import { hasMonitoringPermission } from '../permissions';
import type { MonitoringDrawerTab } from '../uiState';
import VerificationPanel from './VerificationPanel';
import { evaluateHandoffDecision } from '../engine/handoffRules';

interface MonitoringEventDrawerProps {
  item: MonitoringListItem;
  activeTab: MonitoringDrawerTab;
  onTabChange: (tab: MonitoringDrawerTab) => void;
  onClose: () => void;
  onOpenIntelligentControl: (controlEventId: string) => void;
}

const DRAWER_TABS: readonly { id: MonitoringDrawerTab; label: string }[] = [
  { id: 'video', label: '视频核实' },
  { id: 'alarms', label: '关联告警' },
  { id: 'event', label: '事件信息' },
  { id: 'verification_history', label: '核实记录' },
  { id: 'control', label: '关联处置' },
];

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无';
}

function directionLabel(direction: MonitoringListItem['event']['location']['direction']): string {
  return direction === 'up' ? '上行' : direction === 'down' ? '下行' : '方向未知';
}

function lifecycleLabel(status: MonitoringListItem['event']['lifecycleStatus']): string {
  return {
    monitoring: '持续监测', pending_handoff: '待接管', handoff_in_progress: '接管中', taken_over: '已接管',
    handoff_failed: '接管失败', resolved: '已解除', closed: '已关闭',
  }[status];
}

function AlarmList({ item }: { item: MonitoringListItem }) {
  return item.alarms.length ? (
    <div className="monitoring-alarm-list">
      {item.alarms.map((alarm, index) => (
        <article key={alarm.alarmId} className="monitoring-alarm-row arco-surface-subtle">
          <div><span className="step-index">{index + 1}</span><strong>{alarm.alarmId}</strong><span className="arco-tag">{alarm.simulation ? '模拟' : '业务数据'}</span></div>
          <dl>
            <div><dt>来源系统</dt><dd>{alarm.sourceSystem}</dd></div>
            <div><dt>来源告警ID</dt><dd>{alarm.sourceAlarmId}</dd></div>
            <div><dt>检测时间</dt><dd>{formatDate(alarm.detectedAt)}</dd></div>
            <div><dt>AI置信度</dt><dd>{alarm.confidence === undefined ? '暂无' : `${Math.round(alarm.confidence * 100)}%`}</dd></div>
            <div><dt>证据数量</dt><dd>{alarm.evidenceIds.length}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  ) : <div className="monitoring-drawer-empty">暂无关联告警</div>;
}

function EventInformation({ item }: { item: MonitoringListItem }) {
  const { event } = item;
  return (
    <dl className="monitoring-event-information">
      <div><dt>事件编号</dt><dd>{event.monitoringEventId}</dd></div>
      <div><dt>事件类型</dt><dd>{MONITORING_EVENT_TYPE_LABELS[event.eventType]}</dd></div>
      <div><dt>AI建议等级</dt><dd>{MONITORING_LEVEL_LABELS[event.suggestedLevel]}</dd></div>
      <div><dt>人工确认等级</dt><dd>{event.confirmedLevel ? MONITORING_LEVEL_LABELS[event.confirmedLevel] : '尚未确认'}</dd></div>
      <div><dt>核实状态</dt><dd>{VERIFICATION_STATUS_LABELS[event.verificationStatus]}</dd></div>
      <div><dt>事件状态</dt><dd>{lifecycleLabel(event.lifecycleStatus)}</dd></div>
      <div><dt>道路位置</dt><dd>{event.location.roadCode} · {directionLabel(event.location.direction)} · {event.location.kilometer === undefined ? '桩号待补充' : `K${event.location.kilometer.toFixed(1)}`}</dd></div>
      <div><dt>设施</dt><dd>{event.location.facilityId ?? '一般道路区间'}</dd></div>
      <div><dt>关联告警</dt><dd>{item.alarms.length} 条</dd></div>
      <div><dt>事件综合可信度</dt><dd>{item.eventConfidence === undefined ? '暂无' : `${Math.round(item.eventConfidence * 100)}%`}</dd></div>
      <div><dt>首次检测</dt><dd>{formatDate(event.detectedAt)}</dd></div>
      <div><dt>最近更新</dt><dd>{formatDate(event.updatedAt)}</dd></div>
    </dl>
  );
}

function ControlAssociation({ item, onOpenIntelligentControl }: {
  item: MonitoringListItem;
  onOpenIntelligentControl: (controlEventId: string) => void;
}) {
  const requestHandoff = useMonitoringStore((state) => state.requestMonitoringHandoff);
  const recordNoHandoffReason = useMonitoringStore((state) => state.recordNoHandoffReason);
  const notice = useMonitoringStore((state) => state.handoffNotice);
  const clearNotice = useMonitoringStore((state) => state.clearHandoffNotice);
  const currentUser = useMonitoringStore(selectCurrentSimulatedUser);
  const [declineReason, setDeclineReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const decision = evaluateHandoffDecision(item.event);
  const controlEventId = item.handoff?.controlEventId ?? item.event.controlEventId;
  const canRetry = hasMonitoringPermission(currentUser, 'retry_handoff');
  const completed = item.handoff?.status === 'accepted' || item.handoff?.status === 'duplicate' || item.event.lifecycleStatus === 'taken_over';

  const execute = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(undefined);
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失败'); }
    finally { setBusy(false); }
  };

  return (
    <div className="monitoring-handoff-panel">
      {notice?.eventId === item.event.monitoringEventId ? <div className="arco-alert" role="status"><strong>{notice.message}</strong></div> : undefined}
      <dl className="monitoring-event-information">
        <div><dt>接管状态</dt><dd>{completed ? '已建立关联' : item.handoff?.status === 'failed' ? '接管失败' : item.event.lifecycleStatus === 'handoff_in_progress' ? '接管中' : '尚未接管至智能管控'}</dd></div>
        <div><dt>接管编号</dt><dd>{item.handoff?.handoffId ?? item.event.handoffId ?? '尚未生成'}</dd></div>
        <div><dt>智能管控事件</dt><dd>{controlEventId ?? '待回写'}</dd></div>
        <div><dt>接管时间</dt><dd>{formatDate(item.event.takenOverAt ?? item.handoff?.requestedAt)}</dd></div>
        <div><dt>重试次数</dt><dd>{item.handoff?.retryCount ?? 0} / 3</dd></div>
        <div><dt>管控事件状态</dt><dd>{item.event.controlSummary?.eventLifecycleStatus ?? '尚未回写'}</dd></div>
        <div><dt>管控阶段</dt><dd>{item.event.controlSummary?.controlPhase ?? '尚未回写'}</dd></div>
        <div><dt>关联预案</dt><dd>{item.event.controlSummary?.planVersion ? `V${item.event.controlSummary.planVersion} · ${item.event.controlSummary.planState ?? '状态待回写'}` : '尚未回写'}</dd></div>
        <div><dt>执行摘要</dt><dd>{item.event.controlSummary?.executionProgress ?? '尚未回写'}</dd></div>
      </dl>
      {decision.reasons.length ? <section className="monitoring-handoff-reasons"><strong>接管建议依据</strong><ul>{decision.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></section> : undefined}
      {decision.blockingReasons.length && !completed ? <div className="arco-alert arco-alert-warning">{decision.blockingReasons.join('；')}</div> : undefined}
      {error ? <div className="arco-alert arco-alert-warning" role="alert">{error}</div> : undefined}
      <div className="monitoring-drawer-actions">
        {decision.eligible && !completed && (item.handoff?.status !== 'failed' || canRetry) ? <button type="button" className="arco-button arco-button-primary" disabled={busy} onClick={() => void execute(() => requestHandoff(item.event.monitoringEventId))}>{item.handoff?.status === 'failed' ? '重试接管' : '发起接管'}</button> : undefined}
        {item.handoff?.status === 'failed' && !canRetry ? <span className="arco-tag">请由监控班长重试</span> : undefined}
        {completed && controlEventId ? <button type="button" className="arco-button arco-button-primary" onClick={() => onOpenIntelligentControl(controlEventId)}>查看智能管控</button> : undefined}
        {notice?.eventId === item.event.monitoringEventId ? <button type="button" className="arco-button" onClick={clearNotice}>继续事件监测</button> : undefined}
      </div>
      {decision.eligible && decision.level === 'L3' && !completed ? (
        <div className="monitoring-handoff-decline">
          <label>暂不接管理由<textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} placeholder="L3暂不接管必须填写理由" /></label>
          <button type="button" className="arco-button" disabled={busy || !declineReason.trim()} onClick={() => void execute(async () => { await recordNoHandoffReason(item.event.monitoringEventId, declineReason); setDeclineReason(''); })}>记录暂不接管</button>
        </div>
      ) : undefined}
    </div>
  );
}
function VerificationHistory({ eventId }: { eventId: string }) {
  const auditEntries = useMonitoringStore((state) => state.monitoringAuditEntries);
  const entries = auditEntries.filter((entry) => entry.entityId === eventId).slice().reverse();
  if (!entries.length) return <div className="monitoring-drawer-empty"><strong>暂无核实记录</strong><p>仅打开详情不会建立核实占用，也不会自动生成核实记录。</p></div>;
  return (
    <div className="monitoring-alarm-list">
      {entries.map((entry) => (
        <article key={`${entry.seq ?? 'pending'}-${entry.occurredAt}-${entry.kind}`} className="monitoring-alarm-row arco-surface-subtle">
          <div><strong>{entry.summary}</strong><span className="arco-tag">审计 #{entry.seq ?? '-'}</span></div>
          <dl>
            <div><dt>操作时间</dt><dd>{formatDate(entry.occurredAt)}</dd></div>
            <div><dt>操作人</dt><dd>{entry.actorId ?? '系统'}</dd></div>
            <div><dt>记录类型</dt><dd>{entry.kind}</dd></div>
          </dl>
        </article>
      ))}
    </div>
  );
}

export default function MonitoringEventDrawer({ item, activeTab, onTabChange, onClose, onOpenIntelligentControl }: MonitoringEventDrawerProps) {
  const [fullScreen, setFullScreen] = useState(false);
  const { event } = item;
  return (
    <aside
      className={`monitoring-event-drawer ${fullScreen ? 'is-fullscreen' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={`${MONITORING_EVENT_TYPE_LABELS[event.eventType]}核实详情`}
      data-testid="monitoring-event-drawer"
    >
      <header className="monitoring-drawer-header">
        <div>
          <span className="monitoring-drawer-eyebrow">视频事件核实详情 · 打开详情不占用</span>
          <h2>{MONITORING_EVENT_TYPE_LABELS[event.eventType]} <small>{event.monitoringEventId}</small></h2>
          <div className="monitoring-drawer-tags">
            <span className={`monitoring-level-badge level-${item.displayLevel.toLowerCase()}`}>{MONITORING_LEVEL_LABELS[item.displayLevel]}</span>
            <span className="arco-tag">{VERIFICATION_STATUS_LABELS[event.verificationStatus]}</span>
            {event.simulation ? <span className="arco-tag monitoring-simulation-tag">模拟</span> : undefined}
          </div>
        </div>
        <div className="monitoring-drawer-actions">
          <button type="button" className="arco-button" aria-pressed={fullScreen} onClick={() => setFullScreen((value) => !value)}>
            <img className="arco-button-icon" src={fullScreen ? '/figma/arco/fullscreen-exit.svg' : '/figma/arco/fullscreen.svg'} alt="" aria-hidden="true" />
            {fullScreen ? '退出全屏' : '全屏查看'}
          </button>
          <button type="button" className="arco-button arco-icon-button" aria-label="关闭详情" onClick={onClose}>
            <img className="arco-button-icon" src="/figma/arco/close.svg" alt="" aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="monitoring-drawer-tabs" role="tablist" aria-label="事件详情页签">
        {DRAWER_TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} onClick={() => onTabChange(tab.id)}>{tab.label}</button>
        ))}
      </nav>

      <div className="monitoring-drawer-content">
        {activeTab === 'video' ? <VerificationPanel item={item} /> : undefined}
        {activeTab === 'alarms' ? <AlarmList item={item} /> : undefined}
        {activeTab === 'event' ? <EventInformation item={item} /> : undefined}
        {activeTab === 'verification_history' ? <VerificationHistory eventId={event.monitoringEventId} /> : undefined}
        {activeTab === 'control' ? <ControlAssociation item={item} onOpenIntelligentControl={onOpenIntelligentControl} /> : undefined}
      </div>
    </aside>
  );
}
