// ============================================================
// 五个运行模式演示案例数据（对应 事件案例/五个案例.md）。
// 这里只保存事件输入和环境快照，不保存推理结论；加载时统一经过 ingestReport。
// ============================================================

import type { RuntimeEventInput } from '../engine/ingest';
import type { EnvironmentState } from '../engine/conditions';
import type { DemoTwinScript } from '../gis/demoTwinScenario';

export type DemoCaseId = 'cross-event-diversion' | 'resource-squeeze' | 'condition-jump' | 'fact-retraction' | 'self-reference';

export interface DemoCaseEvent {
  /** 相对案例基准时钟的模拟秒数。 */
  simSec: number;
  input: RuntimeEventInput;
  /** 接入该事件后立即把资源标记为被该事件占用，供后续事件读取。 */
  occupyResources?: string[];
}

export interface DemoCase {
  id: DemoCaseId;
  title: string;
  summary: string;
  sceneBaseSec: number;
  environment: EnvironmentState;
  events: DemoCaseEvent[];
  /** 可选的 GIS 孪生演变脚本；用于将案例现场过程还原为共享地图状态。 */
  twinScript?: DemoTwinScript;
  finalSimSec?: number;
}

const EMPTY_ENVIRONMENT: EnvironmentState = { fogBands: [], offlineDeviceIds: [] };

