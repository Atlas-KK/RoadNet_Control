import { describe, expect, it } from 'vitest';
import { buildDemoScenario, DEMO_MONITORING_SCENARIOS } from '../adapters/demoScenarios';
import type { MonitoringMessage, SourceAlarmMessage } from '../adapters/monitoringSourceAdapter';
import {
  EMPTY_IDEMPOTENCY_INDEX,
  appendNormalizationFailure,
  normalizeSourceAlarmDelivery,
  projectDuplicateCount,
  type IdempotencyIndex,
} from './normalize';

const RECEIVED_AT = '2026-08-25T10:00:00.000Z';

function firstAlarmMessage(): SourceAlarmMessage {
  const message = buildDemoScenario('tunnel-accident-l3', 42)[0]?.message;
  if (message?.kind !== 'source_alarm') throw new Error('测试场景缺少源告警');
  return structuredClone(message);
}

function normalize(message: unknown, index: IdempotencyIndex = EMPTY_IDEMPOTENCY_INDEX) {
  return normalizeSourceAlarmDelivery(message, index, { receivedAt: RECEIVED_AT });
}

describe('FR-EM-002 来源告警标准化', () => {
  it('将有效模拟源消息转为不可变Alarm和created回执', () => {
    const result = normalize(firstAlarmMessage());
    expect(result.receipt).toMatchObject({ result: 'created', messageId: 'MSG-tunnel-accident-l3-42-1' });
    expect(result.alarm).toMatchObject({
      eventType: 'traffic_accident', sourceType: 'video_ai', firstReceivedAt: RECEIVED_AT, simulation: true,
    });
    expect(result.alarm?.evidenceIds).toHaveLength(2);
    expect(Object.isFrozen(result.alarm)).toBe(true);
    expect(Object.isFrozen(result.alarm?.location)).toBe(true);
  });

  it('六个场景的全部source_alarm均可进入同一标准化入口', () => {
    for (const scenario of DEMO_MONITORING_SCENARIOS) {
      let index = EMPTY_IDEMPOTENCY_INDEX;
      const alarms = buildDemoScenario(scenario.scenarioId, 7)
        .map((item) => item.message)
        .filter((message): message is SourceAlarmMessage => message.kind === 'source_alarm');
      for (const message of alarms) {
        const result = normalize(message, index);
        expect(result.receipt?.result).toBe('created');
        expect(result.alarm?.eventType).toBe(scenario.eventType);
        index = result.nextIndex;
      }
    }
  });

  it('缺失或非法类型、时间、位置和来源类型不生成默认Alarm并进入失败队列', () => {
    const base = firstAlarmMessage();
    const invalid = {
      ...base,
      payload: {
        ...base.payload,
        sourceType: 'unknown_source',
        eventType: 'bridge_collapse',
        detectedAt: 'not-a-time',
        location: { roadCode: 'G65', direction: 'up' },
      },
    };
    const result = normalize(invalid);
    expect(result.alarm).toBeUndefined();
    expect(result.receipt?.result).toBe('invalid');
    expect(result.failure?.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'INVALID_SOURCE_TYPE', 'INVALID_EVENT_TYPE', 'INVALID_DETECTED_AT', 'INVALID_LOCATION',
    ]));
    expect(result.failure?.status).toBe('pending');
  });

  it('无messageId的畸形消息保留失败记录但不编造投递回执', () => {
    const { messageId: _messageId, ...withoutMessageId } = firstAlarmMessage();
    const result = normalize(withoutMessageId);
    expect(result.receipt).toBeUndefined();
    expect(result.failure?.errors[0]?.code).toBe('MISSING_MESSAGE_ID');
    expect(result.nextIndex).toBe(EMPTY_IDEMPOTENCY_INDEX);
  });

  it('失败队列仅追加失败记录且不改写原队列', () => {
    const original = Object.freeze([]);
    const invalid = normalize({ kind: 'source_alarm' });
    const next = appendNormalizationFailure(original, invalid.failure);
    expect(original).toHaveLength(0);
    expect(next).toHaveLength(1);
    expect(Object.isFrozen(next)).toBe(true);
  });
});

describe('FR-EM-003 messageId与sourceAlarm精确幂等', () => {
  it('相同messageId重复投递只创建一次Alarm并为每次投递生成Receipt', () => {
    const message = firstAlarmMessage();
    const first = normalize(message);
    const second = normalize(message, first.nextIndex);
    expect(first.alarm).toBeDefined();
    expect(second.alarm).toBeUndefined();
    expect(second.duplicateBy).toBe('message_id');
    expect(second.receipt).toMatchObject({ result: 'duplicate', alarmId: first.alarm?.alarmId });
    expect(second.receipt?.receiptId).not.toBe(first.receipt?.receiptId);
  });

  it('不同messageId但相同sourceSystem和sourceAlarmId不创建第二个Alarm', () => {
    const firstMessage = firstAlarmMessage();
    const secondMessage: MonitoringMessage = { ...structuredClone(firstMessage), messageId: 'MSG-REDELIVERY-2' };
    const first = normalize(firstMessage);
    const second = normalize(secondMessage, first.nextIndex);
    expect(second.alarm).toBeUndefined();
    expect(second.duplicateBy).toBe('source_alarm');
    expect(second.receipt).toMatchObject({ result: 'duplicate', alarmId: first.alarm?.alarmId });
  });

  it('重复次数仅由Receipt投影计算，不修改Alarm', () => {
    const message = firstAlarmMessage();
    const first = normalize(message);
    const second = normalize(message, first.nextIndex);
    const third = normalize(message, second.nextIndex);
    const receipts = [first.receipt, second.receipt, third.receipt].filter((item) => item !== undefined);
    expect(projectDuplicateCount(receipts, first.alarm!.alarmId)).toBe(2);
    expect(Object.keys(first.alarm!)).not.toContain('duplicateCount');
  });
});
