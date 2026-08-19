import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../domain/event';
import { resolveInfrastructureMonitor } from './infrastructureMonitor';

const EVENT: SimEvent = {
  id: 'EV-1', road: 'G65', accidentKp: 1177.2, lanesTotal: 3, lanesClosed: 2, q: 3600,
  typeNodeId: 'E_事故', label: '隧道追尾', startSimSec: 0, congested: true, w: 12, direction: 'down',
};

describe('resolveInfrastructureMonitor', () => {
  it('按行车方向将设备放入上下游五段网格', () => {
    const items = resolveInfrastructureMonitor(EVENT, { fogBands: [], offlineDeviceIds: [] }, undefined, 420, 10);
    expect(items.find((item) => item.device.id === 'VMS-04')?.zone).toBe('upstreamNear');
    expect(items.find((item) => item.device.id === 'LCS-1178-1')?.zone).toBe('downstreamNear');
    expect(items.find((item) => item.device.id === 'CAM-1177')?.zone).toBe('incident');
  });

  it('将环境离线状态覆盖为故障且不展示可用内容', () => {
    const items = resolveInfrastructureMonitor(EVENT, { fogBands: [], offlineDeviceIds: ['CAM-1177'] }, undefined, 420, 10);
    const camera = items.find((item) => item.device.id === 'CAM-1177');
    expect(camera).toMatchObject({ linkStatus: 'offline', workStatus: 'fault', displayContent: '通信中断·待核实' });
  });

  it('按选择范围过滤设备台账', () => {
    const items = resolveInfrastructureMonitor(EVENT, { fogBands: [], offlineDeviceIds: [] }, undefined, 420, 5);
    expect(items.some((item) => item.device.id === 'VMS-05')).toBe(false);
    expect(items.some((item) => item.device.id === 'LCS-1178-1')).toBe(true);
  });

  it('为设备提供按整公里归属的桩号网格', () => {
    const items = resolveInfrastructureMonitor(EVENT, { fogBands: [], offlineDeviceIds: [] }, undefined, 420, 10);
    expect(items.find((item) => item.device.id === 'CAM-1177')?.chainageCellStart).toBe(1177);
    expect(items.find((item) => item.device.id === 'VMS-04')?.chainageCellStart).toBe(1174);
  });

  it('成功下发的设备指令覆盖网格显示内容并保留回执来源', () => {
    const effects = new Map([['VMS-04', {
      deviceId: 'VMS-04', displayContent: '禁止通行', contentTone: 'danger' as const, measureTitle: '全幅封道', issuedAtSimSec: 120,
    }]]);
    const items = resolveInfrastructureMonitor(EVENT, { fogBands: [], offlineDeviceIds: [] }, undefined, 120, 10, effects);
    expect(items.find((item) => item.device.id === 'VMS-04')).toMatchObject({
      displayContent: '禁止通行', contentTone: 'danger', commandSync: { measureTitle: '全幅封道', issuedAtSimSec: 120 },
    });
  });

  it('模拟管控阶段为车道指示灯生成关闭状态', () => {
    const activeDemoTwin = {
      eventId: 'EV-1',
      script: {
        id: 'demo', road: 'G65' as const, eventIndex: 0, resourceRoutes: [],
        phases: [{ atSimSec: 0, label: '封控', traffic: { travelDirection: 'increasing' as const, closureActive: true, closureKp: 1168, queueTailKp: 1175, queuedVehicleCount: 20, queueSpeedKmh: 0, visibilityMeters: 500 }, activeDeviceIds: ['VMS-04'] }],
      },
    };
    const items = resolveInfrastructureMonitor(EVENT, { fogBands: [], offlineDeviceIds: [] }, activeDemoTwin, 60, 10);
    expect(items.find((item) => item.device.id === 'LCS-1168-1')?.displayContent).toContain('红叉关闭');
    expect(items.find((item) => item.device.id === 'VMS-04')).toMatchObject({ displayContent: '禁止通行', contentTone: 'danger' });
  });
});
