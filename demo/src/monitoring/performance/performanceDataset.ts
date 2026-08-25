import { freezeAlarm, type Alarm, type MonitoringEvent } from '../../domain/monitoring';
import type { HandoffLink } from '../../domain/handoff';

export const PERFORMANCE_ALARM_COUNT = 1_000;
export const PERFORMANCE_ACTIVE_EVENT_COUNT = 200;

export interface MonitoringPerformanceDataset {
  seed: number;
  alarms: Alarm[];
  events: MonitoringEvent[];
  handoffs: HandoffLink[];
}

function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const EVENT_TYPES: readonly Alarm['eventType'][] = [
  'traffic_congestion', 'traffic_accident', 'pedestrian_intrusion', 'wrong_way_driving',
  'reversing', 'abnormal_stop', 'fire', 'road_debris',
];
const ROAD_CODES = ['G65', 'G75', 'G50', 'G56'] as const;
const LEVELS = ['L1', 'L2', 'L3', 'L4'] as const;
const BASE_TIME = Date.parse('2026-08-25T00:00:00.000Z');

/** 固定seed生成1000条Alarm和200起活跃事件；仅用于MVP性能验收。 */
export function generateMonitoringPerformanceDataset(seed: number): MonitoringPerformanceDataset {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error('seed必须是非负安全整数');
  const random = seededRandom(seed);
  const alarms: Alarm[] = [];
  const events: MonitoringEvent[] = [];
  for (let eventIndex = 0; eventIndex < PERFORMANCE_ACTIVE_EVENT_COUNT; eventIndex += 1) {
    const eventId = `ME-PERF-${String(eventIndex).padStart(3, '0')}`;
    const eventType = EVENT_TYPES[eventIndex % EVENT_TYPES.length]!;
    const roadCode = ROAD_CODES[eventIndex % ROAD_CODES.length]!;
    const detectedAt = new Date(BASE_TIME + eventIndex * 15_000).toISOString();
    const longitude = 108.75 + (eventIndex % 20) * 0.018 + random() * 0.003;
    const latitude = 34.12 + Math.floor(eventIndex / 20) * 0.025 + random() * 0.003;
    const alarmIds: string[] = [];
    for (let alarmIndex = 0; alarmIndex < 5; alarmIndex += 1) {
      const alarmId = `ALM-PERF-${String(eventIndex * 5 + alarmIndex).padStart(4, '0')}`;
      alarmIds.push(alarmId);
      alarms.push(freezeAlarm({
        alarmId, sourceAlarmId: `SRC-${alarmId}`, sourceType: 'video_ai', sourceSystem: `PERF-VIDEO-${eventIndex % 4}`,
        eventType, detectedAt: new Date(Date.parse(detectedAt) + alarmIndex * 1_000).toISOString(),
        firstReceivedAt: new Date(Date.parse(detectedAt) + alarmIndex * 1_000 + 100).toISOString(),
        location: { roadCode, direction: eventIndex % 2 ? 'down' : 'up', kilometer: 80 + eventIndex * 0.25,
          longitude, latitude, deviceId: `CAM-PERF-${eventIndex % 80}` },
        confidence: Math.round((0.65 + random() * 0.34) * 1_000) / 1_000,
        algorithmVersion: `perf-v${1 + eventIndex % 3}`, modelName: 'PerformanceVideoDetector',
        rawPayloadRef: `performance://${seed}/${alarmId}`,
        evidenceIds: [`EVD-${alarmId}-FRAME`, `EVD-${alarmId}-VIDEO`], simulation: true,
      }));
    }
    const level = LEVELS[eventIndex % LEVELS.length]!;
    events.push({
      monitoringEventId: eventId, version: 1, alarmIds, eventType,
      location: alarms.at(-1)!.location, suggestedLevel: level,
      verificationStatus: eventIndex % 5 === 0 ? 'verifying' : 'pending', lifecycleStatus: 'monitoring',
      observationCount: 0, conflicts: [], detectedAt, updatedAt: detectedAt, simulation: true,
    });
  }
  return { seed, alarms, events, handoffs: [] };
}
