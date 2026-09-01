import type {
  ConfirmedEventFacts,
  EventLocation,
  MonitoringEventType,
} from '../../domain/monitoring';
import type { MonitoringMessage, SourceEvidenceReference } from './monitoringSourceAdapter';
import { monitoringEventIdForCorrelation } from '../engine/sourceIngestion';

export const DEFAULT_MONITORING_EVENT_COUNT = 24;

export interface DefaultMonitoringEventSpec {
  id: string;
  eventType: MonitoringEventType;
  location: EventLocation;
  confidence: number;
  observedFacts: Partial<ConfirmedEventFacts>;
}

function location(
  roadCode: string,
  direction: EventLocation['direction'],
  kilometer: number,
  facilityType: NonNullable<EventLocation['facilityType']>,
  laneIds: readonly string[],
  deviceSuffix: string,
): EventLocation {
  return {
    roadCode,
    direction,
    kilometer,
    facilityId: `${facilityType.toUpperCase()}-${roadCode}-${deviceSuffix}`,
    facilityType,
    laneIds,
    deviceId: `CAM-${roadCode}-${deviceSuffix}`,
  };
}

const definitions = [
  ['traffic-congestion-01', 'traffic_congestion', location('G65', 'up', 118.2, 'road', ['1', '2', '3'], '118-01'), 0.92,
    { queueLengthKm: 3.8, congestionDurationMin: 26, flowVehPerHour: 820, speedKmh: 12, notes: '收费站前车辆排队缓行' }],
  ['traffic-congestion-02', 'traffic_congestion', location('G30', 'down', 1046.5, 'road', ['1', '2', '3'], '1046-02'), 0.89,
    { queueLengthKm: 2.6, congestionDurationMin: 18, flowVehPerHour: 1060, speedKmh: 18, notes: '互通区域雨天拥堵' }],
  ['traffic-congestion-03', 'traffic_congestion', location('G5', 'up', 923.4, 'tunnel', ['1', '2', '3'], '923-03'), 0.91,
    { queueLengthKm: 4.2, congestionDurationMin: 31, flowVehPerHour: 760, speedKmh: 9, notes: '隧道入口长距离缓行' }],

  ['traffic-accident-01', 'traffic_accident', location('G70', 'up', 412.8, 'road', ['2'], '412-01'), 0.94,
    { lanesAffected: 1, lanesTotal: 3, vehicleCount: 2, casualties: 0, notes: '两车轻微追尾，占用一条车道' }],
  ['traffic-accident-02', 'traffic_accident', location('G40', 'down', 728.1, 'road', ['2'], '728-02'), 0.9,
    { lanesAffected: 1, lanesTotal: 3, vehicleCount: 2, casualties: 0, notes: '雨天车辆侧向碰撞' }],
  ['traffic-accident-03', 'traffic_accident', location('G22', 'up', 356.9, 'road', ['1', '2'], '356-03'), 0.93,
    { lanesAffected: 2, lanesTotal: 3, vehicleCount: 2, casualties: 0, notes: '夜间货车与小客车事故' }],

  ['pedestrian-intrusion-01', 'pedestrian_intrusion', location('G210', 'up', 221.6, 'road', ['3'], '221-01'), 0.86,
    { notes: '检测到行人在应急车道行走' }],
  ['pedestrian-intrusion-02', 'pedestrian_intrusion', location('G3511', 'down', 67.3, 'road', ['1'], '067-02'), 0.88,
    { notes: '检测到行人横穿入口匝道' }],
  ['pedestrian-intrusion-03', 'pedestrian_intrusion', location('G65', 'down', 284.7, 'tunnel', ['2'], '284-03'), 0.91,
    { notes: '检测到人员由检修通道进入隧道' }],

  ['wrong-way-driving-01', 'wrong_way_driving', location('G30', 'up', 1132.5, 'road', ['1'], '1132-01'), 0.95,
    { vehicleCount: 1, notes: '小客车在主线逆向行驶' }],
  ['wrong-way-driving-02', 'wrong_way_driving', location('G70', 'down', 489.2, 'road', ['1'], '489-02'), 0.92,
    { vehicleCount: 1, notes: '厢式车辆在出口匝道逆行' }],
  ['wrong-way-driving-03', 'wrong_way_driving', location('G40', 'up', 806.4, 'tunnel', ['2'], '806-03'), 0.96,
    { vehicleCount: 1, notes: '隧道内车辆逆向行驶' }],

  ['reversing-01', 'reversing', location('G5', 'down', 997.8, 'road', ['3'], '997-01'), 0.9,
    { vehicleCount: 1, notes: '车辆错过出口后在导流区倒车' }],
  ['reversing-02', 'reversing', location('G22', 'up', 402.6, 'road', ['3'], '402-02'), 0.87,
    { vehicleCount: 1, notes: '雨天车辆沿应急车道倒车' }],
  ['reversing-03', 'reversing', location('G210', 'down', 268.3, 'tunnel', ['3'], '268-03'), 0.93,
    { vehicleCount: 1, notes: '车辆在隧道入口附近倒车' }],

  ['abnormal-stop-01', 'abnormal_stop', location('G3511', 'up', 112.4, 'road', ['2'], '112-01'), 0.91,
    { lanesAffected: 1, lanesTotal: 3, vehicleCount: 1, notes: '小客车在行车道异常停车' }],
  ['abnormal-stop-02', 'abnormal_stop', location('G65', 'down', 347.1, 'road', ['3'], '347-02'), 0.89,
    { lanesAffected: 0, lanesTotal: 3, vehicleCount: 1, notes: '货车在应急车道长时间停车' }],
  ['abnormal-stop-03', 'abnormal_stop', location('G30', 'up', 1218.6, 'tunnel', ['1'], '1218-03'), 0.94,
    { lanesAffected: 1, lanesTotal: 2, vehicleCount: 1, notes: '客车在隧道内异常停车' }],

  ['fire-01', 'fire', location('G70', 'down', 537.7, 'road', ['3'], '537-01'), 0.96,
    { lanesAffected: 1, lanesTotal: 3, vehicleCount: 1, notes: '小客车发动机舱检测到明火和烟雾' }],
  ['fire-02', 'fire', location('G40', 'up', 874.3, 'road', ['3'], '874-02'), 0.95,
    { lanesAffected: 1, lanesTotal: 3, vehicleCount: 1, notes: '货车轮胎区域检测到明火和浓烟' }],
  ['fire-03', 'fire', location('G5', 'down', 1068.9, 'tunnel', ['1', '2'], '1068-03'), 0.97,
    { lanesAffected: 2, lanesTotal: 2, vehicleCount: 1, notes: '隧道车辆检测到明火和烟雾' }],

  ['road-debris-01', 'road_debris', location('G22', 'down', 451.2, 'road', ['2'], '451-01'), 0.88,
    { lanesAffected: 1, lanesTotal: 3, notes: '纸箱及包裹散落在行车道' }],
  ['road-debris-02', 'road_debris', location('G210', 'up', 315.5, 'road', ['2'], '315-02'), 0.9,
    { lanesAffected: 1, lanesTotal: 3, notes: '轮胎碎片散落在中间车道' }],
  ['road-debris-03', 'road_debris', location('G3511', 'down', 158.8, 'road', ['3'], '158-03'), 0.89,
    { lanesAffected: 1, lanesTotal: 3, notes: '木托盘及管材遗撒至路肩和行车道' }],
] as const satisfies readonly [
  string,
  MonitoringEventType,
  EventLocation,
  number,
  Partial<ConfirmedEventFacts>,
][];

