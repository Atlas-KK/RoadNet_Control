import type { ConfirmedEventFacts, EventLocation, MonitoringEventType, SourceType } from '../../domain/monitoring';
import type {
  DemoScenarioId,
  DemoScenarioMetadata,
  MonitoringMessage,
  SourceEvidenceReference,
} from './monitoringSourceAdapter';

export interface ScheduledScenarioMessage {
  offsetMs: number;
  message: MonitoringMessage;
}

export const DEMO_MONITORING_SCENARIOS: readonly DemoScenarioMetadata[] = Object.freeze([
  {
    scenarioId: 'abnormal-stop-repeated',
    name: '异常停车重复告警',
    description: '同一车辆由同一视频设备连续产生12条告警，车辆驶离后上报解除。',
    eventType: 'abnormal_stop',
    expectedLevel: 'L2',
    expectedOutcome: '12条连续告警在阶段4聚合为1起L2事件，驶离后解除并关闭',
  },
  {
    scenarioId: 'pedestrian-false-positive',
    name: '行人误报',
    description: '隧道洞口阴影被视频算法识别为行人，用于人工误报核实。',
    eventType: 'pedestrian_intrusion',
    expectedLevel: 'L3',
    expectedOutcome: '人工判定阴影误报，保留原始Alarm并追加核实标签',
  },
  {
    scenarioId: 'road-debris-observation',
    name: '抛洒物持续观察',
    description: '抛洒物初始证据不足，新关键帧到达后提前触发复核。',
    eventType: 'road_debris',
    expectedLevel: 'L3',
    expectedOutcome: '持续观察后由新证据确认L3并建议接管',
  },
  {
    scenarioId: 'tunnel-accident-l3',
    name: '隧道交通事故L3',
    description: '隧道内两车碰撞并占用两条车道，由相邻摄像机提供证据。',
    eventType: 'traffic_accident',
    expectedLevel: 'L3',
    expectedOutcome: '人工确认L3并发起接管',
  },
  {
    scenarioId: 'tunnel-fire-l4',
    name: '隧道火灾L4',
    description: '隧道内确认明火和烟雾，用于L4人工确认及后续自动接管。',
    eventType: 'fire',
    expectedLevel: 'L4',
    expectedOutcome: '人工确认L4后自动发起接管，首次超时后按相同幂等键重试',
  },
  {
    scenarioId: 'traffic-congestion-monitoring',
    name: '交通拥堵持续监测',
    description: '视频与交通运行观测持续报告拥堵，但未达到L3阈值。',
    eventType: 'traffic_congestion',
    expectedLevel: 'L2',
    expectedOutcome: '在监测侧持续跟踪，恢复通行后关闭',
  },
]);

const SCENARIO_IDS = new Set(DEMO_MONITORING_SCENARIOS.map((scenario) => scenario.scenarioId));
const BASE_EPOCH = Date.parse('2026-08-25T01:00:00.000Z');

export function isDemoScenarioId(value: string): value is DemoScenarioId {
  return SCENARIO_IDS.has(value as DemoScenarioId);
}

