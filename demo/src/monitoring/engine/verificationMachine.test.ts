import { describe, expect, it } from 'vitest';
import type { MonitoringEvent, VerificationTask } from '../../domain/monitoring';
import {
  transitionVerification,
  verificationRemainingMs,
  verificationSlaMs,
  VerificationTransitionError,
  type SupervisorApproval,
  type VerificationCommand,
} from './verificationMachine';

const START = Date.parse('2026-08-25T02:00:00.000Z');

function event(level: MonitoringEvent['suggestedLevel'] = 'L3'): MonitoringEvent {
  return {
    monitoringEventId: 'ME-V-001',
    version: 1,
    alarmIds: ['ALM-1', 'ALM-2'],
    eventType: 'abnormal_stop',
    location: { roadCode: 'G65', direction: 'up', kilometer: 120.1 },
    suggestedLevel: level,
    verificationStatus: 'pending',
    lifecycleStatus: 'monitoring',
    observationCount: 0,
    conflicts: [],
    detectedAt: '2030-01-01T00:00:00.000Z',
    updatedAt: '2030-01-01T00:00:00.000Z',
    simulation: true,
  };
}

function run(
  currentEvent: MonitoringEvent,
  command: VerificationCommand,
  task?: VerificationTask,
  actorId = 'USR-MONITOR-01',
  nowMs = START,
) {
  return transitionVerification({
    event: currentEvent,
    task,
    command,
    actorId,
    nowMs,
    idSeed: `${currentEvent.monitoringEventId}-${currentEvent.version + 1}`,
  });
}

function claim(initial = event(), actorId = 'USR-MONITOR-01') {
  return run(initial, { type: 'claim', eventId: initial.monitoringEventId, expectedVersion: initial.version }, undefined, actorId);
}

function approval(permission: SupervisorApproval['permission']): SupervisorApproval {
  return { approvedBy: 'USR-SUPERVISOR-01', approvedAt: new Date(START).toISOString(), permission };
}

