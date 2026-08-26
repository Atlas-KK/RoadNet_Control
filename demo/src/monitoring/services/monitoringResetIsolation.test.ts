import { beforeEach, describe, expect, it } from 'vitest';
import { useStore as useControlStore } from '../../store';
import { DemoMonitoringAdapter } from '../adapters/DemoMonitoringAdapter';
import { createMonitoringStore } from '../store';
import { MemoryMonitoringRepository } from './monitoringDb';
import { MonitoringDemoRuntime } from './monitoringDemoRuntime';

describe('阶段11 演示数据清理边界', () => {
  beforeEach(() => useControlStore.getState().clearRuntime());

  it('只清空事件监测数据，不改变智能管控运行态', async () => {
    const repository = new MemoryMonitoringRepository();
    const monitoringStore = createMonitoringStore(repository);
    const runtime = new MonitoringDemoRuntime(new DemoMonitoringAdapter(), monitoringStore, () => Date.parse('2026-08-25T10:00:00.000Z'));
    useControlStore.setState({ simSec: 321, running: false });
    await runtime.submitManualReport({
      eventType: 'traffic_accident', location: { roadCode: 'G65', direction: 'up', kilometer: 118 },
      notes: '用于验证监测数据清理边界',
    });
    expect(await repository.listAlarms()).toHaveLength(1);

    await runtime.reset();
    expect(await repository.listAlarms()).toHaveLength(0);
    expect(Object.keys(monitoringStore.getState().monitoringEventsById)).toHaveLength(0);
    expect(useControlStore.getState()).toMatchObject({ simSec: 321, running: false });
    runtime.dispose();
  });
});
