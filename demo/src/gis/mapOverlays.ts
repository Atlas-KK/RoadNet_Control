// ============================================================
// 地图叠加要素（运行模式共享空间语义，不绑定单个演示案例）。
// 不再按 ScenarioId 键存储，改为两类来源，使运行模式手工录入的任意事件也能
// 获得完整的空间语义标注：
//   ① 静态路网设施——与场景/事件无关，地图一加载即常驻：隧道带（data/network.ts
//     的 TUNNELS）、枢纽点（HUBS）、分流承接线（DIVERSION_ROUTES）；
//   ② 运行期环境——随 store.environment 实时变化：团雾带（environment.fogBands）。
//
// 危化品/全封相关动态叠加要素不再按场景常量硬编码，而是从当前聚焦事件的
// 预案措施参数回填：M_通风 → wind/controlZone，M_全封 → closure。
// 这样运行模式手工录入的隧道危化品事件也能在地图上看到通风方向、管制区和封道点。
// ============================================================

import { HUBS, TUNNELS, type HubSpec, type RoadId } from '../data/network';
import type { SourcedParam } from '../data/measureTemplates';
import type { EnvironmentState } from '../engine/conditions';
import { chainageToLngLat, roadCoordinatesBetween, type LngLat } from './xiAnRing';
import type { ResolvedDemoTwin } from './demoTwinScenario';

/** 叠加要素类别：带状（fog/tunnel/controlZone/wind/diversion）或点状（closure/hub）。 */
export type OverlayKind =
  | 'tunnel'
  | 'fog'
  | 'controlZone'
  | 'wind'
  | 'gasPlume'
  | 'diversion'
  | 'closure'
  | 'hub';

/** 各类别的统一配色，保证两套地图语义一致；部分色值同时被设备图层复用（如 controlZone→情报板、wind→风机）。 */
export const OVERLAY_COLORS: Record<OverlayKind, string> = {
  tunnel: '#5b7089',
  fog: '#aeb9c9',
  controlZone: '#f2b84b',
  wind: '#4fd1c5',
  gasPlume: '#f0a14a',
  diversion: '#37d67a',
  closure: '#ff4d4f',
  hub: '#9b8cff',
};

/** 静态分流承接线：主线分流点 → 承接道路起点，再沿承接道路延伸。 */
interface DiversionRouteSpec {
  id: string;
  label: string;
  road: RoadId;
  fromKp: number;
  via: { road: RoadId; fromKp: number; toKp: number };
}

export const DIVERSION_ROUTES: DiversionRouteSpec[] = [
  { id: 'ov-divert-s204', label: '提前分流 K1140→S204', road: 'G65', fromKp: 1140, via: { road: 'S204', fromKp: 0, toKp: 40 } },
];

export interface ResolvedOverlayLine {
  id: string;
  kind: OverlayKind;
  label: string;
  emph: boolean;
  coordinates: LngLat[];
}

export interface ResolvedOverlayPoint {
  id: string;
  kind: OverlayKind;
  label: string;
  emph: boolean;
  coordinate: LngLat;
  /** 仅 hub 点携带：供「预测兑现」判定按道路+桩号匹配对应枢纽。 */
  road?: RoadId;
  kp?: number;
}

export interface ResolvedOverlays {
  lines: ResolvedOverlayLine[];
  points: ResolvedOverlayPoint[];
}

export interface RuntimeOverlayContext {
  road: RoadId;
  plan?: { measures: { measureId: string; params: Record<string, SourcedParam> }[] };
  twin?: ResolvedDemoTwin;
}

function textParam(plan: RuntimeOverlayContext['plan'] | undefined, measureId: string, key: string): string | undefined {
  const value = plan?.measures.find((measure) => measure.measureId === measureId)?.params[key]?.value;
  if (value == null) return undefined;
  return String(value);
}

function parseKp(value: string | undefined): number | undefined {
  const match = value?.match(/K\s*(\d{1,4}(?:\.\d+)?)/);
  if (!match) return undefined;
  const kp = Number(match[1]);
  return Number.isFinite(kp) ? kp : undefined;
}

function parseKpRange(value: string | undefined): { fromKp: number; toKp: number } | undefined {
  const match = value?.match(/K\s*(\d{1,4}(?:\.\d+)?)\s*[–-]\s*K?\s*(\d{1,4}(?:\.\d+)?)/);
  if (!match) return undefined;
  const fromKp = Number(match[1]);
  const toKp = Number(match[2]);
  if (!Number.isFinite(fromKp) || !Number.isFinite(toKp)) return undefined;
  return { fromKp, toKp };
}

/**
 * 解析当前地图应叠加的静态路网设施 + 运行期环境要素，并按高亮引用集合标注强调态。
 *
 * @param environment 当前团雾带/离线设备等运行期环境状态。
 * @param highlightRefs 当前选中推理步骤的 mapRefs；命中要素类别对应的 ref 时 emph=true。
 * @param runtime 当前聚焦事件及其预案；用于把 M_通风/M_全封 的计算参数回填成动态地图叠加。
 */