export const DEMO_CASES: DemoCase[] = [
  {
    id: 'cross-event-diversion',
    title: '案例一 · 跨事件分流冲突',
    summary: 'G65 K1180 追尾的默认分流指向 G56 K27，系统命中 G56 K30 侧翻并裁剪路径。',
    sceneBaseSec: 14 * 3600,
    environment: EMPTY_ENVIRONMENT,
    events: [
      {
        simSec: 40 * 60 + 12,
        input: {
          sourceKind: 'CAM 视频检出',
          road: 'G56',
          accidentKp: 30,
          typeNodeId: 'E_侧翻',
          label: 'G56 K30 货车侧翻',
          lanesTotal: 2,
          lanesClosed: 1,
          q: 3410,
          vf: 110,
          direction: 'down',
        },
      },
      {
        simSec: 80 * 60 + 5,
        input: {
          sourceKind: 'CAM 视频检出',
          road: 'G65',
          accidentKp: 1180,
          typeNodeId: 'E_追尾',
          label: 'G65 K1180 两车追尾',
          lanesTotal: 3,
          lanesClosed: 2,
          q: 4300,
          casualties: 1,
          direction: 'down',
        },
      },
    ],
    twinScript: {
      id: 'cross-event-diversion-twin', road: 'G65', eventIndex: 1,
      resourceRoutes: [
        { resourceId: 'A-01', targetKp: 1180, departSimSec: 80 * 60 + 60, arriveSimSec: 83 * 60, label: '抵达 G65 K1180 伤员转运点' },
        { resourceId: 'L-01', targetKp: 1162, departSimSec: 83 * 60, arriveSimSec: 85 * 60, label: '抵达 VMS-02 近端限速与分流提示点' },
        { resourceId: 'W-01', targetKp: 1180, departSimSec: 83 * 60, arriveSimSec: 107 * 60, label: '由 K1150 向 G65 K1180 转场清障' },
      ],
      eventScripts: [{
        eventIndex: 0,
        phases: [
          { atSimSec: 40 * 60 + 12, label: '14:40 G56 K30 侧翻占用一车道', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 27, queueTailKp: 30, queuedVehicleCount: 8, queueSpeedKmh: 18, controlledFlow: { fromKp: 27, toKp: 30, vehicleCount: 10, speedKmh: 45 }, visibilityMeters: 800 }, activeDeviceIds: ['VMS-G56-01'] },
          { atSimSec: 80 * 60 + 5, label: '15:20 侧翻仍在处置，G56 K27 汇入区进入冲突窗口', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 27, queueTailKp: 30, queuedVehicleCount: 14, queueSpeedKmh: 12, controlledFlow: { fromKp: 27, toKp: 30, vehicleCount: 8, speedKmh: 35 }, visibilityMeters: 700 }, activeDeviceIds: ['VMS-G56-01'] },
          { atSimSec: 82 * 60, label: '15:22 G56 队尾向 K27 回溯', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 27, queueTailKp: 29.7, queuedVehicleCount: 18, queueSpeedKmh: 8, controlledFlow: { fromKp: 27, toKp: 30, vehicleCount: 6, speedKmh: 28 }, visibilityMeters: 650 }, activeDeviceIds: ['VMS-G56-01'] },
          { atSimSec: 105 * 60, label: '15:45 G56 队尾接近 K27 汇入区，持续禁止导入增量车流', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 27, queueTailKp: 27.2, queuedVehicleCount: 30, queueSpeedKmh: 5, controlledFlow: { fromKp: 27, toKp: 30, vehicleCount: 4, speedKmh: 18 }, visibilityMeters: 650 }, activeDeviceIds: ['VMS-G56-01'] },
          { atSimSec: 108 * 60, label: '15:48 G56 侧翻货车清撤完成，双车道恢复通行', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 27, queueTailKp: 30, queuedVehicleCount: 0, queueSpeedKmh: 82, controlledFlow: { fromKp: 27, toKp: 30, vehicleCount: 18, speedKmh: 82 }, availableLanes: 2, capacityFactor: 0.95, visibilityMeters: 1000 }, completion: { stage: '处置完成', note: 'G56 K30 侧翻货车已清撤，双车道恢复通行。', finalizeEvent: true } },
        ],
      }],
      phases: [
        { atSimSec: 80 * 60 + 5, label: '15:20 G65 K1180 两车追尾，默认导向 G56 K27', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1162, queueTailKp: 1179.8, queuedVehicleCount: 16, queueSpeedKmh: 12, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 12, speedKmh: 42 }, visibilityMeters: 900 }, diversion: { id: 'divert-g56-default', label: '默认分流 K1160 → G56 K27', fromKp: 1160, connectorRoad: 'G56', connectorFromKp: 27, connectorToKp: 31 } },
        { atSimSec: 81 * 60, label: '15:21 主线排队形成，等待承接路段冲突校验', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1162, queueTailKp: 1179.4, queuedVehicleCount: 24, queueSpeedKmh: 8, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 10, speedKmh: 35 }, visibilityMeters: 900 }, diversion: { id: 'divert-g56-default', label: '默认分流 K1160 → G56 K27（待校验）', fromKp: 1160, connectorRoad: 'G56', connectorFromKp: 27, connectorToKp: 31 } },
        { atSimSec: 82 * 60, label: '15:22 G56 K30 侧翻队尾与主线分流时间窗重叠', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1162, queueTailKp: 1178.8, queuedVehicleCount: 31, queueSpeedKmh: 6, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 9, speedKmh: 30 }, visibilityMeters: 850 }, diversion: { id: 'divert-g56-blocked', label: 'G56 K27 承接受阻 · 默认分流裁剪', fromKp: 1160, connectorRoad: 'G56', connectorFromKp: 27, connectorToKp: 31 } },
        { atSimSec: 83 * 60, label: '15:23 确认 K1140 → S204 提前分流', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1162, queueTailKp: 1178.1, queuedVehicleCount: 34, queueSpeedKmh: 7, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 12, speedKmh: 38 }, visibilityMeters: 850 }, autoIssueMeasureIds: ['M_封车道', 'M_调清障', 'M_实况', 'M_提前分流', 'M_限速', 'M_拥堵预警', 'M_调120'], activeDeviceIds: ['VMS-01', 'VMS-02'], diversion: { id: 'divert-s204-active', label: '提前分流 K1140 → S204（已下发）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 } },
          { atSimSec: 105 * 60, label: '15:45 主线清障与伤员转运推进，提前分流持续生效', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1162, queueTailKp: 1176.7, queuedVehicleCount: 18, queueSpeedKmh: 20, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 16, speedKmh: 55 }, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-01', 'VMS-02'], diversion: { id: 'divert-s204-active', label: '提前分流 K1140 → S204（持续）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 } },
        { atSimSec: 110 * 60, label: '15:50 追尾车辆清撤，G65 K1180 三车道恢复', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1162, queueTailKp: 1180, queuedVehicleCount: 0, queueSpeedKmh: 88, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 24, speedKmh: 88 }, availableLanes: 3, capacityFactor: 0.95, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-01', 'VMS-02'], diversion: { id: 'divert-s204-active', label: '提前分流 K1140 → S204（任务完成）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 }, completion: { stage: '处置完成', note: 'G65 K1180 追尾车辆已清撤，提前分流解除，主线恢复三车道通行。', finalizeEvent: true } },
      ],
    },
    finalSimSec: 80 * 60 + 5,
  },
  {
    id: 'resource-squeeze',
    title: '案例二 · 资源链式挤兑',
    summary: 'G65 K1210 抛锚时 W-01/W-02 被 K1180 事故占用，比较等待释放与跨区调派。',
    sceneBaseSec: 14 * 3600,
    environment: EMPTY_ENVIRONMENT,
    events: [
      {
        simSec: 10 * 60,
        input: {
          sourceKind: '12122 电话报警',
          road: 'G65',
          accidentKp: 1180,
          typeNodeId: 'E_追尾',
          label: 'G65 K1180 重型货车追尾',
          lanesTotal: 3,
          lanesClosed: 2,
          q: 4300,
          casualties: 2,
          stage: '清障作业中（已 28min）',
          direction: 'down',
        },
        occupyResources: ['W-01', 'W-02'],
      },
      {
        simSec: 40 * 60,
        input: {
          sourceKind: 'CAM 视频检出',
          road: 'G65',
          accidentKp: 1210,
          typeNodeId: 'E_抛锚',
          label: 'G65 K1210 半挂车抛锚',
          lanesTotal: 3,
          lanesClosed: 1,
          q: 4500,
          direction: 'down',
        },
      },
    ],
    twinScript: {
      id: 'resource-squeeze-twin', road: 'G65', eventIndex: 1,
      resourceRoutes: [
        { resourceId: 'W-01', targetKp: 1180, departSimSec: 0, arriveSimSec: 10 * 60, label: '在 EV-A201 执行重型货车分离清障' },
        { resourceId: 'W-01', fromKp: 1180, targetKp: 1210, departSimSec: 57 * 60, arriveSimSec: 81 * 60, label: 'EV-A201 释放后转场至 G65 K1210' },
        { resourceId: 'L-02', targetKp: 1208.5, departSimSec: 43 * 60, arriveSimSec: 91 * 60, label: '前置匝道口，布设锥桶与限速警戒' },
      ],
      eventScripts: [{
        eventIndex: 0,
        phases: [
          { atSimSec: 10 * 60, label: '14:10 EV-A201 清障作业中，W-01/W-02 被占用', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1176, queueTailKp: 1178.8, queuedVehicleCount: 24, queueSpeedKmh: 8, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 8, speedKmh: 30 }, visibilityMeters: 900 } },
          { atSimSec: 40 * 60, label: '14:40 占用方仍在 K1180 作业，资源链进入等待状态', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1176, queueTailKp: 1177.6, queuedVehicleCount: 32, queueSpeedKmh: 6, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 6, speedKmh: 24 }, visibilityMeters: 900 } },
          { atSimSec: 57 * 60, label: '14:57 EV-A201 清障完成，W-01 释放转场', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1176, queueTailKp: 1180, queuedVehicleCount: 0, queueSpeedKmh: 0, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 16, speedKmh: 65 }, visibilityMeters: 1000 } },
          { atSimSec: 60 * 60, label: '15:00 EV-A201 现场清撤，K1180 三车道恢复', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1176, queueTailKp: 1180, queuedVehicleCount: 0, queueSpeedKmh: 88, controlledFlow: { fromKp: 1178, toKp: 1182, vehicleCount: 24, speedKmh: 88 }, availableLanes: 3, capacityFactor: 0.95, visibilityMeters: 1000 }, completion: { stage: '处置完成', note: 'K1180 占用方事故已清撤，W-01 已释放并完成资源交接。', finalizeEvent: true } },
        ],
      }],
      phases: [
        { atSimSec: 40 * 60, label: '14:40 G65 K1210 半挂车抛锚，占用第 3 车道', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1209.8, queuedVehicleCount: 12, queueSpeedKmh: 15, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 16, speedKmh: 40 }, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-06'] },
        { atSimSec: 42 * 60, label: '14:42 资源链比较 W-01 等待 41 分钟与 W-EX 备援 48 分钟', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1209.4, queuedVehicleCount: 24, queueSpeedKmh: 8, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 12, speedKmh: 32 }, visibilityMeters: 950 }, activeDeviceIds: ['VMS-06'] },
        { atSimSec: 43 * 60, label: '14:43 VMS-06 限速与 L-02 前置，抑制匝道口前排队', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1209.0, queuedVehicleCount: 32, queueSpeedKmh: 7, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 14, speedKmh: 35 }, visibilityMeters: 950 }, autoIssueMeasureIds: ['M_封车道', 'M_调清障', 'M_实况', 'M_预置分流', 'M_限速', 'M_拥堵预警'], activeDeviceIds: ['VMS-06'] },
        { atSimSec: 57 * 60, label: '14:57 W-01 由 K1180 释放，开始向 K1210 转场', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1208.6, queuedVehicleCount: 34, queueSpeedKmh: 6, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 14, speedKmh: 35 }, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-06'] },
        { atSimSec: 81 * 60, label: '15:21 W-01 到场拖移，队尾保持在 K1208.5 下游', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1208.6, queuedVehicleCount: 24, queueSpeedKmh: 16, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 18, speedKmh: 52 }, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-06'] },
        { atSimSec: 87 * 60, label: '15:27 半挂车拖离，开放两车道并保持匝道口限速', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1209.3, queuedVehicleCount: 8, queueSpeedKmh: 48, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 22, speedKmh: 68 }, availableLanes: 2, capacityFactor: 0.9, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-06'] },
        { atSimSec: 92 * 60, label: '15:32 K1210 现场清撤，三车道恢复通行', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1205, queueTailKp: 1210, queuedVehicleCount: 0, queueSpeedKmh: 88, controlledFlow: { fromKp: 1208.8, toKp: 1211.2, vehicleCount: 26, speedKmh: 88 }, availableLanes: 3, capacityFactor: 0.95, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-06'], completion: { stage: '处置完成', note: 'G65 K1210 半挂车已拖离，资源链解除，主线恢复三车道通行。', finalizeEvent: true } },
      ],
    },
    finalSimSec: 40 * 60,
  },
  {
    id: 'condition-jump',
    title: '案例三 · 危化品×隧道×团雾×夜间',
    summary: 'G65 K1177.2 液氨罐车疑似泄漏，动态计算雾区外封道点、通风方向和管制区。',
    sceneBaseSec: 23 * 3600,
    environment: {
      fogBands: [{ road: 'G65', fromKp: 1170, toKp: 1180.4 }],
      offlineDeviceIds: [],
    },
    events: [
      {
        simSec: 40 * 60 + 18,
        input: {
          sourceKind: 'CAM 视频检出',
          road: 'G65',
          accidentKp: 1177.2,
          typeNodeId: 'E_危化泄漏',
          label: '青云隧道 K1177.2 液氨罐车追尾',
          lanesTotal: 3,
          lanesClosed: 3,
          q: 3600,
          casualties: 2,
          hazmat: true,
          spillLighterThanAir: true,
          wind: { dir: 'forward', speed: 2.1 },
          direction: 'down',
        },
      },
    ],
    twinScript: {
      id: 'qinyun-hazmat-night',
      road: 'G65',
      eventIndex: 0,
      resourceRoutes: [
        { resourceId: 'L-01', targetKp: 1168, departSimSec: 43 * 60, arriveSimSec: 50 * 60, label: '抵达 VMS-05 执行入口侧封控' },
        { resourceId: 'A-01', targetKp: 1178.4, departSimSec: 43 * 60, arriveSimSec: 50 * 60, label: '出口侧 K1178.4 外待命' },
        { resourceId: 'F-STA', targetKp: 1148, departSimSec: 43 * 60, arriveSimSec: 58 * 60, label: '抵达 K1148 消防联勤站，准备入路' },
        { resourceId: 'F-STA', targetKp: 1175.5, departSimSec: 58 * 60, arriveSimSec: 65 * 60, label: '由 K1148 入路，向入口侧集结点行进' },
      ],
      phases: [
        {
          atSimSec: 40 * 60 + 18,
          label: '23:40:18 事故确认，隧道内三车道受阻',
          traffic: {
            travelDirection: 'increasing', closureActive: false, closureKp: 1168,
            queueTailKp: 1176.4, queuedVehicleCount: 18, queueSpeedKmh: 8,
            evacuation: { fromKp: 1177.3, toKp: 1178.3, vehicleCount: 7, speedKmh: 28 },
            visibilityMeters: 140,
          },
          prunedDeviceIds: ['VMS-03'],
        },
        {
          atSimSec: 41 * 60,
          label: '23:41 封道点裁剪，VMS-05 作为雾区外执行点',
          traffic: {
            travelDirection: 'increasing', closureActive: false, closureKp: 1168,
            queueTailKp: 1175.7, queuedVehicleCount: 25, queueSpeedKmh: 6,
            evacuation: { fromKp: 1177.3, toKp: 1178.4, vehicleCount: 7, speedKmh: 24 },
            visibilityMeters: 110,
          },
          prunedDeviceIds: ['VMS-03'], activeDeviceIds: ['VMS-05'],
        },
        {
          atSimSec: 42 * 60,
          label: '23:42 FAN-01 正向排风，出口侧设置无人管制区',
          traffic: {
            travelDirection: 'increasing', closureActive: false, closureKp: 1168,
            queueTailKp: 1175.1, queuedVehicleCount: 33, queueSpeedKmh: 5,
            evacuation: { fromKp: 1177.3, toKp: 1178.4, vehicleCount: 8, speedKmh: 20 },
            visibilityMeters: 90,
          },
          ventilation: {
            fanId: 'FAN-01', windSensorId: 'WD-01', tunnelFromKp: 1176, tunnelToKp: 1178.4,
            direction: 'increasing', naturalWindSpeedMps: 2.1, fanEnabled: true, plumeFromKp: 1177.2, plumeToKp: 1178.4,
          },
          prunedDeviceIds: ['VMS-03'], activeDeviceIds: ['VMS-05', 'FAN-01', 'WD-01'],
        },
        {
          atSimSec: 43 * 60,
          label: '23:43 全封、通风与疏散指令确认下发',
          traffic: {
            travelDirection: 'increasing', closureActive: true, closureKp: 1168,
            queueTailKp: 1174.5, queuedVehicleCount: 42, queueSpeedKmh: 0,
            evacuation: { fromKp: 1177.3, toKp: 1178.4, vehicleCount: 6, speedKmh: 16 },
            visibilityMeters: 100,
          },
          ventilation: {
            fanId: 'FAN-01', windSensorId: 'WD-01', tunnelFromKp: 1176, tunnelToKp: 1178.4,
            direction: 'increasing', naturalWindSpeedMps: 2.1, fanEnabled: true, plumeFromKp: 1177.2, plumeToKp: 1178.4,
          },
          autoIssueMeasureIds: ['M_封车道', 'M_调清障', 'M_实况', 'M_预置分流', 'M_限速', 'M_拥堵预警', 'M_全封', 'M_调消防', 'M_通风', 'M_调120'],
          prunedDeviceIds: ['VMS-03'], activeDeviceIds: ['VMS-05', 'FAN-01', 'WD-01'],
        },
        {
          atSimSec: 50 * 60,
          label: '23:50 路政封控到位，救护车出口侧待命',
          traffic: {
            travelDirection: 'increasing', closureActive: true, closureKp: 1168,
            queueTailKp: 1173.8, queuedVehicleCount: 38, queueSpeedKmh: 0,
            evacuation: { fromKp: 1177.3, toKp: 1178.4, vehicleCount: 4, speedKmh: 12 },
            visibilityMeters: 130,
          },
          ventilation: {
            fanId: 'FAN-01', windSensorId: 'WD-01', tunnelFromKp: 1176, tunnelToKp: 1178.4,
            direction: 'increasing', naturalWindSpeedMps: 2.1, fanEnabled: true, plumeFromKp: 1177.2, plumeToKp: 1178.1,
          },
          prunedDeviceIds: ['VMS-03'], activeDeviceIds: ['VMS-05', 'FAN-01', 'WD-01'],
        },
        {
          atSimSec: 58 * 60,
          label: '23:58 消防抵达 K1148，准备由入口侧入路检测',
          traffic: {
            travelDirection: 'increasing', closureActive: true, closureKp: 1168,
            queueTailKp: 1173.2, queuedVehicleCount: 30, queueSpeedKmh: 0,
            evacuation: { fromKp: 1177.3, toKp: 1178.4, vehicleCount: 3, speedKmh: 10 },
            visibilityMeters: 165,
          },
          ventilation: {
            fanId: 'FAN-01', windSensorId: 'WD-01', tunnelFromKp: 1176, tunnelToKp: 1178.4,
            direction: 'increasing', naturalWindSpeedMps: 2.1, fanEnabled: true, plumeFromKp: 1177.2, plumeToKp: 1177.8,
          },
          prunedDeviceIds: ['VMS-03'], activeDeviceIds: ['VMS-05', 'FAN-01', 'WD-01'],
        },
        {
          atSimSec: 70 * 60,
          label: '00:10 现场检测完成，解除全封并开放一条受控车道',
          traffic: {
            travelDirection: 'increasing', closureActive: false, closureKp: 1168,
            queueTailKp: 1175.8, queuedVehicleCount: 12, queueSpeedKmh: 38,
            controlledFlow: { fromKp: 1176.2, toKp: 1178.4, vehicleCount: 12, speedKmh: 45 },
            availableLanes: 1, capacityFactor: 0.85, visibilityMeters: 550,
          },
          activeDeviceIds: ['VMS-05', 'FAN-01', 'WD-01'],
        },
        {
          atSimSec: 75 * 60,
          label: '00:15 残余风险排除，隧道清撤并恢复三车道通行',
          traffic: {
            travelDirection: 'increasing', closureActive: false, closureKp: 1168,
            queueTailKp: 1177.2, queuedVehicleCount: 0, queueSpeedKmh: 88,
            controlledFlow: { fromKp: 1176.2, toKp: 1178.4, vehicleCount: 24, speedKmh: 88 },
            availableLanes: 3, capacityFactor: 0.95, visibilityMeters: 1000,
          },
          activeDeviceIds: ['VMS-05'],
          completion: { stage: '处置完成', note: '青云隧道残余风险已排除，现场清撤并恢复三车道通行。', finalizeEvent: true },
        },
      ],
    },
    finalSimSec: 40 * 60 + 18,
  },
  {
    id: 'fact-retraction',
    title: '案例四 · 属性修正与撤销传导',
    summary: '疑似泄漏被现场检测证伪，系统生成 V2 并逐条输出撤销、降级、降级、保留。',
    sceneBaseSec: 10 * 3600,
    environment: {
      fogBands: [{ road: 'G65', fromKp: 1170, toKp: 1180.4 }],
      offlineDeviceIds: [],
    },
    events: [
      {
        simSec: 5 * 60,
        input: {
          sourceKind: 'CAM 视频检出',
          road: 'G65',
          accidentKp: 1177.2,
          typeNodeId: 'E_危化泄漏',
          label: '青云隧道 K1177.2 疑似泄漏追尾',
          lanesTotal: 3,
          lanesClosed: 2,
          q: 3600,
          casualties: 2,
          hazmat: true,
          spillLighterThanAir: true,
          wind: { dir: 'forward', speed: 2.1 },
          direction: 'down',
        },
      },
    ],
    twinScript: {
      id: 'fact-retraction-twin', road: 'G65', eventIndex: 0,
      resourceRoutes: [
        { resourceId: 'L-01', targetKp: 1168, departSimSec: 7 * 60, arriveSimSec: 12 * 60, label: '危化品初报阶段入口侧警戒' },
        { resourceId: 'A-01', targetKp: 1178.4, departSimSec: 7 * 60, arriveSimSec: 12 * 60, label: '危化品初报阶段出口侧待命' },
      ],
      revisions: [{ id: 'R-fact-retraction', eventIndex: 0, simSec: 25 * 60, retractedFacts: ['F_泄漏'], note: '现场消防检测为零，核验货单和罐体照片后确认无泄漏。' }],
      phases: [
        { atSimSec: 5 * 60, label: '10:05 疑似泄漏初报，隧道内封闭两车道', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1168, queueTailKp: 1176.5, queuedVehicleCount: 18, queueSpeedKmh: 8, controlledFlow: { fromKp: 1176.2, toKp: 1178.2, vehicleCount: 5, speedKmh: 25 }, visibilityMeters: 180 }, prunedDeviceIds: ['VMS-03'] },
        { atSimSec: 7 * 60, label: '10:07 高危措施确认，全幅封控与应急通风生效', traffic: { travelDirection: 'increasing', closureActive: true, closureKp: 1168, queueTailKp: 1175.8, queuedVehicleCount: 28, queueSpeedKmh: 0, evacuation: { fromKp: 1177.3, toKp: 1178.4, vehicleCount: 4, speedKmh: 15 }, visibilityMeters: 150 }, ventilation: { fanId: 'FAN-01', windSensorId: 'WD-01', tunnelFromKp: 1176, tunnelToKp: 1178.4, direction: 'increasing', naturalWindSpeedMps: 2.1, fanEnabled: true, plumeFromKp: 1177.2, plumeToKp: 1178.3 }, autoIssueMeasureIds: ['M_封车道', 'M_调清障', 'M_实况', 'M_预置分流', 'M_限速', 'M_拥堵预警', 'M_全封', 'M_调消防', 'M_通风', 'M_调120'], prunedDeviceIds: ['VMS-03'], activeDeviceIds: ['VMS-05', 'FAN-01', 'WD-01'] },
        { atSimSec: 25 * 60, label: '10:25 检测证伪泄漏，撤销消防与应急排风', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1168, queueTailKp: 1175.2, queuedVehicleCount: 22, queueSpeedKmh: 15, controlledFlow: { fromKp: 1176.2, toKp: 1178.2, vehicleCount: 12, speedKmh: 40 }, visibilityMeters: 600 }, activeDeviceIds: ['VMS-05'] },
        { atSimSec: 28 * 60, label: '10:28 V2 确认，保留两车道封闭与限速 40', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1168, queueTailKp: 1175.8, queuedVehicleCount: 16, queueSpeedKmh: 22, controlledFlow: { fromKp: 1176.2, toKp: 1178.2, vehicleCount: 16, speedKmh: 40 }, visibilityMeters: 800 }, autoIssueMeasureIds: ['M_封车道', 'M_调清障', 'M_实况', 'M_预置分流', 'M_限速', 'M_拥堵预警', 'M_全封', 'M_通风', 'M_调120'], activeDeviceIds: ['VMS-05'] },
        { atSimSec: 35 * 60, label: '10:35 车辆拖离，开放第二车道，队列开始消散', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1168, queueTailKp: 1176.7, queuedVehicleCount: 6, queueSpeedKmh: 55, controlledFlow: { fromKp: 1176.2, toKp: 1178.2, vehicleCount: 20, speedKmh: 68 }, availableLanes: 2, capacityFactor: 0.9, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-05'] },
        { atSimSec: 45 * 60, label: '10:45 现场清撤，恢复三车道通行', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1168, queueTailKp: 1177.2, queuedVehicleCount: 0, queueSpeedKmh: 88, controlledFlow: { fromKp: 1176.2, toKp: 1178.2, vehicleCount: 24, speedKmh: 88 }, availableLanes: 3, capacityFactor: 0.95, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-05'], completion: { stage: '处置完成', note: '事故车辆已清撤，V2 措施完成，隧道恢复三车道通行。', finalizeEvent: true } },
      ],
    },
    finalSimSec: 5 * 60,
  },
  {
    id: 'self-reference',
    title: '案例五 · 方案自引用与提前分流',
    summary: 'G65 K1165.8 的队尾预计 35.5 min 到达 K1160，追上本方案自己的 G56 分流承接线。',
    sceneBaseSec: 16 * 3600 + 30 * 60,
    environment: EMPTY_ENVIRONMENT,
    events: [
      {
        simSec: 30,
        input: {
          sourceKind: '雷视融合',
          road: 'G65',
          accidentKp: 1165.8,
          typeNodeId: 'E_追尾',
          label: 'G65 K1165.8 三车追尾',
          lanesTotal: 3,
          lanesClosed: 2,
          q: 5200,
          direction: 'down',
        },
      },
    ],
    twinScript: {
      id: 'self-reference-twin', road: 'G65', eventIndex: 0,
      resourceRoutes: [
        { resourceId: 'L-01', targetKp: 1140, departSimSec: 3 * 60, arriveSimSec: 6 * 60, label: 'K1140 提前分流提示与秩序维护' },
        { resourceId: 'W-01', targetKp: 1165.8, departSimSec: 3 * 60, arriveSimSec: 15 * 60 + 40, label: '向 G65 K1165.8 事故点转场清障' },
      ],
      phases: [
        { atSimSec: 30, label: '16:30 三车追尾接入，默认候选导向 G56', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1165.8, queuedVehicleCount: 4, queueSpeedKmh: 16, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 16, speedKmh: 45 }, visibilityMeters: 1000 }, diversion: { id: 'selfref-g56-default', label: '默认分流 K1160 → G56 K27', fromKp: 1160, connectorRoad: 'G56', connectorFromKp: 27, connectorToKp: 31 } },
        { atSimSec: 90, label: '16:31 队尾回溯计算启动，默认分流尚待自引用校验', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1165.5, queuedVehicleCount: 12, queueSpeedKmh: 10, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 13, speedKmh: 38 }, visibilityMeters: 1000 }, diversion: { id: 'selfref-g56-default', label: '默认分流 K1160 → G56 K27（待自引用校验）', fromKp: 1160, connectorRoad: 'G56', connectorFromKp: 27, connectorToKp: 31 } },
        { atSimSec: 120, label: '16:32 识别 K1160 枢纽交叉线与本方案 G56 承接线重合', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1165.2, queuedVehicleCount: 18, queueSpeedKmh: 8, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 10, speedKmh: 32 }, visibilityMeters: 1000 }, diversion: { id: 'selfref-g56-blocked', label: 'G56 承接线将被本事故队尾掐断', fromKp: 1160, connectorRoad: 'G56', connectorFromKp: 27, connectorToKp: 31 } },
        { atSimSec: 3 * 60, label: '16:33 确认 K1140 → S204 提前分流，锁定 35.5 分钟行动窗口', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1164.9, queuedVehicleCount: 24, queueSpeedKmh: 8, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 14, speedKmh: 42 }, visibilityMeters: 1000 }, autoIssueMeasureIds: ['M_封车道', 'M_调清障', 'M_实况', 'M_提前分流', 'M_限速', 'M_拥堵预警'], activeDeviceIds: ['VMS-01'], diversion: { id: 'selfref-s204-active', label: '提前分流 K1140 → S204（已下发）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 } },
        { atSimSec: 36 * 60, label: '17:06 队尾兑现至 K1160 枢纽，增量车流已绕开 G56', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1160, queuedVehicleCount: 58, queueSpeedKmh: 4, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 12, speedKmh: 35 }, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-01'], diversion: { id: 'selfref-s204-active', label: '提前分流 K1140 → S204（预测兑现）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 } },
        { atSimSec: 45 * 60, label: '17:15 清障推进，队列开始向事故点收敛', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1161.5, queuedVehicleCount: 34, queueSpeedKmh: 16, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 18, speedKmh: 55 }, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-01'], diversion: { id: 'selfref-s204-active', label: '提前分流 K1140 → S204（恢复期）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 } },
        { atSimSec: 55 * 60, label: '17:25 事故车辆清撤，解除提前分流并恢复三车道通行', traffic: { travelDirection: 'increasing', closureActive: false, closureKp: 1160, queueTailKp: 1165.8, queuedVehicleCount: 0, queueSpeedKmh: 88, controlledFlow: { fromKp: 1160, toKp: 1166.5, vehicleCount: 26, speedKmh: 88 }, availableLanes: 3, capacityFactor: 0.95, visibilityMeters: 1000 }, activeDeviceIds: ['VMS-01'], diversion: { id: 'selfref-s204-active', label: '提前分流 K1140 → S204（任务完成）', fromKp: 1140, connectorRoad: 'S204', connectorFromKp: 0, connectorToKp: 40 }, completion: { stage: '处置完成', note: 'G65 K1165.8 事故车辆已清撤，提前分流解除，主线恢复三车道通行。', finalizeEvent: true } },
      ],
    },
    finalSimSec: 30,
  },
];

export function demoCaseById(id: DemoCaseId): DemoCase {
  const demoCase = DEMO_CASES.find((item) => item.id === id);
  if (!demoCase) throw new Error(`未知演示案例：${id}`);
  return demoCase;
}
