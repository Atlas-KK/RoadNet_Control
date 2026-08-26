import type { ConfirmedEventFacts, EvidenceSummary, FactConflict } from './monitoring';

export interface TrafficAndFacilityContext {
  roadCode: string;
  direction: 'up' | 'down' | 'unknown';
  facilityId?: string;
  facilityType?: 'road' | 'tunnel' | 'bridge' | 'slope';
  configuredSensitiveFacility: boolean;
  configuredCriticalNode: boolean;
  trafficSnapshot?: {
    speedKmh?: number;
    flowVehPerHour?: number;
    queueLengthKm?: number;
  };
}

export interface HandoffRequest {
  messageId: string;
  correlationId: string;
  handoffId: string;
  idempotencyKey: string;
  monitoringEventId: string;
  monitoringEventVersion: number;
  requestedAt: string;
  requestedBy: { mode: 'user' | 'rule'; userId?: string; ruleIds: string[] };
  confirmedFacts: ConfirmedEventFacts;
  context: TrafficAndFacilityContext;
  evidence: EvidenceSummary[];
  conflicts: FactConflict[];
  rationale: { level: 'L3' | 'L4'; reasons: string[]; reviewerId?: string };
  simulation: boolean;
}

export interface HandoffResult {
  messageId: string;
  correlationId: string;
  handoffId: string;
  status: 'accepted' | 'rejected' | 'duplicate' | 'failed' | 'planning_gap';
  controlEventId?: string;
  controlEventVersion?: number;
  acceptedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable: boolean;
}

export interface HandoffLink {
  handoffId: string;
  monitoringEventId: string;
  monitoringEventVersion: number;
  idempotencyKey: string;
  status: HandoffResult['status'] | 'pending';
  controlEventId?: string;
  requestedAt: string;
  updatedAt: string;
  retryCount: number;
  resultMessageId?: string;
  correlationId?: string;
  controlEventVersion?: number;
  acceptedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
  simulation: boolean;
}

export interface MonitoringEventUpdate {
  messageId: string;
  correlationId: string;
  streamSequence: number;
  monitoringEventId: string;
  controlEventId: string;
  expectedControlEventVersion?: number;
  monitoringEventVersion: number;
  occurredAt: string;
  updateType: 'evidence_added' | 'facts_corrected' | 'level_changed' | 'resolution_reported' | 'false_positive_review_requested';
  changedFacts?: Partial<ConfirmedEventFacts>;
  evidence?: EvidenceSummary[];
  reason: string;
  simulation: boolean;
}

export interface ControlEventUpdate {
  messageId: string;
  correlationId: string;
  streamSequence: number;
  controlEventId: string;
  handoffId: string;
  controlEventVersion: number;
  occurredAt: string;
  eventLifecycleStatus: 'handling' | 'resolved' | 'closed' | 'correction_required' | 'false_positive_confirmed';
  controlPhase: 'ingested' | 'reasoning' | 'planning' | 'review' | 'executing' | 'closing' | 'closed';
  planVersion?: number;
  planState?: string;
  pendingMeasureCount?: number;
  executionProgress?: string;
  closureDecision?: { decisionId: string; decidedAt: string; decidedBy: string; reason: string };
  simulation: boolean;
}