export const DEFAULT_MONITORING_EVENT_SPECS: readonly DefaultMonitoringEventSpec[] = Object.freeze(
  definitions.map(([id, eventType, eventLocation, confidence, facts]) => ({
    id,
    eventType,
    location: eventLocation,
    confidence,
    observedFacts: {
      eventType,
      location: eventLocation,
      ...facts,
    },
  })),
);

export const DEFAULT_MONITORING_ROAD_CODES = Object.freeze(
  [...new Set(DEFAULT_MONITORING_EVENT_SPECS.map((spec) => spec.location.roadCode))],
);

function defaultCorrelationId(specId: string): string {
  return `CORR-DEFAULT-${specId}`;
}

const DEFAULT_MONITORING_EVENT_ID_SET = new Set(
  DEFAULT_MONITORING_EVENT_SPECS.map((spec) => monitoringEventIdForCorrelation(defaultCorrelationId(spec.id))),
);

export function isDefaultMonitoringEventId(eventId: string): boolean {
  return DEFAULT_MONITORING_EVENT_ID_SET.has(eventId);
}

function evidenceFor(spec: DefaultMonitoringEventSpec, capturedAt: string): SourceEvidenceReference[] {
  return [
    {
      evidenceId: `EVD-DEFAULT-${spec.id}-FRAME`,
      kind: 'key_frame',
      capturedAt,
      controlledRef: `/event-photos/generated/${spec.id}.webp`,
      available: true,
      archived: false,
      simulation: true,
    },
    {
      evidenceId: `EVD-DEFAULT-${spec.id}-VIDEO`,
      kind: 'video_clip',
      capturedAt,
      controlledRef: `demo-video://default/${spec.id}`,
      available: true,
      archived: false,
      simulation: true,
    },
  ];
}

export function buildDefaultMonitoringMessages(nowMs: number = Date.now()): readonly MonitoringMessage[] {
  if (!Number.isFinite(nowMs)) throw new Error('默认监测数据时间无效');
  return DEFAULT_MONITORING_EVENT_SPECS.map((spec, index) => {
    const detectedAt = new Date(nowMs - (index + 1) * 45_000).toISOString();
    const correlationId = defaultCorrelationId(spec.id);
    return {
      kind: 'source_alarm',
      messageId: `MSG-DEFAULT-${spec.id}`,
      correlationId,
      // 默认展示数据不占用专项场景的可恢复流游标。
      streamSequence: 0,
      emittedAt: detectedAt,
      simulation: true,
      payload: {
        sourceAlarmId: `SRC-DEFAULT-${spec.id}`,
        sourceType: 'video_ai',
        sourceSystem: 'DEMO-DEFAULT-VIDEO-AI',
        eventType: spec.eventType,
        eventSubtype: spec.id,
        detectedAt,
        location: structuredClone(spec.location),
        confidence: spec.confidence,
        algorithmVersion: 'demo-placeholder-v1.0',
        modelName: 'DemoPlaceholderDetector',
        rawPayloadRef: `demo-payload://default/${spec.id}`,
        evidence: evidenceFor(spec, detectedAt),
        observedFacts: structuredClone(spec.observedFacts),
        simulation: true,
      },
    } satisfies MonitoringMessage;
  });
}

if (DEFAULT_MONITORING_EVENT_SPECS.length !== DEFAULT_MONITORING_EVENT_COUNT) {
  throw new Error(`默认监测数据必须包含${DEFAULT_MONITORING_EVENT_COUNT}条事件`);
}
