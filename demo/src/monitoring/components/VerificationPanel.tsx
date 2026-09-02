import { useEffect, useMemo, useState } from 'react';
import { getBrowserSessionStorage } from '../../appShellState';
import {
  MONITORING_EVENT_TYPES,
  type MonitoringEventType,
  type MonitoringLevel,
  type VerificationTask,
} from '../../domain/monitoring';
import {
  verificationRemainingMs,
  type SupervisorApproval,
  type VerificationCommand,
} from '../engine/verificationMachine';
import { findSimulatedUser, hasMonitoringPermission, type SimulatedUser } from '../permissions';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  VERIFICATION_STATUS_LABELS,
  type MonitoringListItem,
} from '../selectors';
import { SystemOperationalClock } from '../services/operationalClock';
import { selectCurrentSimulatedUser, useMonitoringStore } from '../store';
import { clearVerificationDraft, persistVerificationDraft, readVerificationDraft } from '../services/verificationDraft';
import EvidencePanel from './EvidencePanel';
import '../verification.css';

const LEVELS: readonly MonitoringLevel[] = ['L1', 'L2', 'L3', 'L4'];
const operationalClock = new SystemOperationalClock();

function useCountdown(deadline: string | undefined): number | undefined {
  const [remaining, setRemaining] = useState(() => verificationRemainingMs(deadline, operationalClock.nowMs()));
  useEffect(() => {
    const update = () => setRemaining(verificationRemainingMs(deadline, operationalClock.nowMs()));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return remaining;
}

function countdownLabel(remaining: number | undefined): string {
  if (remaining === undefined) return 'SLA将在开始核实时生成';
  const overdue = remaining < 0;
  const absoluteSeconds = Math.ceil(Math.abs(remaining) / 1_000);
  const minutes = Math.floor(absoluteSeconds / 60);
  const seconds = absoluteSeconds % 60;
  return `${overdue ? '已超时' : '剩余'} ${minutes}:${String(seconds).padStart(2, '0')}`;
}

function numericValue(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function integerValue(value: string): number | undefined {
  const parsed = numericValue(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) ? parsed : undefined;
}

function formatDate(value: string | undefined): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无';
}

function lifecycleLabel(status: MonitoringListItem['event']['lifecycleStatus']): string {
  return {
    monitoring: '持续监测', pending_handoff: '待接管', handoff_in_progress: '接管中', taken_over: '已接管',
    handoff_failed: '接管失败', resolved: '已解除', closed: '已关闭',
  }[status];
}

interface VerificationPanelProps {
  item: MonitoringListItem;
  taskOverride?: VerificationTask;
  currentUserOverride?: SimulatedUser;
}

export default function VerificationPanel({ item, taskOverride, currentUserOverride }: VerificationPanelProps) {
  const { event } = item;
  const tasks = useMonitoringStore((state) => state.verificationTasksById);
  const storeCurrentUser = useMonitoringStore(selectCurrentSimulatedUser);
  const applyCommand = useMonitoringStore((state) => state.applyVerificationCommand);
  const videoHealth = useMonitoringStore((state) => state.dependencyHealth.video);
  const storedTask = useMemo(
    () => Object.values(tasks).find((candidate) => candidate.eventId === event.monitoringEventId),
    [event.monitoringEventId, tasks],
  );
  const task = taskOverride ?? storedTask;
  const currentUser = currentUserOverride ?? storeCurrentUser;
  const draftStorage = getBrowserSessionStorage();
  const restoredDraft = useMemo(
    () => readVerificationDraft(draftStorage, event.monitoringEventId, currentUser.userId),
    [currentUser.userId, draftStorage, event.monitoringEventId],
  );
  const remaining = useCountdown(task?.nextReviewAt ?? event.nextReviewAt);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const draft = restoredDraft?.fields;
  const [eventType, setEventType] = useState<MonitoringEventType>(draft?.eventType ?? event.eventType);
  const [confirmedLevel, setConfirmedLevel] = useState<MonitoringLevel>(draft?.confirmedLevel ?? event.confirmedLevel ?? event.suggestedLevel);
  const [roadCode, setRoadCode] = useState(draft?.roadCode ?? event.location.roadCode);
  const [direction, setDirection] = useState(draft?.direction ?? event.location.direction);
  const [kilometer, setKilometer] = useState(draft?.kilometer ?? event.sourceFacts?.location?.kilometer?.toString() ?? event.location.kilometer?.toString() ?? '');
  const [lanesAffected, setLanesAffected] = useState(draft?.lanesAffected ?? event.sourceFacts?.lanesAffected?.toString() ?? '');
  const [lanesTotal, setLanesTotal] = useState(draft?.lanesTotal ?? event.sourceFacts?.lanesTotal?.toString() ?? '');
  const [vehicleCount, setVehicleCount] = useState(draft?.vehicleCount ?? event.sourceFacts?.vehicleCount?.toString() ?? '');
  const [casualties, setCasualties] = useState(draft?.casualties ?? event.sourceFacts?.casualties?.toString() ?? '');
  const [flowVehPerHour, setFlowVehPerHour] = useState(draft?.flowVehPerHour ?? event.sourceFacts?.flowVehPerHour?.toString() ?? '');
  const [speedKmh, setSpeedKmh] = useState(draft?.speedKmh ?? event.sourceFacts?.speedKmh?.toString() ?? '');
  const [hazardousMaterials, setHazardousMaterials] = useState(draft?.hazardousMaterials ?? false);
  const [reason, setReason] = useState(draft?.reason ?? '');
  const [notes, setNotes] = useState(draft?.notes ?? '');
  const draftResetState = useMemo(() => ({
    eventType: restoredDraft?.fields.eventType ?? event.eventType,
    confirmedLevel: restoredDraft?.fields.confirmedLevel ?? event.confirmedLevel ?? event.suggestedLevel,
    roadCode: restoredDraft?.fields.roadCode ?? event.location.roadCode,
    direction: restoredDraft?.fields.direction ?? event.location.direction,
    kilometer: restoredDraft?.fields.kilometer ?? event.sourceFacts?.location?.kilometer?.toString() ?? event.location.kilometer?.toString() ?? '',
    lanesAffected: restoredDraft?.fields.lanesAffected ?? event.sourceFacts?.lanesAffected?.toString() ?? '',
    lanesTotal: restoredDraft?.fields.lanesTotal ?? event.sourceFacts?.lanesTotal?.toString() ?? '',
    vehicleCount: restoredDraft?.fields.vehicleCount ?? event.sourceFacts?.vehicleCount?.toString() ?? '',
    casualties: restoredDraft?.fields.casualties ?? event.sourceFacts?.casualties?.toString() ?? '',
    flowVehPerHour: restoredDraft?.fields.flowVehPerHour ?? event.sourceFacts?.flowVehPerHour?.toString() ?? '',
    speedKmh: restoredDraft?.fields.speedKmh ?? event.sourceFacts?.speedKmh?.toString() ?? '',
    hazardousMaterials: restoredDraft?.fields.hazardousMaterials ?? false,
    reason: restoredDraft?.fields.reason ?? '',
    notes: restoredDraft?.fields.notes ?? '',
    restoredAt: restoredDraft?.savedAt,
  }), [
    event.confirmedLevel, event.eventType, event.location.direction, event.location.kilometer,
    event.location.roadCode, event.sourceFacts, event.suggestedLevel, restoredDraft,
  ]);

  const owner = task?.ownerId ? findSimulatedUser(task.ownerId) : undefined;
  const ownedByMe = task?.status === 'claimed' && task.ownerId === currentUser.userId;
  const occupiedByOther = task?.status === 'claimed' && task.ownerId !== currentUser.userId;
  const finalStatus = event.verificationStatus === 'confirmed' || event.verificationStatus === 'false_positive';
  const canVerify = hasMonitoringPermission(currentUser, 'verify_event');
  const canTransfer = hasMonitoringPermission(currentUser, 'transfer_task');

  useEffect(() => {
    // 事件或草稿切换属于表单上下文重置，不能沿用上一个事件的本地编辑状态。
    // oxlint-disable-next-line react/set-state-in-effect
    setEventType(draftResetState.eventType);
    setConfirmedLevel(draftResetState.confirmedLevel);
    setRoadCode(draftResetState.roadCode);
    setDirection(draftResetState.direction);
    setKilometer(draftResetState.kilometer);
    setLanesAffected(draftResetState.lanesAffected);
    setLanesTotal(draftResetState.lanesTotal);
    setVehicleCount(draftResetState.vehicleCount);
    setCasualties(draftResetState.casualties);
    setFlowVehPerHour(draftResetState.flowVehPerHour);
    setSpeedKmh(draftResetState.speedKmh);
    setHazardousMaterials(draftResetState.hazardousMaterials);
    setReason(draftResetState.reason);
    setNotes(draftResetState.notes);
    setNotice(draftResetState.restoredAt
      ? `已恢复${new Date(draftResetState.restoredAt).toLocaleString('zh-CN')}保存的未提交核实草稿`
      : undefined);
  }, [draftResetState]);

  useEffect(() => {
    if (!ownedByMe) return;
    persistVerificationDraft(draftStorage, {
      version: 1, eventId: event.monitoringEventId, userId: currentUser.userId, savedAt: new Date().toISOString(),
      fields: {
        eventType, confirmedLevel, roadCode, direction, kilometer, lanesAffected, lanesTotal,
        vehicleCount, casualties, flowVehPerHour, speedKmh, hazardousMaterials, reason, notes,
      },
    });
  }, [casualties, confirmedLevel, currentUser.userId, direction, draftStorage, event.monitoringEventId, eventType, flowVehPerHour, hazardousMaterials, kilometer, lanesAffected, lanesTotal, notes, ownedByMe, reason, roadCode, speedKmh, vehicleCount]);
  const approval = (permission: SupervisorApproval['permission']): SupervisorApproval | undefined => (
    hasMonitoringPermission(currentUser, permission)
      ? { approvedBy: currentUser.userId, approvedAt: '', permission }
      : undefined
  );

  const execute = async (command: VerificationCommand, success: string) => {
    setBusy(true);
    setNotice(undefined);
    try {
      const output = await applyCommand(command);
      if (command.type !== 'claim' && command.type !== 'force_transfer') {
        clearVerificationDraft(draftStorage, event.monitoringEventId, currentUser.userId);
      }
      setNotice(output.requiresSupervisorAttention ? `${success}；已连续观察两次，需班长关注` : success);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '核实操作失败');
    } finally {
      setBusy(false);
    }
  };

  const corrections = {
    eventType,
    confirmedLevel,
    location: {
      roadCode: roadCode.trim() || event.location.roadCode,
      direction,
      kilometer: numericValue(kilometer),
    },
    lanesAffected: integerValue(lanesAffected),
    lanesTotal: integerValue(lanesTotal),
    vehicleCount: integerValue(vehicleCount),
    casualties: integerValue(casualties),
    flowVehPerHour: numericValue(flowVehPerHour),
    speedKmh: numericValue(speedKmh),
    hazardousMaterials,
    notes: notes.trim() || undefined,
  };

  const isL4 = (event.confirmedLevel ?? event.suggestedLevel) === 'L4';
  const isL4Downgrade = event.suggestedLevel === 'L4' && confirmedLevel !== 'L4';

  return (
    <div className="monitoring-verification-layout">
      <div className="monitoring-verification-evidence">
        <EvidencePanel item={item} videoUnavailableReason={videoHealth.availability === 'degraded' ? videoHealth.reason : undefined} />
        <section className="monitoring-system-facts arco-surface-subtle" aria-labelledby="monitoring-system-facts-title">
          <h3 id="monitoring-system-facts-title">系统信息</h3>
          <dl>
            <div><dt>事件状态</dt><dd>{lifecycleLabel(event.lifecycleStatus)}</dd></div>
            <div><dt>所属设施</dt><dd>{event.location.facilityId ?? '一般道路区间'}</dd></div>
            <div><dt>最近更新</dt><dd>{formatDate(event.updatedAt)}</dd></div>
          </dl>
        </section>
      </div>
      <section className="verification-console arco-surface-subtle" aria-label="人工核实操作">
        <header className="verification-console-header">
          <div>
            <span>核实任务</span>
            <strong>{task?.status === 'observation' ? '持续观察' : owner ? `${owner.displayName}占用中` : finalStatus ? '核实已完成' : '待认领'}</strong>
          </div>
          {!finalStatus ? <span className={`verification-countdown ${(remaining ?? 1) < 0 ? 'is-overdue' : ''}`}>{countdownLabel(remaining)}</span> : undefined}
        </header>

        {notice ? <div className="arco-alert" role="status">{notice}</div> : undefined}

        {!finalStatus && !ownedByMe ? (
          <div className="verification-claim-actions">
            {occupiedByOther ? <p>当前占用人：<strong>{owner?.displayName ?? task?.ownerId}</strong>。提交会被版本和占用双重校验。</p> : <p>查看详情不会建立占用；点击后才创建独占核实任务。</p>}
            <div>
              {!occupiedByOther && canVerify ? (
                <button type="button" className="arco-button arco-button-primary" disabled={busy} onClick={() => execute({
                  type: 'claim', eventId: event.monitoringEventId, expectedVersion: event.version,
                }, '已开始核实')}>开始核实</button>
              ) : undefined}
              {occupiedByOther && canTransfer ? (
                <button type="button" className="arco-button arco-button-danger" disabled={busy} onClick={() => execute({
                  type: 'force_transfer', eventId: event.monitoringEventId, expectedVersion: event.version,
                  newOwnerId: currentUser.userId, reason: '班长在核实页面强制接管',
                }, '已强制转交至当前班长')}>强制转交给我</button>
              ) : undefined}
              {!canVerify ? <span className="verification-permission-hint">当前角色无核实权限</span> : undefined}
            </div>
          </div>
        ) : undefined}

        {finalStatus ? (
          <section className="verification-result" aria-labelledby="verification-result-title">
            <h3 id="verification-result-title">核实结果</h3>
            <dl>
              <div><dt>核实结论</dt><dd>{VERIFICATION_STATUS_LABELS[event.verificationStatus]}</dd></div>
              <div><dt>人工确认等级</dt><dd>{event.confirmedLevel ? MONITORING_LEVEL_LABELS[event.confirmedLevel] : '未确认等级'}</dd></div>
            </dl>
          </section>
        ) : undefined}

        {ownedByMe ? (
          <form className="verification-form" onSubmit={(formEvent) => formEvent.preventDefault()}>
            <section className="verification-form-section" aria-labelledby="verification-conclusion-title">
              <h3 id="verification-conclusion-title">核实结论</h3>
              <div className="verification-field-grid">
                <label>事件类型<select value={eventType} onChange={(change) => setEventType(change.target.value as MonitoringEventType)}>{MONITORING_EVENT_TYPES.map((type) => <option key={type} value={type}>{MONITORING_EVENT_TYPE_LABELS[type]}</option>)}</select></label>
                <label>人工确认等级<select value={confirmedLevel} onChange={(change) => setConfirmedLevel(change.target.value as MonitoringLevel)}>{LEVELS.map((level) => <option key={level} value={level}>{MONITORING_LEVEL_LABELS[level]}</option>)}</select></label>
              </div>
            </section>
            <section className="verification-form-section" aria-labelledby="verification-location-title">
              <h3 id="verification-location-title">位置订正</h3>
              <div className="verification-field-grid">
                <label>路线<input value={roadCode} onChange={(change) => setRoadCode(change.target.value)} /></label>
                <label>方向<select value={direction} onChange={(change) => setDirection(change.target.value as typeof direction)}><option value="up">上行</option><option value="down">下行</option><option value="unknown">未知</option></select></label>
                <label>桩号<input type="number" min="0" step="0.1" value={kilometer} onChange={(change) => setKilometer(change.target.value)} /></label>
              </div>
            </section>
            <section className="verification-form-section" aria-labelledby="verification-impact-title">
              <h3 id="verification-impact-title">影响范围</h3>
              <div className="verification-field-grid">
                <label>影响车道数<input type="number" min="0" step="1" value={lanesAffected} onChange={(change) => setLanesAffected(change.target.value)} /></label>
                <label>总车道数<input type="number" min="1" step="1" value={lanesTotal} onChange={(change) => setLanesTotal(change.target.value)} /></label>
                <label>涉及车辆数<input type="number" min="0" step="1" value={vehicleCount} onChange={(change) => setVehicleCount(change.target.value)} /></label>
                <label>伤亡人数<input type="number" min="0" step="1" value={casualties} onChange={(change) => setCasualties(change.target.value)} /></label>
                <label>流量（辆/小时）<input type="number" min="0" step="1" value={flowVehPerHour} onChange={(change) => setFlowVehPerHour(change.target.value)} /></label>
                <label>车速（公里/小时）<input type="number" min="0" step="0.1" value={speedKmh} onChange={(change) => setSpeedKmh(change.target.value)} /></label>
              </div>
              <label className="verification-checkbox"><input type="checkbox" checked={hazardousMaterials} onChange={(change) => setHazardousMaterials(change.target.checked)} />涉及危化品</label>
            </section>
            <section className="verification-form-section" aria-labelledby="verification-notes-title">
              <h3 id="verification-notes-title">补充说明</h3>
              <label>核实依据/等级调整原因<textarea value={reason} onChange={(change) => setReason(change.target.value)} placeholder="误报、观察及L3/L4降级时必填" /></label>
              <label>订正备注<textarea value={notes} onChange={(change) => setNotes(change.target.value)} placeholder="历史结论不会覆盖，本次内容将追加为新版本" /></label>
            </section>
            {(isL4 || isL4Downgrade) ? (
              <p className="verification-permission-hint">L4降级、误报或持续观察必须由当前登录的监控班长本人接管任务后提交。</p>
            ) : undefined}
            <div className="verification-submit-actions">
              <button type="button" className="arco-button arco-button-primary" disabled={busy} onClick={() => execute({
                type: 'confirm', eventId: event.monitoringEventId, expectedVersion: event.version,
                reason, corrections,
                supervisorApproval: isL4Downgrade ? approval('review_l4_downgrade') : undefined,
              }, '事件已确认并追加订正版本')}>确认事件</button>
              <button type="button" className="arco-button" disabled={busy} onClick={() => execute({
                type: 'observe', eventId: event.monitoringEventId, expectedVersion: event.version,
                reason, supervisorApproval: isL4 ? approval('approve_l4_observation') : undefined,
              }, '已进入持续观察并释放占用')}>持续观察</button>
              <button type="button" className="arco-button arco-button-danger" disabled={busy} onClick={() => execute({
                type: 'false_positive', eventId: event.monitoringEventId, expectedVersion: event.version,
                reason, supervisorApproval: isL4 ? approval('review_l4_false_positive') : undefined,
              }, '已判定为误报')}>判定误报</button>
              <button type="button" className="arco-button" disabled={busy} onClick={() => execute({
                type: 'release', eventId: event.monitoringEventId, expectedVersion: event.version, reason: '主动释放',
              }, '已释放核实任务')}>释放任务</button>
            </div>
          </form>
        ) : undefined}
      </section>
    </div>
  );
}