export function resolveMapOverlays(
  environment: EnvironmentState,
  highlightRefs: string[],
  runtime?: RuntimeOverlayContext,
): ResolvedOverlays {
  const lines: ResolvedOverlayLine[] = [];
  const points: ResolvedOverlayPoint[] = [];

  for (const tunnel of TUNNELS) {
    lines.push({
      id: `tunnel-${tunnel.id}`,
      kind: 'tunnel',
      label: tunnel.id,
      emph: highlightRefs.includes('tunnel'),
      coordinates: roadCoordinatesBetween(tunnel.road, tunnel.fromKp, tunnel.toKp),
    });
  }

  const scriptedDiversion = runtime?.twin?.phase.diversion;
  if (scriptedDiversion) {
    const coordinates = [
      chainageToLngLat(runtime!.road, scriptedDiversion.fromKp),
      ...roadCoordinatesBetween(scriptedDiversion.connectorRoad, scriptedDiversion.connectorFromKp, scriptedDiversion.connectorToKp),
    ];
    lines.push({ id: scriptedDiversion.id, kind: 'diversion', label: scriptedDiversion.label, emph: true, coordinates });
  } else if (!runtime?.twin) {
    for (const route of DIVERSION_ROUTES) {
      const coordinates = [
        chainageToLngLat(route.road, route.fromKp),
        ...roadCoordinatesBetween(route.via.road, route.via.fromKp, route.via.toKp),
      ];
      lines.push({ id: route.id, kind: 'diversion', label: route.label, emph: highlightRefs.includes('diversion'), coordinates });
    }
  }

  for (const hub of HUBS) {
    points.push({
      id: hub.id,
      kind: 'hub',
      label: hub.label,
      emph: highlightRefs.includes('hub'),
      coordinate: chainageToLngLat(hub.road, hub.kp),
      road: hub.road,
      kp: hub.kp,
    });
  }

  for (const band of environment.fogBands) {
    lines.push({
      id: `fog-${band.road}-${band.fromKp}`,
      kind: 'fog',
      label: `团雾带 K${band.fromKp}–${band.toKp}`,
      emph: highlightRefs.includes('fog'),
      coordinates: roadCoordinatesBetween(band.road, band.fromKp, band.toKp),
    });
  }

  if (runtime?.plan) {
    const twinPhase = runtime.twin?.phase;
    const controlZone = parseKpRange(textParam(runtime.plan, 'M_通风', '无人管制区'));
    if (controlZone && (!twinPhase || twinPhase.ventilation)) {
      const coordinates = roadCoordinatesBetween(runtime.road, controlZone.fromKp, controlZone.toKp);
      lines.push({
        id: `control-zone-${runtime.road}-${controlZone.fromKp}`,
        kind: 'controlZone',
        label: `无人管制区 K${controlZone.fromKp.toFixed(1)}–K${controlZone.toKp.toFixed(1)}`,
        emph: highlightRefs.includes('controlZone'),
        coordinates,
      });

      const ventilation = twinPhase?.ventilation;
      const exhaustDir = textParam(runtime.plan, 'M_通风', '排风方向') ?? '';
      const airflow = ventilation
        ? roadCoordinatesBetween(runtime.road, ventilation.tunnelFromKp, ventilation.tunnelToKp)
        : coordinates;
      lines.push({
        id: `wind-${runtime.road}-${ventilation?.tunnelFromKp ?? controlZone.fromKp}`,
        kind: 'wind',
        label: ventilation
          ? `${ventilation.fanId} 正向排风 · ${ventilation.naturalWindSpeedMps.toFixed(1)}m/s`
          : exhaustDir || '隧道通风方向',
        emph: highlightRefs.includes('wind'),
        coordinates: ventilation?.direction === 'decreasing' || (!ventilation && exhaustDir.includes('反向')) ? [...airflow].reverse() : airflow,
      });
      if (ventilation) {
        lines.push({
          id: `gas-plume-${runtime.road}-${ventilation.plumeFromKp}`,
          kind: 'gasPlume',
          label: `轻质泄漏物扩散 K${ventilation.plumeFromKp.toFixed(1)}–K${ventilation.plumeToKp.toFixed(1)}`,
          emph: true,
          coordinates: roadCoordinatesBetween(runtime.road, ventilation.plumeFromKp, ventilation.plumeToKp),
        });
      }
    }

    const closureParam = textParam(runtime.plan, 'M_全封', '封道执行落点')
      ?? textParam(runtime.plan, 'M_全封', '封道点计算值');
    const closureKp = parseKp(closureParam);
    if (closureKp != null && (!twinPhase || twinPhase.traffic.closureActive)) {
      const labelPrefix = closureParam?.includes('@') ? closureParam.split('@')[0] : '封道执行点';
      points.push({
        id: `closure-${runtime.road}-${closureKp}`,
        kind: 'closure',
        label: `${labelPrefix}@K${closureKp}`,
        emph: highlightRefs.includes('closure'),
        coordinate: chainageToLngLat(runtime.road, closureKp),
        road: runtime.road,
        kp: closureKp,
      });
    }
  }

  return { lines, points };
}

/** 返回给定道路上、位于 kp 上游（桩号更小）最近的枢纽；用于队尾抵达判定与自引用检测。 */
export function nearestUpstreamHub(road: RoadId, kp: number): HubSpec | undefined {
  return HUBS
    .filter((h) => h.road === road && h.kp < kp)
    .sort((a, b) => b.kp - a.kp)[0];
}
