// FR-EM-002：来源消息标准化、失败记录和精确幂等均为纯函数。
import {
  freezeAlarm,
  isMonitoringEventType,
  type Alarm,
  type AlarmDeliveryReceipt,
  type AlarmEvidenceReference,
  type EventLocation,
  type SourceType,
  type TravelDirection,
} from '../../domain/monitoring';

export type NormalizationErrorCode =
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_MESSAGE_KIND'
  | 'MISSING_MESSAGE_ID'
  | 'MISSING_SOURCE_SYSTEM'
  | 'MISSING_SOURCE_ALARM_ID'
  | 'INVALID_SOURCE_TYPE'
  | 'INVALID_EVENT_TYPE'
  | 'INVALID_DETECTED_AT'
  | 'INVALID_LOCATION'
  | 'INVALID_CONFIDENCE'
  | 'MISSING_RAW_PAYLOAD_REF';

export interface NormalizationError {
  code: NormalizationErrorCode;
  field: string;
  message: string;
}

export interface NormalizationFailureRecord {
  failureId: string;
  messageId?: string;
  sourceSystem?: string;
  sourceAlarmId?: string;
  receivedAt: string;
  errors: readonly NormalizationError[];
  rawPayloadRef?: string;
  simulation?: boolean;
  status: 'pending';
}

export interface IdempotencyIndex {
  readonly alarmIdByMessageId: Readonly<Record<string, string | null>>;
  readonly alarmIdBySourceKey: Readonly<Record<string, string>>;
  readonly deliveryCountByMessageId: Readonly<Record<string, number>>;
}

export const EMPTY_IDEMPOTENCY_INDEX: IdempotencyIndex = Object.freeze({
  alarmIdByMessageId: Object.freeze({}),
  alarmIdBySourceKey: Object.freeze({}),
  deliveryCountByMessageId: Object.freeze({}),
});

export interface NormalizationIdFactory {
  receiptId(messageId: string, deliveryAttempt: number): string;
  alarmId(sourceSystem: string, sourceAlarmId: string): string;
  failureId(messageId: string | undefined, deliveryAttempt: number): string;
}

function idToken(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'UNKNOWN';
}

export const DEFAULT_NORMALIZATION_ID_FACTORY: NormalizationIdFactory = Object.freeze({
  receiptId: (messageId: string, deliveryAttempt: number) => `RCP-${idToken(messageId)}-${deliveryAttempt}`,
  alarmId: (sourceSystem: string, sourceAlarmId: string) => `ALM-${idToken(sourceSystem)}-${idToken(sourceAlarmId)}`,
  failureId: (messageId: string | undefined, deliveryAttempt: number) => `NF-${idToken(messageId ?? 'UNIDENTIFIED')}-${deliveryAttempt}`,
});

export interface NormalizeDeliveryOptions {
  receivedAt: string;
  idFactory?: NormalizationIdFactory;
}

export interface NormalizeDeliveryResult {
  receipt?: AlarmDeliveryReceipt;
  alarm?: Alarm;
  failure?: NormalizationFailureRecord;
  duplicateBy?: 'message_id' | 'source_alarm';
  nextIndex: IdempotencyIndex;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validIso(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Date.parse(value));
}

function isSourceType(value: unknown): value is SourceType {
  return value === 'video_ai' || value === 'manual_report' || value === 'phone_report'
    || value === 'radar_video' || value === 'iot' || value === 'third_party';
}

function isDirection(value: unknown): value is TravelDirection {
  return value === 'up' || value === 'down' || value === 'unknown';
}

