import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerificationTask } from '../../domain/monitoring';
import { SIMULATED_USERS } from '../permissions';
import { useMonitoringStore } from '../store';
import { monitoringListItemFixture } from './componentTestFixtures';
import VerificationPanel from './VerificationPanel';

afterEach(() => {
  useMonitoringStore.getState().hydrateProjection({ alarms: [], events: [], verificationTasks: [], handoffs: [] });
  useMonitoringStore.getState().setCurrentUser('USR-MONITOR-01');
});

describe('FR-EM-006 人工核实操作台', () => {
  it('详情只读打开时不生成任务，显式提示点击后才占用', () => {
    const item = monitoringListItemFixture();
    useMonitoringStore.getState().hydrateProjection({ alarms: [...item.alarms], events: [item.event], verificationTasks: [], handoffs: [] });
    const html = renderToStaticMarkup(<VerificationPanel item={item} />);
    expect(html).toContain('待认领');
    expect(html).toContain('开始核实');
    expect(html).toContain('点击后才创建独占核实任务');
    expect(useMonitoringStore.getState().verificationTasksById).toEqual({});
  });

  it('当前用户占用后展示完整订正字段、结论操作和L4本人审批提示', () => {
    const item = monitoringListItemFixture();
    const claimedEvent = {
      ...item.event,
      version: 2,
      verificationStatus: 'verifying' as const,
      verificationMode: 'manual_review' as const,
      verificationOwnerId: 'USR-MONITOR-01',
      nextReviewAt: '2026-08-25T02:01:00.000Z',
    };
    const claimedTask: VerificationTask = {
      taskId: 'VT-ME-UI-001', eventId: claimedEvent.monitoringEventId, expectedEventVersion: 2,
      status: 'claimed', ownerId: 'USR-MONITOR-01', claimedAt: '2026-08-25T02:00:00.000Z',
      nextReviewAt: '2026-08-25T02:01:00.000Z', updatedAt: '2026-08-25T02:00:00.000Z',
    };
    const html = renderToStaticMarkup(
      <VerificationPanel item={{ ...item, event: claimedEvent }} taskOverride={claimedTask} currentUserOverride={SIMULATED_USERS[0]} />,
    );
    for (const label of ['事件类型', '人工确认等级', '影响车道数', '总车道数', '涉及车辆数', '伤亡人数', '流量（辆/小时）', '车速（公里/小时）', '涉及危化品',
      '必须由当前登录的监控班长本人']) {
      expect(html).toContain(label);
    }
    for (const section of ['核实结论', '位置订正', '影响范围', '补充说明']) expect(html).toContain(section);
    for (const action of ['确认事件', '持续观察', '判定误报', '释放任务']) expect(html).toContain(action);
  });

  it('核实完成后以紧凑结果区展示人工结论，不再重复整块事件信息', () => {
    const item = monitoringListItemFixture();
    const confirmedEvent = {
      ...item.event,
      verificationStatus: 'confirmed' as const,
      confirmedLevel: 'L3' as const,
    };
    const html = renderToStaticMarkup(<VerificationPanel item={{ ...item, event: confirmedEvent }} />);
    expect(html).toContain('核实结果');
    expect(html).toContain('人工确认等级');
    expect(html).toContain('L3 较重');
    expect(html).toContain('系统信息');
    expect(html).not.toContain('开始核实');
  });

  it('无核实权限角色看得到事件但看不到开始核实按钮', () => {
    const item = monitoringListItemFixture();
    const administrator = SIMULATED_USERS.find((user) => user.role === 'administrator');
    expect(administrator).toBeDefined();
    const html = renderToStaticMarkup(<VerificationPanel item={item} currentUserOverride={administrator} />);
    expect(html).toContain('当前角色无核实权限');
    expect(html).not.toContain('开始核实</button>');
  });
});
