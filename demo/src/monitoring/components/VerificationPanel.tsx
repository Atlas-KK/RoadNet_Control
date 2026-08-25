import { useEffect, useMemo, useState } from 'react';
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
import { findSimulatedUser, hasMonitoringPermission, SIMULATED_USERS, type SimulatedUser } from '../permissions';
import {
  MONITORING_EVENT_TYPE_LABELS,
  MONITORING_LEVEL_LABELS,
  type MonitoringListItem,
} from '../selectors';
import { SystemOperationalClock } from '../services/operationalClock';
import { selectCurrentSimulatedUser, useMonitoringStore } from '../store';
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
  const remaining = useCountdown(task?.nextReviewAt ?? event.nextReviewAt);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [eventType, setEventType] = useState<MonitoringEventType>(event.eventType);
  const [confirmedLevel, setConfirmedLevel] = useState<MonitoringLevel>(event.confirmedLevel ?? event.suggestedLevel);
  const [roadCode, setRoadCode] = useState(event.location.roadCode);
  const [direction, setDirection] = useState(event.location.direction);
  const [kilometer, setKilometer] = useState(event.location.kilometer?.toString() ?? '');
  const [lanesAffected, setLanesAffected] = useState('');
  const [vehicleCount, setVehicleCount] = useState('');
  const [casualties, setCasualties] = useState('');
  const [hazardousMaterials, setHazardousMaterials] = useState(false);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [supervisorId, setSupervisorId] = useState('');

  const owner = task?.ownerId ? findSimulatedUser(task.ownerId) : undefined;
  const ownedByMe = task?.status === 'claimed' && task.ownerId === currentUser.userId;
  const occupiedByOther = task?.status === 'claimed' && task.ownerId !== currentUser.userId;
  const finalStatus = event.verificationStatus === 'confirmed' || event.verificationStatus === 'false_positive';
  const canVerify = hasMonitoringPermission(currentUser, 'verify_event');
  const canTransfer = hasMonitoringPermission(currentUser, 'transfer_task');
  const supervisorOptions = SIMULATED_USERS.filter((user) => user.role === 'supervisor');

  const approval = (permission: SupervisorApproval['permission']): SupervisorApproval | undefined => (
    supervisorId ? { approvedBy: supervisorId, approvedAt: '', permission } : undefined
  );

  const execute = async (command: VerificationCommand, success: string) => {
    setBusy(true);
    setNotice(undefined);
    try {
      const output = await applyCommand(command);
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
    lanesAffected: numericValue(lanesAffected),
    vehicleCount: numericValue(vehicleCount),
    casualties: numericValue(casualties),
    hazardousMaterials,
    notes: notes.trim() || undefined,
  };

  const isL4 = (event.confirmedLevel ?? event.suggestedLevel) === 'L4';
  const isL4Downgrade = event.suggestedLevel === 'L4' && confirmedLevel !== 'L4';

  return (
    <div className="monitoring-verification-layout">
      <EvidencePanel item={item} videoUnavailableReason={videoHealth.availability === 'degraded' ? videoHealth.reason : undefined} />
      <section className="verification-console arco-surface-subtle" aria-label="人工核实操作">
        <header className="verification-console-header">
          <div>
            <span>核实任务</span>
            <strong>{task?.status === 'observation' ? '持续观察' : owner ? `${owner.displayName}占用中` : finalStatus ? '核实已完成' : '待认领'}</strong>
          </div>
          <span className={`verification-countdown ${(remaining ?? 1) < 0 ? 'is-overdue' : ''}`}>{countdownLabel(remaining)}</span>
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

        {ownedByMe ? (
          <form className="verification-form" onSubmit={(formEvent) => formEvent.preventDefault()}>
            <div className="verification-field-grid">
              <label>事件类型<select value={eventType} onChange={(change) => setEventType(change.target.value as MonitoringEventType)}>{MONITORING_EVENT_TYPES.map((type) => <option key={type} value={type}>{MONITORING_EVENT_TYPE_LABELS[type]}</option>)}</select></label>
              <label>人工确认等级<select value={confirmedLevel} onChange={(change) => setConfirmedLevel(change.target.value as MonitoringLevel)}>{LEVELS.map((level) => <option key={level} value={level}>{MONITORING_LEVEL_LABELS[level]}</option>)}</select></label>
              <label>路线<input value={roadCode} onChange={(change) => setRoadCode(change.target.value)} /></label>
              <label>方向<select value={direction} onChange={(change) => setDirection(change.target.value as typeof direction)}><option value="up">上行</option><option value="down">下行</option><option value="unknown">未知</option></select></label>
              <label>桩号<input type="number" min="0" step="0.1" value={kilometer} onChange={(change) => setKilometer(change.target.value)} /></label>
              <label>影响车道数<input type="number" min="0" value={lanesAffected} onChange={(change) => setLanesAffected(change.target.value)} /></label>
              <label>涉及车辆数<input type="number" min="0" value={vehicleCount} onChange={(change) => setVehicleCount(change.target.value)} /></label>
              <label>伤亡人数<input type="number" min="0" value={casualties} onChange={(change) => setCasualties(change.target.value)} /></label>
            </div>
            <label className="verification-checkbox"><input type="checkbox" checked={hazardousMaterials} onChange={(change) => setHazardousMaterials(change.target.checked)} />涉及危化品</label>
            <label>核实依据/等级调整原因<textarea value={reason} onChange={(change) => setReason(change.target.value)} placeholder="误报、观察及L3/L4降级时必填" /></label>
            <label>订正备注<textarea value={notes} onChange={(change) => setNotes(change.target.value)} placeholder="历史结论不会覆盖，本次内容将追加为新版本" /></label>
            {(isL4 || isL4Downgrade) ? (
              <label>班长复核<select value={supervisorId} onChange={(change) => setSupervisorId(change.target.value)}><option value="">未选择（受限操作将被拒绝）</option>{supervisorOptions.map((user) => <option key={user.userId} value={user.userId}>{user.displayName}</option>)}</select></label>
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

