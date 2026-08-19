import type { SimEvent } from '../domain/event';
import type { DeviceCommandEffect, DispatchTarget, MeasureDispatch, Plan, PlanMeasure } from '../domain/plan';
import type { EnvironmentState } from './conditions';

const TARGET_KIND_LABEL: Record<DispatchTarget['type'], string> = {
  system: '系统',
  personnel: '人员',
  device: '设备',
};

export const dispatchTargetTypeLabel = (type: DispatchTarget['type']) => TARGET_KIND_LABEL[type];

interface DispatchBlueprint {
  system: string[];
  personnel: string[];
  effects: DeviceCommandEffect[];
}

function blueprintFor(measure: PlanMeasure): DispatchBlueprint {
  switch (measure.measureId) {
    case 'M_全封':
      return {
        system: ['事件处置系统', '诱导发布系统', '交通信号控制系统'],
        personnel: ['路政执法人员', '交警现场指挥'],
        effects: [
          { deviceId: 'VMS-04', displayContent: '禁止通行', contentTone: 'danger' },
          { deviceId: 'VMS-05', displayContent: '禁止通行', contentTone: 'danger' },
          { deviceId: 'LCS-1168-1', displayContent: '第 1 车道：红叉关闭', contentTone: 'danger' },
          { deviceId: 'LCS-1168-2', displayContent: '第 2 车道：红叉关闭', contentTone: 'danger' },
        ],
      };
    case 'M_封车道':
      return {
        system: ['交通信号控制系统'],
        personnel: ['路政执法人员'],
        effects: [
          { deviceId: 'LCS-1168-1', displayContent: '第 1 车道：红叉关闭', contentTone: 'danger' },
          { deviceId: 'LCS-1168-2', displayContent: '第 2 车道：红叉关闭', contentTone: 'danger' },
          { deviceId: 'SIG-1162', displayContent: '黄闪警示·管控模式', contentTone: 'warning' },
        ],
      };
    case 'M_预置分流':
    case 'M_提前分流':
      return {
        system: ['诱导发布系统', '事件处置系统'],
        personnel: ['收费站值守人员', '路政执法人员'],
        effects: [
          { deviceId: 'VMS-04', displayContent: '减速慢行·按指引分流', contentTone: 'warning' },
          { deviceId: 'SIG-1162', displayContent: '黄闪警示·管控模式', contentTone: 'warning' },
        ],
      };
    case 'M_通风':
      return {
        system: ['隧道机电控制系统'],
        personnel: ['隧道机电值守人员'],
        effects: [
          { deviceId: 'FAN-01', displayContent: '正向排风已启动', contentTone: 'normal' },
          { deviceId: 'WD-01', displayContent: '风速 3.2 m/s·数据有效', contentTone: 'normal' },
        ],
      };
    default:
      return {
        system: ['事件处置系统'],
        personnel: measure.resource ? [`${measure.resource.id} 救援力量`] : ['现场处置人员'],
        effects: measure.title.includes('视频')
          ? [{ deviceId: 'CAM-1177', displayContent: '视频调阅中·指令已同步', contentTone: 'normal' }]
          : [],
      };
  }
}

/** 确认动作的演示回执：离线设备失败，其余系统、人员和设备正常回执。 */
export function buildMeasureDispatch(
  measure: PlanMeasure,
  _event: SimEvent | undefined,
  environment: EnvironmentState,
  issuedAtSimSec: number,
): MeasureDispatch {
  const blueprint = blueprintFor(measure);
  const targets: DispatchTarget[] = [
    ...blueprint.system.map((name, index) => ({ id: `SYS-${measure.id}-${index}`, type: 'system' as const, name, status: 'success' as const })),
    ...blueprint.personnel.map((name, index) => ({ id: `PER-${measure.id}-${index}`, type: 'personnel' as const, name, status: 'success' as const })),
    ...blueprint.effects.map((effect) => ({
      id: effect.deviceId,
      type: 'device' as const,
      name: effect.deviceId,
      status: environment.offlineDeviceIds.includes(effect.deviceId) ? 'failed' as const : 'success' as const,
      failureReason: environment.offlineDeviceIds.includes(effect.deviceId) ? '设备通信离线，未确认接收' : undefined,
    })),
  ];
  const failed = targets.filter((target) => target.status === 'failed').length;
  return {
    status: failed === 0 ? 'success' : failed === targets.length ? 'failed' : 'partial_success',
    issuedAtSimSec,
    elapsedSec: Number((4.8 + (measure.id.length % 5) * 0.7).toFixed(1)),
    targets,
    deviceEffects: blueprint.effects.filter((effect) => !environment.offlineDeviceIds.includes(effect.deviceId)),
  };
}

/** 获取当前事件已被成功下发的设备指令；后确认的操作项覆盖同一设备的早期展示内容。 */
export function resolveDeviceCommandEffects(plans: Plan[], eventId: string | undefined): Map<string, DeviceCommandEffect & { measureTitle: string; issuedAtSimSec: number }> {
  const effects = new Map<string, DeviceCommandEffect & { measureTitle: string; issuedAtSimSec: number }>();
  if (!eventId) return effects;
  plans
    .filter((plan) => plan.id === `PLAN-${eventId}` && !plan.archived)
    .sort((a, b) => a.version - b.version)
    .flatMap((plan) => plan.measures)
    .forEach((measure) => {
      if (measure.dispatch?.status !== 'success' && measure.dispatch?.status !== 'partial_success') return;
      measure.dispatch.deviceEffects.forEach((effect) => effects.set(effect.deviceId, {
        ...effect,
        measureTitle: measure.title,
        issuedAtSimSec: measure.dispatch?.issuedAtSimSec ?? 0,
      }));
    });
  return effects;
}
