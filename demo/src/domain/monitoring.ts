// FR-EM-002 / FR-EM-006 / FR-EM-011 / FR-EM-012

export const MONITORING_EVENT_TYPES = [
  'traffic_congestion',
  'traffic_accident',
  'pedestrian_intrusion',
  'wrong_way_driving',
  'reversing',
  'abnormal_stop',
  'fire',
  'road_debris',
] as const;

export type MonitoringEventType = (typeof MONITORING_EVENT_TYPES)[number];
export type MonitoringLevel = 'L1' | 'L2' | 'L3' | 'L4';
export type SourceType = 'video_ai' | 'manual_report' | 'phone_report' | 'radar_video' | 'iot' | 'third_party';
export type TravelDirection = 'up' | 'down' | 'unknown';
export type VerificationStatus = 'pending' | 'verifying' | 'confirmed' | 'false_positive';
export type VerificationMode = 'manual_review' | 'observation';
export type MonitoringLifecycle =
  | 'monitoring'
  | 'pending_handoff'
  | 'handoff_in_progress'
  | 'taken_over'
  | 'handoff_failed'
  | 'resolved'
  | 'closed';

export interface EventLocation {
  roadCode: string;
  direction: TravelDirection;
  kilometer?: number;
  longitude?: number;
  latitude?: number;
  facilityId?: string;
  facilityType?: 'road' | 'tunnel' | 'bridge' | 'slope';
  laneIds?: readonly string[];
  deviceId?: string;
}

export interface AlarmEvidenceReference extends EvidenceSummary {
  available: boolean;
}

export interface Alarm {
  readonly alarmId: string;
  readonly sourceAlarmId: string;
  readonly sourceType: SourceType;
  readonly sourceSystem: string;
  readonly eventType: MonitoringEventType;
  readonly eventSubtype?: string;
  readonly detectedAt: string;
  readonly firstReceivedAt: string;
  readonly location: Readonly<EventLocation>;
  readonly confidence?: number;
  readonly algorithmVersion?: string;
  readonly modelName?: string;
  readonly rawPayloadRef: string;
  readonly evidenceIds: readonly string[];
  readonly evidence?: readonly AlarmEvidenceReference[];
  readonly simulation: boolean;
}

export interface AlarmDeliveryReceipt {
  receiptId: string;
  messageId: string;
  sourceSystem: string;
  sourceAlarmId: string;
  receivedAt: string;
  result: 'created' | 'duplicate' | 'invalid';
  alarmId?: string;
  errorCode?: string;
}

export interface AlarmAssessment {
  assessmentId: string;
  alarmId: string;
  result: 'valid' | 'unrelated' | 'false_positive';
  reason: string;
  assessedBy: string;
  assessedAt: string;
}

export interface FactConflict {
  conflictId: string;
  field: string;
  alarmIds: readonly string[];
  values: readonly unknown[];
  status: 'pending' | 'resolved';
  resolution?: string;
}

export interface EvidenceSummary {
  evidenceId: string;
  kind: 'key_frame' | 'video_clip' | 'text' | 'device_snapshot';
  capturedAt: string;
  controlledRef: string;
  archived: boolean;
  simulation: boolean;
}

export interface ConfirmedEventFacts {
  eventType: MonitoringEventType;
  eventSubtype?: string;
  location: EventLocation;
  lanesAffected?: number;
  lanesTotal?: number;
  vehicleCount?: number;
  casualties?: number;
  hazardousMaterials?: boolean;
  hazardousMaterialLeak?: boolean;
  queueLengthKm?: number;
  congestionDurationMin?: number;
  notes?: string;
}

export interface ControlDispositionSummary {
  eventLifecycleStatus: 'handling' | 'resolved' | 'closed' | 'correction_required' | 'false_positive_confirmed';
  controlPhase: 'ingested' | 'reasoning' | 'planning' | 'review' | 'executing' | 'closing' | 'closed';
  controlEventVersion: number;
  planVersion?: number;
  planState?: string;
  pendingMeasureCount?: number;
  executionProgress?: string;
  closureDecision?: { decisionId: string; decidedAt: string; decidedBy: string; reason: string };
  lastMessageId: string;
  lastStreamSequence: number;
  updatedAt: string;
}

export interface MonitoringEvent {
  monitoringEventId: string;
  version: number;
  alarmIds: readonly string[];
  eventType: MonitoringEventType;
  location: EventLocation;
  suggestedLevel: MonitoringLevel;
  confirmedLevel?: MonitoringLevel;
  suggestedLevelReasonCodes?: readonly string[];
  suggestedLevelInsufficiencyCodes?: readonly string[];
  suggestedLevelAssessedAt?: string;
  verificationStatus: VerificationStatus;
  verificationMode?: VerificationMode;
  lifecycleStatus: MonitoringLifecycle;
  verificationOwnerId?: string;
  nextReviewAt?: string;
  reviewPriorityAt?: string;
  observationCount: number;
  conflicts: readonly FactConflict[];
  controlEventId?: string;
  handoffId?: string;
  controlSummary?: ControlDispositionSummary;
  detectedAt: string;
  confirmedAt?: string;
  falsePositiveAt?: string;
  takenOverAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  updatedAt: string;
  simulation: boolean;
}

export interface VerificationTask {
  taskId: string;
  eventId: string;
  expectedEventVersion: number;
  status: 'available' | 'claimed' | 'observation' | 'completed';
  ownerId?: string;
  claimedAt?: string;
  nextReviewAt?: string;
  updatedAt: string;
}

export interface MonitoringAuditEntry {
  seq?: number;
  entityId: string;
  entityType: 'alarm' | 'event' | 'verification_task' | 'handoff' | 'sync';
  occurredAt: string;
  kind: string;
  actorId?: string;
  summary: string;
  payload?: Record<string, unknown>;
  simulation: boolean;
}

export interface CrossModuleSyncReceipt {
  messageId: string;
  correlationId: string;
  streamSequence: number;
  direction: 'monitoring_to_control' | 'control_to_monitoring';
  entityId: string;
  entityVersion: number;
  status: 'applied' | 'stale' | 'rejected' | 'gap';
  reason: string;
  receivedAt: string;
  simulation: boolean;
}

export interface MonitoringOutboxMessage {
  messageId: string;
  correlationId: string;
  streamSequence: number;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  messageType: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
}

function freezeLocation(location: EventLocation): Readonly<EventLocation> {
  return Object.freeze({
    ...location,
    laneIds: location.laneIds ? Object.freeze([...location.laneIds]) : undefined,
  });
}

/** Alarm创建后不可原地改写；仓储读取时也必须重新冻结。 */
export function freezeAlarm(alarm: Alarm): Alarm {
  return Object.freeze({
    ...alarm,
    location: freezeLocation(alarm.location),
    evidenceIds: Object.freeze([...alarm.evidenceIds]),
    evidence: alarm.evidence ? Object.freeze(alarm.evidence.map((item) => Object.freeze({ ...item }))) : undefined,
  });
}

export function isMonitoringEventType(value: unknown): value is MonitoringEventType {
  return typeof value === 'string' && (MONITORING_EVENT_TYPES as readonly string[]).includes(value);
}

export function isActiveMonitoringLifecycle(status: MonitoringLifecycle): boolean {
  return status !== 'resolved' && status !== 'closed';
}