function validCoordinatePair(longitude: unknown, latitude: unknown): boolean {
  return typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

function parseLocation(value: unknown): EventLocation | undefined {
  if (!isRecord(value)) return undefined;
  const roadCode = nonEmptyString(value.roadCode);
  if (!roadCode || !isDirection(value.direction)) return undefined;
  const facilityId = nonEmptyString(value.facilityId);
  const kilometer = typeof value.kilometer === 'number' && Number.isFinite(value.kilometer) && value.kilometer >= 0
    ? value.kilometer : undefined;
  const hasCoordinates = validCoordinatePair(value.longitude, value.latitude);
  if (!facilityId && kilometer === undefined && !hasCoordinates) return undefined;

  const laneIds = Array.isArray(value.laneIds)
    ? value.laneIds.map(nonEmptyString).filter((item): item is string => Boolean(item))
    : undefined;
  const facilityType = value.facilityType === 'road' || value.facilityType === 'tunnel'
    || value.facilityType === 'bridge' || value.facilityType === 'slope'
    ? value.facilityType : undefined;
  return {
    roadCode,
    direction: value.direction,
    kilometer,
    longitude: hasCoordinates ? value.longitude as number : undefined,
    latitude: hasCoordinates ? value.latitude as number : undefined,
    facilityId,
    facilityType,
    laneIds,
    deviceId: nonEmptyString(value.deviceId),
  };
}

function sourceKey(sourceSystem: string, sourceAlarmId: string): string {
  return JSON.stringify([sourceSystem, sourceAlarmId]);
}

function hasOwn(record: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function nextAttempt(index: IdempotencyIndex, messageId: string | undefined): number {
  if (!messageId) return 1;
  return (index.deliveryCountByMessageId[messageId] ?? 0) + 1;
}

function withDelivery(
  index: IdempotencyIndex,
  messageId: string,
  alarmId: string | null,
  attempt: number,
  sourceSystem?: string,
  sourceAlarmId?: string,
): IdempotencyIndex {
  const alarmIdBySourceKey = sourceSystem && sourceAlarmId && alarmId
    ? { ...index.alarmIdBySourceKey, [sourceKey(sourceSystem, sourceAlarmId)]: alarmId }
    : { ...index.alarmIdBySourceKey };
  return {
    alarmIdByMessageId: { ...index.alarmIdByMessageId, [messageId]: alarmId },
    alarmIdBySourceKey,
    deliveryCountByMessageId: { ...index.deliveryCountByMessageId, [messageId]: attempt },
  };
}

function invalidResult(
  input: UnknownRecord | undefined,
  payload: UnknownRecord | undefined,
  errors: NormalizationError[],
  index: IdempotencyIndex,
  options: NormalizeDeliveryOptions,
): NormalizeDeliveryResult {
  const idFactory = options.idFactory ?? DEFAULT_NORMALIZATION_ID_FACTORY;
  const messageId = nonEmptyString(input?.messageId);
  const sourceSystem = nonEmptyString(payload?.sourceSystem);
  const sourceAlarmId = nonEmptyString(payload?.sourceAlarmId);
  const rawPayloadRef = nonEmptyString(payload?.rawPayloadRef);
  const attempt = nextAttempt(index, messageId);
  const failure: NormalizationFailureRecord = Object.freeze({
    failureId: idFactory.failureId(messageId, attempt),
    messageId,
    sourceSystem,
    sourceAlarmId,
    receivedAt: options.receivedAt,
    errors: Object.freeze(errors.map((error) => Object.freeze({ ...error }))),
    rawPayloadRef,
    simulation: typeof input?.simulation === 'boolean' ? input.simulation : undefined,
    status: 'pending',
  });
  if (!messageId) return { failure, nextIndex: index };
  const nextIndex = withDelivery(index, messageId, null, attempt);
  return {
    receipt: {
      receiptId: idFactory.receiptId(messageId, attempt),
      messageId,
      sourceSystem: sourceSystem ?? '',
      sourceAlarmId: sourceAlarmId ?? '',
      receivedAt: options.receivedAt,
      result: 'invalid',
      errorCode: errors.map((error) => error.code).join(','),
    },
    failure,
    nextIndex,
  };
}

export function normalizeSourceAlarmDelivery(
  input: unknown,
  index: IdempotencyIndex = EMPTY_IDEMPOTENCY_INDEX,
  options: NormalizeDeliveryOptions,
): NormalizeDeliveryResult {
  if (!validIso(options.receivedAt)) throw new Error('receivedAt必须是有效时间');
  if (!isRecord(input)) {
    return invalidResult(undefined, undefined, [
      { code: 'INVALID_ENVELOPE', field: '$', message: '消息必须是对象' },
    ], index, options);
  }
  const messageId = nonEmptyString(input.messageId);
  if (!messageId) {
    return invalidResult(input, undefined, [
      { code: 'MISSING_MESSAGE_ID', field: 'messageId', message: '缺少消息幂等标识' },
    ], index, options);
  }

  const idFactory = options.idFactory ?? DEFAULT_NORMALIZATION_ID_FACTORY;
  const attempt = nextAttempt(index, messageId);
  const earlyPayload = isRecord(input.payload) ? input.payload : undefined;
  const earlySourceSystem = nonEmptyString(earlyPayload?.sourceSystem);
  const earlySourceAlarmId = nonEmptyString(earlyPayload?.sourceAlarmId);
  if (hasOwn(index.alarmIdByMessageId, messageId)) {
    const alarmId = index.alarmIdByMessageId[messageId] ?? undefined;
    return {
      receipt: {
        receiptId: idFactory.receiptId(messageId, attempt),
        messageId,
        sourceSystem: earlySourceSystem ?? '',
        sourceAlarmId: earlySourceAlarmId ?? '',
        receivedAt: options.receivedAt,
        result: 'duplicate',
        alarmId,
      },
      duplicateBy: 'message_id',
      nextIndex: withDelivery(index, messageId, alarmId ?? null, attempt),
    };
  }
  if (input.kind !== 'source_alarm') {
    return invalidResult(input, undefined, [
      { code: 'UNSUPPORTED_MESSAGE_KIND', field: 'kind', message: '仅source_alarm进入Alarm标准化' },
    ], index, options);
  }
  const payload = earlyPayload;
  if (!payload) {
    return invalidResult(input, undefined, [
      { code: 'INVALID_ENVELOPE', field: 'payload', message: '缺少告警载荷' },
    ], index, options);
  }

  const sourceSystem = nonEmptyString(payload.sourceSystem);
  const sourceAlarmId = nonEmptyString(payload.sourceAlarmId);
  if (sourceSystem && sourceAlarmId) {
    const existingAlarmId = index.alarmIdBySourceKey[sourceKey(sourceSystem, sourceAlarmId)];
    if (existingAlarmId) {
      return {
        receipt: {
          receiptId: idFactory.receiptId(messageId, attempt),
          messageId,
          sourceSystem,
          sourceAlarmId,
          receivedAt: options.receivedAt,
          result: 'duplicate',
          alarmId: existingAlarmId,
        },
        duplicateBy: 'source_alarm',
        nextIndex: withDelivery(index, messageId, existingAlarmId, attempt),
      };
    }
  }

  const errors: NormalizationError[] = [];
  if (!sourceSystem) errors.push({ code: 'MISSING_SOURCE_SYSTEM', field: 'payload.sourceSystem', message: '缺少来源系统' });
  if (!sourceAlarmId) errors.push({ code: 'MISSING_SOURCE_ALARM_ID', field: 'payload.sourceAlarmId', message: '缺少来源告警ID' });
  if (!isSourceType(payload.sourceType)) {
    errors.push({ code: 'INVALID_SOURCE_TYPE', field: 'payload.sourceType', message: '来源类型缺失或无效' });
  }
  if (!isMonitoringEventType(payload.eventType)) {
    errors.push({ code: 'INVALID_EVENT_TYPE', field: 'payload.eventType', message: '事件类型不在P0八类范围内' });
  }
  if (!validIso(payload.detectedAt)) {
    errors.push({ code: 'INVALID_DETECTED_AT', field: 'payload.detectedAt', message: '检测时间缺失或无效' });
  }
  const location = parseLocation(payload.location);
  if (!location) errors.push({ code: 'INVALID_LOCATION', field: 'payload.location', message: '位置缺少道路、方向或有效空间锚点' });
  if (payload.confidence !== undefined
    && (typeof payload.confidence !== 'number' || !Number.isFinite(payload.confidence) || payload.confidence < 0 || payload.confidence > 1)) {
    errors.push({ code: 'INVALID_CONFIDENCE', field: 'payload.confidence', message: 'AI置信度必须在0到1之间' });
  }
  const rawPayloadRef = nonEmptyString(payload.rawPayloadRef);
  if (!rawPayloadRef) errors.push({ code: 'MISSING_RAW_PAYLOAD_REF', field: 'payload.rawPayloadRef', message: '缺少受控原始载荷引用' });
  if (errors.length > 0) return invalidResult(input, payload, errors, index, options);

  const alarmId = idFactory.alarmId(sourceSystem!, sourceAlarmId!);
  const evidence = Array.isArray(payload.evidence) ? payload.evidence : [];
  const evidenceReferences = evidence.flatMap((item): AlarmEvidenceReference[] => {
    if (!isRecord(item)) return [];
    const evidenceId = nonEmptyString(item.evidenceId);
    const kind = item.kind;
    const capturedAt = nonEmptyString(item.capturedAt);
    const controlledRef = nonEmptyString(item.controlledRef);
    if (!evidenceId || !capturedAt || !controlledRef
      || (kind !== 'key_frame' && kind !== 'video_clip' && kind !== 'text' && kind !== 'device_snapshot')) return [];
    return [{ evidenceId, kind, capturedAt, controlledRef, available: item.available !== false,
      archived: item.archived === true, simulation: input.simulation === true || payload.simulation === true }];
  });
  const evidenceIds = evidenceReferences.map((item) => item.evidenceId);
  const alarm = freezeAlarm({
    alarmId,
    sourceAlarmId: sourceAlarmId!,
    sourceType: payload.sourceType as SourceType,
    sourceSystem: sourceSystem!,
    eventType: payload.eventType as Alarm['eventType'],
    eventSubtype: nonEmptyString(payload.eventSubtype),
    detectedAt: payload.detectedAt as string,
    firstReceivedAt: options.receivedAt,
    location: location!,
    confidence: typeof payload.confidence === 'number' ? payload.confidence : undefined,
    algorithmVersion: nonEmptyString(payload.algorithmVersion),
    modelName: nonEmptyString(payload.modelName),
    rawPayloadRef: rawPayloadRef!,
    evidenceIds,
    evidence: evidenceReferences,
    simulation: input.simulation === true || payload.simulation === true,
  });
  const nextIndex = withDelivery(index, messageId, alarmId, attempt, sourceSystem!, sourceAlarmId!);
  return {
    alarm,
    receipt: {
      receiptId: idFactory.receiptId(messageId, attempt),
      messageId,
      sourceSystem: sourceSystem!,
      sourceAlarmId: sourceAlarmId!,
      receivedAt: options.receivedAt,
      result: 'created',
      alarmId,
    },
    nextIndex,
  };
}

export function appendNormalizationFailure(
  queue: readonly NormalizationFailureRecord[],
  failure: NormalizationFailureRecord | undefined,
): readonly NormalizationFailureRecord[] {
  return failure ? Object.freeze([...queue, failure]) : queue;
}

export function projectDuplicateCount(
  receipts: readonly AlarmDeliveryReceipt[],
  alarmId: string,
): number {
  return receipts.filter((receipt) => receipt.alarmId === alarmId && receipt.result === 'duplicate').length;
}