function randomGenerator(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function scenarioIndex(scenarioId: DemoScenarioId): number {
  return DEMO_MONITORING_SCENARIOS.findIndex((scenario) => scenario.scenarioId === scenarioId);
}

function confidence(random: () => number, center: number): number {
  return Math.round(Math.min(0.99, Math.max(0.5, center + (random() - 0.5) * 0.08)) * 1000) / 1000;
}

function iso(baseMs: number, offsetMs: number): string {
  return new Date(baseMs + offsetMs).toISOString();
}

function evidence(
  scenarioId: DemoScenarioId,
  alarmIndex: number,
  capturedAt: string,
  videoAvailable: boolean,
): SourceEvidenceReference[] {
  const prefix = `${scenarioId}-${alarmIndex}`;
  return [
    {
      evidenceId: `EVD-${prefix}-FRAME`,
      kind: 'key_frame',
      capturedAt,
      controlledRef: `demo-evidence://${scenarioId}/${alarmIndex}/frame`,
      available: true,
      archived: false,
      simulation: true,
    },
    {
      evidenceId: `EVD-${prefix}-VIDEO`,
      kind: 'video_clip',
      capturedAt,
      controlledRef: `demo-evidence://${scenarioId}/${alarmIndex}/video`,
      available: videoAvailable,
      archived: false,
      simulation: true,
    },
  ];
}

interface AlarmOptions {
  scenarioId: DemoScenarioId;
  seed: number;
  index: number;
  offsetMs: number;
  baseMs: number;
  eventType: MonitoringEventType;
  sourceType?: SourceType;
  sourceSystem?: string;
  sourceSuffix?: string;
  location: EventLocation;
  confidence: number;
  observedFacts: Partial<ConfirmedEventFacts>;
  videoAvailable: boolean;
}

function alarmMessage(options: AlarmOptions): ScheduledScenarioMessage {
  const detectedAt = iso(options.baseMs, options.offsetMs);
  const sourceSuffix = options.sourceSuffix ?? String(options.index).padStart(2, '0');
  const correlationId = `CORR-${options.scenarioId}-${options.seed}`;
  return {
    offsetMs: options.offsetMs,
    message: {
      kind: 'source_alarm',
      messageId: `MSG-${options.scenarioId}-${options.seed}-${options.index}`,
      correlationId,
      streamSequence: 0,
      emittedAt: detectedAt,
      simulation: true,
      payload: {
        scenarioId: options.scenarioId,
        sourceAlarmId: `SRC-${options.scenarioId}-${options.seed}-${sourceSuffix}`,
        sourceType: options.sourceType ?? 'video_ai',
        sourceSystem: options.sourceSystem ?? 'DEMO-VIDEO-AI',
        eventType: options.eventType,
        detectedAt,
        location: structuredClone(options.location),
        confidence: options.confidence,
        algorithmVersion: 'demo-video-event-v1.0',
        modelName: 'DemoVideoEventDetector',
        rawPayloadRef: `demo-payload://${options.scenarioId}/${options.seed}/${options.index}`,
        evidence: evidence(options.scenarioId, options.index, detectedAt, options.videoAvailable),
        observedFacts: structuredClone(options.observedFacts),
        simulation: true,
      },
    },
  };
}

function clearMessage(
  scenarioId: DemoScenarioId,
  seed: number,
  offsetMs: number,
  baseMs: number,
  reason: string,
): ScheduledScenarioMessage {
  const occurredAt = iso(baseMs, offsetMs);
  const correlationId = `CORR-${scenarioId}-${seed}`;
  return {
    offsetMs,
    message: {
      kind: 'source_clear',
      messageId: `MSG-${scenarioId}-${seed}-CLEAR`,
      correlationId,
      streamSequence: 0,
      emittedAt: occurredAt,
      simulation: true,
      payload: {
        scenarioId,
        sourceSystem: 'DEMO-VIDEO-AI',
        correlationId,
        clearedAt: occurredAt,
        reason,
        simulation: true,
      },
    },
  };
}

function evidenceUpdate(
  scenarioId: DemoScenarioId,
  seed: number,
  offsetMs: number,
  baseMs: number,
): ScheduledScenarioMessage {
  const occurredAt = iso(baseMs, offsetMs);
  return {
    offsetMs,
    message: {
      kind: 'evidence_status',
      messageId: `MSG-${scenarioId}-${seed}-NEW-EVIDENCE`,
      correlationId: `CORR-${scenarioId}-${seed}`,
      streamSequence: 0,
      emittedAt: occurredAt,
      simulation: true,
      payload: {
        scenarioId,
        evidenceId: `EVD-${scenarioId}-REVIEW-FRAME`,
        status: 'available',
        occurredAt,
        fallback: 'key_frame_and_text',
        simulation: true,
      },
    },
  };
}

export function buildDemoScenario(
  scenarioId: DemoScenarioId,
  seed: number,
  videoAvailable = true,
): readonly ScheduledScenarioMessage[] {
  const random = randomGenerator(seed);
  const baseMs = BASE_EPOCH + scenarioIndex(scenarioId) * 3_600_000 + (seed % 300) * 1_000;

  if (scenarioId === 'abnormal-stop-repeated') {
    const location: EventLocation = {
      roadCode: 'G65', direction: 'up', kilometer: 128.6, longitude: 106.512, latitude: 29.578,
      facilityId: 'ROAD-G65-128', facilityType: 'road', laneIds: ['1'], deviceId: 'CAM-G65-128-01',
    };
    const messages = Array.from({ length: 12 }, (_, index) => alarmMessage({
      scenarioId, seed, index: index + 1, offsetMs: index * 20_000, baseMs,
      eventType: 'abnormal_stop', location, confidence: confidence(random, 0.9), videoAvailable,
      observedFacts: { eventType: 'abnormal_stop', location, lanesAffected: 1, lanesTotal: 3, vehicleCount: 1 },
    }));
    return [...messages, clearMessage(scenarioId, seed, 260_000, baseMs, '目标车辆驶离检测区域')];
  }

  if (scenarioId === 'pedestrian-false-positive') {
    const location: EventLocation = {
      roadCode: 'G75', direction: 'down', kilometer: 62.1, longitude: 106.698, latitude: 29.724,
      facilityId: 'TUN-G75-062', facilityType: 'tunnel', laneIds: ['2'], deviceId: 'CAM-TUN-062-ENT',
    };
    return [0, 15_000, 30_000].map((offsetMs, index) => alarmMessage({
      scenarioId, seed, index: index + 1, offsetMs, baseMs,
      eventType: 'pedestrian_intrusion', location, confidence: confidence(random, 0.73), videoAvailable,
      observedFacts: { eventType: 'pedestrian_intrusion', location, notes: '洞口高反差区域出现疑似行人轮廓' },
    }));
  }

  if (scenarioId === 'road-debris-observation') {
    const location: EventLocation = {
      roadCode: 'G50', direction: 'up', kilometer: 174.3, longitude: 107.194, latitude: 30.024,
      facilityId: 'BR-G50-174', facilityType: 'bridge', laneIds: ['2'], deviceId: 'CAM-G50-174-02',
    };
    return [
      alarmMessage({ scenarioId, seed, index: 1, offsetMs: 0, baseMs, eventType: 'road_debris', location,
        confidence: confidence(random, 0.69), videoAvailable,
        observedFacts: { eventType: 'road_debris', location, lanesAffected: 1, lanesTotal: 3 } }),
      alarmMessage({ scenarioId, seed, index: 2, offsetMs: 90_000, baseMs, eventType: 'road_debris', location,
        confidence: confidence(random, 0.77), videoAvailable,
        observedFacts: { eventType: 'road_debris', location, lanesAffected: 1, lanesTotal: 3, notes: '目标持续存在且有车辆避让' } }),
      evidenceUpdate(scenarioId, seed, 120_000, baseMs),
    ];
  }

  if (scenarioId === 'tunnel-accident-l3') {
    const location: EventLocation = {
      roadCode: 'G65', direction: 'down', kilometer: 204.8, longitude: 107.012, latitude: 29.412,
      facilityId: 'TUN-G65-205', facilityType: 'tunnel', laneIds: ['1', '2'], deviceId: 'CAM-TUN-205-05',
    };
    return [
      alarmMessage({ scenarioId, seed, index: 1, offsetMs: 0, baseMs, eventType: 'traffic_accident', location,
        confidence: confidence(random, 0.91), videoAvailable,
        observedFacts: { eventType: 'traffic_accident', location, lanesAffected: 2, lanesTotal: 3, vehicleCount: 2, casualties: 0, flowVehPerHour: 1800, speedKmh: 35 } }),
      alarmMessage({ scenarioId, seed, index: 2, offsetMs: 8_000, baseMs, eventType: 'traffic_accident', location,
        sourceSystem: 'DEMO-VIDEO-AI-ADJACENT', sourceSuffix: 'ADJ-01', confidence: confidence(random, 0.88), videoAvailable,
        observedFacts: { eventType: 'traffic_accident', location, lanesAffected: 2, lanesTotal: 3, vehicleCount: 2 } }),
    ];
  }

  if (scenarioId === 'tunnel-fire-l4') {
    const location: EventLocation = {
      roadCode: 'G65S', direction: 'up', kilometer: 1264, longitude: 108.84, latitude: 33.79,
      facilityId: 'TUN-G65S-1264', facilityType: 'tunnel', laneIds: ['1', '2', '3'], deviceId: 'CAM-1264',
    };
    return [
      alarmMessage({ scenarioId, seed, index: 1, offsetMs: 0, baseMs, eventType: 'fire', location,
        confidence: confidence(random, 0.94), videoAvailable,
        observedFacts: { eventType: 'fire', location, lanesAffected: 3, lanesTotal: 3, flowVehPerHour: 900, speedKmh: 20, notes: '检测到明火和浓烟' } }),
      alarmMessage({ scenarioId, seed, index: 2, offsetMs: 5_000, baseMs, eventType: 'fire', location,
        sourceSystem: 'DEMO-VIDEO-AI-THERMAL', sourceSuffix: 'THERMAL-01', confidence: confidence(random, 0.96), videoAvailable,
        observedFacts: { eventType: 'fire', location, lanesAffected: 3, lanesTotal: 3, notes: '热成像持续高温并伴随烟雾' } }),
    ];
  }

  const location: EventLocation = {
    roadCode: 'G50', direction: 'down', kilometer: 96.2, longitude: 106.445, latitude: 29.611,
    facilityId: 'ROAD-G50-096', facilityType: 'road', laneIds: ['1', '2', '3'], deviceId: 'CAM-G50-096-OVERVIEW',
  };
  const congestionMessages = [
    { offsetMs: 0, duration: 2, queue: 0.8 },
    { offsetMs: 60_000, duration: 5, queue: 1.4 },
    { offsetMs: 120_000, duration: 8, queue: 2.2 },
    { offsetMs: 180_000, duration: 9, queue: 2.6 },
  ].map((item, index) => alarmMessage({
    scenarioId, seed, index: index + 1, offsetMs: item.offsetMs, baseMs,
    eventType: 'traffic_congestion', sourceType: 'radar_video', sourceSystem: 'DEMO-TRAFFIC-VIDEO-FUSION',
    location, confidence: confidence(random, 0.86), videoAvailable,
    observedFacts: { eventType: 'traffic_congestion', location, queueLengthKm: item.queue, congestionDurationMin: item.duration },
  }));
  return [...congestionMessages, clearMessage(scenarioId, seed, 240_000, baseMs, '平均速度恢复至正常区间')];
}