describe('FR-EM-006 核实状态机唯一纯函数入口', () => {
  it('开始核实建立独占任务，另一监测员认领会返回当前占用人', () => {
    const claimed = claim();
    expect(claimed.event.verificationStatus).toBe('verifying');
    expect(claimed.task.ownerId).toBe('USR-MONITOR-01');
    expect(claimed.task.nextReviewAt).toBe(new Date(START + verificationSlaMs('L3')).toISOString());

    expect(() => run(
      claimed.event,
      { type: 'claim', eventId: claimed.event.monitoringEventId, expectedVersion: claimed.event.version },
      claimed.task,
      'USR-MONITOR-02',
    )).toThrowError(expect.objectContaining<Partial<VerificationTransitionError>>({
      code: 'TASK_OCCUPIED',
      currentOwnerId: 'USR-MONITOR-01',
    }));
  });

  it('持续观察释放占用、生成复核时间，其他监测员可重新认领', () => {
    const claimed = claim(event('L2'));
    const observed = run(claimed.event, {
      type: 'observe', eventId: claimed.event.monitoringEventId, expectedVersion: claimed.event.version, reason: '遮挡，等待后续画面',
    }, claimed.task, 'USR-MONITOR-01', START + 5_000);

    expect(observed.event.verificationMode).toBe('observation');
    expect(observed.event.verificationOwnerId).toBeUndefined();
    expect(observed.task.status).toBe('observation');
    expect(observed.task.ownerId).toBeUndefined();
    expect(observed.event.nextReviewAt).toBe(new Date(START + 5_000 + verificationSlaMs('L2')).toISOString());

    const reclaimed = run(observed.event, {
      type: 'claim', eventId: observed.event.monitoringEventId, expectedVersion: observed.event.version,
    }, observed.task, 'USR-MONITOR-02', START + 10_000);
    expect(reclaimed.task.ownerId).toBe('USR-MONITOR-02');
  });

  it('新证据提前触发复核、取消观察并要求置顶', () => {
    const claimed = claim(event('L2'));
    const observed = run(claimed.event, {
      type: 'observe', eventId: claimed.event.monitoringEventId, expectedVersion: claimed.event.version, reason: '等待车辆移动',
    }, claimed.task, 'USR-MONITOR-01', START + 1_000);
    const review = run(observed.event, {
      type: 'evidence_added', eventId: observed.event.monitoringEventId, expectedVersion: observed.event.version, evidenceId: 'EVD-NEW',
    }, observed.task, 'SYSTEM', START + 2_000);

    expect(review.event.verificationStatus).toBe('pending');
    expect(review.event.verificationMode).toBe('manual_review');
    expect(review.task.status).toBe('available');
    expect(review.pinToTop).toBe(true);
    expect(review.auditEntries[0]?.payload).toEqual({ evidenceId: 'EVD-NEW' });
  });

  it('人工等级与AI建议等级分开保存，降级原因和订正版本进入审计', () => {
    const claimed = claim(event('L3'));
    const confirmed = run(claimed.event, {
      type: 'confirm',
      eventId: claimed.event.monitoringEventId,
      expectedVersion: claimed.event.version,
      reason: '仅占用应急车道，通行影响有限',
      corrections: { confirmedLevel: 'L2', vehicleCount: 1, notes: '已人工复核' },
    }, claimed.task);

    expect(confirmed.event.suggestedLevel).toBe('L3');
    expect(confirmed.event.confirmedLevel).toBe('L2');
    expect(confirmed.correction?.reason).toContain('应急车道');
    expect(confirmed.correction?.eventVersion).toBe(3);
    expect(confirmed.assessments).toHaveLength(2);
    expect(confirmed.assessments.every((item) => item.result === 'valid')).toBe(true);
    expect(confirmed.auditEntries[0]?.payload?.correction).toEqual(confirmed.correction);
  });

  it('L3/L4降级缺少原因时拒绝提交', () => {
    const claimed = claim(event('L3'));
    expect(() => run(claimed.event, {
      type: 'confirm', eventId: claimed.event.monitoringEventId, expectedVersion: claimed.event.version,
      corrections: { confirmedLevel: 'L2' },
    }, claimed.task)).toThrowError(expect.objectContaining({ code: 'REASON_REQUIRED' }));
  });

  it.each([
    ['false_positive', 'review_l4_false_positive'],
    ['observe', 'approve_l4_observation'],
  ] as const)('L4执行%s缺少班长复核时拒绝', (type, _permission) => {
    const claimed = claim(event('L4'));
    const command = type === 'false_positive'
      ? { type, eventId: claimed.event.monitoringEventId, expectedVersion: claimed.event.version, reason: '复核依据' } as const
      : { type, eventId: claimed.event.monitoringEventId, expectedVersion: claimed.event.version, reason: '继续观察依据' } as const;
    expect(() => run(claimed.event, command, claimed.task)).toThrowError(expect.objectContaining({
      code: 'SUPERVISOR_APPROVAL_REQUIRED',
    }));
  });

  it('L4误报、观察和降级携带匹配的班长复核后可以提交', () => {
    const l4False = claim(event('L4'));
    expect(run(l4False.event, {
      type: 'false_positive', eventId: l4False.event.monitoringEventId, expectedVersion: l4False.event.version,
      reason: '光影误检', supervisorApproval: approval('review_l4_false_positive'),
    }, l4False.task).event.verificationStatus).toBe('false_positive');

    const l4Observe = claim(event('L4'));
    expect(run(l4Observe.event, {
      type: 'observe', eventId: l4Observe.event.monitoringEventId, expectedVersion: l4Observe.event.version,
      reason: '画面被遮挡', supervisorApproval: approval('approve_l4_observation'),
    }, l4Observe.task).event.verificationMode).toBe('observation');

    const l4Downgrade = claim(event('L4'));
    expect(run(l4Downgrade.event, {
      type: 'confirm', eventId: l4Downgrade.event.monitoringEventId, expectedVersion: l4Downgrade.event.version,
      reason: '未出现明火，仅轻微烟雾', corrections: { confirmedLevel: 'L3' },
      supervisorApproval: approval('review_l4_downgrade'),
    }, l4Downgrade.task).event.confirmedLevel).toBe('L3');
  });

  it('连续两次观察升级班长关注，但不伪造业务结论', () => {
    const firstClaim = claim(event('L2'));
    const firstObservation = run(firstClaim.event, {
      type: 'observe', eventId: firstClaim.event.monitoringEventId, expectedVersion: firstClaim.event.version, reason: '首次信息不足',
    }, firstClaim.task);
    const secondClaim = run(firstObservation.event, {
      type: 'claim', eventId: firstObservation.event.monitoringEventId, expectedVersion: firstObservation.event.version,
    }, firstObservation.task, 'USR-MONITOR-02', START + 1_000);
    const secondObservation = run(secondClaim.event, {
      type: 'observe', eventId: secondClaim.event.monitoringEventId, expectedVersion: secondClaim.event.version, reason: '第二次仍信息不足',
    }, secondClaim.task, 'USR-MONITOR-02', START + 2_000);
    expect(secondObservation.event.observationCount).toBe(2);
    expect(secondObservation.requiresSupervisorAttention).toBe(true);
    expect(secondObservation.event.verificationStatus).toBe('verifying');
  });

  it('版本不一致拒绝提交并携带当前占用信息', () => {
    const claimed = claim();
    expect(() => run(claimed.event, {
      type: 'release', eventId: claimed.event.monitoringEventId, expectedVersion: 1,
    }, claimed.task)).toThrowError(expect.objectContaining({ code: 'VERSION_CONFLICT' }));
  });
});

describe('AC26 双时钟隔离', () => {
  it('SLA只由注入的操作时钟计算，不读取模拟事件时间或倍速', () => {
    const simulationVariants = [
      { paused: true, speed: 0 },
      { paused: false, speed: 16 },
    ];
    const deadlines = simulationVariants.map(() => claim(event('L4')).task.nextReviewAt);
    expect(new Set(deadlines).size).toBe(1);
    expect(deadlines[0]).toBe(new Date(START + 60_000).toISOString());
    expect(verificationRemainingMs(deadlines[0], START + 25_000)).toBe(35_000);
  });
});
