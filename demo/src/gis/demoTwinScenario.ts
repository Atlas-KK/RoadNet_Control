// ============================================================
// 演示案例的时空孪生脚本。
// 将案例文档中的时间片、车流、通风与资源落位收敛为可被两套 GIS 共同消费的状态。
// ============================================================

import type { RoadId } from '../data/network';

export type TwinChainageDirection = 'increasing' | 'decreasing';

export interface DemoTwinTrafficState {
  /** 事故方向对应的主线行驶方向；increasing 表示车辆向更大桩号行驶。 */
  travelDirection: TwinChainageDirection;
  /** 三车道全封后，封控点至事故点之间只保留滞留/排队车辆，不再生成穿越车流。 */
  closureActive: boolean;
  closureKp: number;
  queueTailKp: number;
  queuedVehicleCount: number;
  queueSpeedKmh: number;
  /** 反向车道的撤离或受控通行速度。 */
  evacuation?: { fromKp: number; toKp: number; vehicleCount: number; speedKmh: number };
  /** 仍可通行车道的受控通行流，例如“封闭 2 车道 + 限速 40”。 */
  controlledFlow?: { fromKp: number; toKp: number; vehicleCount: number; speedKmh: number };
  /** 恢复期实际可通行车道数；未提供时沿用事件初始状态中的可用车道。 */
  availableLanes?: number;
  /** 恢复期容量折减系数；现场完全清撤后可回升至接近自由流能力。 */
  capacityFactor?: number;
  visibilityMeters: number;
}

export interface DemoTwinVentilationState {
  fanId: string;
  windSensorId: string;
  tunnelFromKp: number;
  tunnelToKp: number;
  direction: TwinChainageDirection;
  naturalWindSpeedMps: number;
  fanEnabled: boolean;
  /** 气溶胶/轻质泄漏物沿洞内气流的可视化范围。 */
  plumeFromKp: number;
  plumeToKp: number;
}

export interface DemoTwinResourceRoute {
  resourceId: string;
  /** 分段路线的起点；未传时使用资源驻地。 */
  fromKp?: number;
  targetKp: number;
  departSimSec: number;
  arriveSimSec: number;
  label: string;
}

export interface DemoTwinPhase {
  atSimSec: number;
  label: string;
  traffic: DemoTwinTrafficState;
  ventilation?: DemoTwinVentilationState;
  /** 到达该时间片后自动下发的既有预案措施。 */
  autoIssueMeasureIds?: string[];
  /** 裁剪设备与已启用设备均需在地图上保持状态，而非依赖推理卡片高亮。 */
  prunedDeviceIds?: string[];
  activeDeviceIds?: string[];
  /** 当前阶段唯一有效的分流承接线，用于案例一和案例五。 */
  diversion?: { id: string; label: string; fromKp: number; connectorRoad: RoadId; connectorFromKp: number; connectorToKp: number };
  /** 演示脚本终态：将处置队列推进到完成，并可将事件从活动态势中处置闭环。 */
  completion?: { stage: string; note: string; finalizeEvent?: boolean };
}

export interface DemoTwinEventScript {
  eventIndex: number;
  phases: DemoTwinPhase[];
  resourceRoutes?: DemoTwinResourceRoute[];
}

export interface DemoTwinRevision {
  id: string;
  eventIndex: number;
  simSec: number;
  retractedFacts: string[];
  note: string;
}

export interface DemoTwinScript {
  id: string;
  road: RoadId;
  eventIndex: number;
  phases: DemoTwinPhase[];
  resourceRoutes: DemoTwinResourceRoute[];
  /** 同一案例的其他活跃事件脚本，例如案例一的 G56 侧翻和案例二的占用方事故。 */
  eventScripts?: DemoTwinEventScript[];
  /** 必须在演变时钟跨过指定时刻后才执行的事实修正。 */
  revisions?: DemoTwinRevision[];
}

export interface ActiveDemoTwin {
  eventId: string;
  eventIds?: string[];
  script: DemoTwinScript;
  appliedRevisionIds?: string[];
}

export interface ResolvedDemoTwin {
  eventId: string;
  script: DemoTwinScript;
  phase: DemoTwinPhase;
}

/** 返回当前时刻已生效的最后一个时间片；脚本开始前不渲染其专属状态。 */
function eventScriptFor(active: ActiveDemoTwin, eventId: string): DemoTwinEventScript | undefined {
  if (eventId === active.eventId) return active.script;
  const eventIndex = active.eventIds?.indexOf(eventId);
  return eventIndex == null || eventIndex < 0
    ? undefined
    : active.script.eventScripts?.find((item) => item.eventIndex === eventIndex);
}

/** 返回指定事件的完整时间片脚本，供处置闭环复盘和时间轴等历史视图使用。 */
export function demoTwinPhasesForEvent(active: ActiveDemoTwin | undefined, eventId: string): DemoTwinPhase[] {
  if (!active) return [];
  return [...(eventScriptFor(active, eventId)?.phases ?? [])].sort((a, b) => a.atSimSec - b.atSimSec);
}

/** 返回指定事件关联的事实修正记录；无修正的案例返回空数组。 */
export function demoTwinRevisionsForEvent(active: ActiveDemoTwin | undefined, eventId: string): DemoTwinRevision[] {
  if (!active) return [];
  const eventIndex = eventId === active.eventId ? active.script.eventIndex : active.eventIds?.indexOf(eventId);
  if (eventIndex == null || eventIndex < 0) return [];
  return (active.script.revisions ?? []).filter((revision) => revision.eventIndex === eventIndex);
}

/** 返回指定事件在当前时刻已生效的最后一个时间片。 */
export function resolveDemoTwin(active: ActiveDemoTwin | undefined, simSec: number, eventId?: string): ResolvedDemoTwin | undefined {
  if (!active) return undefined;
  const resolvedEventId = eventId ?? active.eventId;
  const timeline = eventScriptFor(active, resolvedEventId);
  if (!timeline) return undefined;
  const phase = [...timeline.phases]
    .filter((item) => item.atSimSec <= simSec)
    .sort((a, b) => b.atSimSec - a.atSimSec)[0];
  return phase ? { eventId: resolvedEventId, script: active.script, phase } : undefined;
}

export function resolveDemoTwins(active: ActiveDemoTwin | undefined, simSec: number): ResolvedDemoTwin[] {
  const ids = active?.eventIds?.length ? active.eventIds : active ? [active.eventId] : [];
  return ids.flatMap((eventId) => {
    const resolved = resolveDemoTwin(active, simSec, eventId);
    return resolved ? [resolved] : [];
  });
}

export function routeForResource(active: ActiveDemoTwin | undefined, resourceId: string, simSec: number): DemoTwinResourceRoute | undefined {
  const routes = active
    ? [
        ...active.script.resourceRoutes,
        ...(active.script.eventScripts?.flatMap((timeline) => timeline.resourceRoutes ?? []) ?? []),
       ].filter((route) => route.resourceId === resourceId)
      : [];
  routes.sort((a, b) => a.departSimSec - b.departSimSec);
  return routes.filter((route) => route.departSimSec <= simSec).at(-1) ?? routes[0];
}
