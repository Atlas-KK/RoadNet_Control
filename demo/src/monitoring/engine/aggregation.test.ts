import { describe, expect, it } from 'vitest';
import { freezeAlarm, type Alarm, type EventLocation } from '../../domain/monitoring';
import {
  MONITORING_AGGREGATION_CONFIG,
  classifyAggregationScore,
  computeEventConfidence,
  detectAggregationFactConflicts,
  evaluateIndependentEvolutionSplit,
  scoreAggregationCandidate,
  type AggregationSignal,
  type EvolutionTrack,
} from './aggregation';

const LOCATION: EventLocation = {
  roadCode: 'G65', direction: 'up', kilometer: 100, facilityId: 'TUN-G65-100', facilityType: 'tunnel',
  laneIds: ['1'], deviceId: 'CAM-01', longitude: 106.5, latitude: 29.5,
};

function alarm(overrides: Partial<Alarm> = {}): Alarm {
  return freezeAlarm({
    alarmId: 'ALM-1', sourceAlarmId: 'SRC-1', sourceType: 'video_ai', sourceSystem: 'VIDEO-A',
    eventType: 'traffic_accident', detectedAt: '2026-08-25T01:00:00.000Z', firstReceivedAt: '2026-08-25T01:00:01.000Z',
    location: LOCATION, confidence: 0.9, rawPayloadRef: 'demo://1', evidenceIds: ['EVD-1'], simulation: true,
    ...overrides,
  });
}

function signal(overrides: Partial<Alarm> = {}, facts: AggregationSignal['facts'] = {}): AggregationSignal {
  return { alarm: alarm(overrides), facts };
}

function rowScore(result: ReturnType<typeof scoreAggregationCandidate>, dimension: string): number | undefined {
  return result.scoreRows.find((row) => row.dimension === dimension)?.score;
}

describe('FR-EM-003 七维聚合评分', () => {
  it('权重集中配置且严格合计为1，结果始终提供七维明细', () => {
    expect(Object.values(MONITORING_AGGREGATION_CONFIG.weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1);
    const result = scoreAggregationCandidate(
      signal(),
      signal({ alarmId: 'ALM-2', sourceAlarmId: 'SRC-2', sourceSystem: 'VIDEO-B' }),
    );
    expect(result.scoreRows).toHaveLength(7);
    expect(result.tier).toBe('auto_merge');
  });

  it('0.75边界自动聚合，0.45边界人工比对，低于0.45独立建事件', () => {
    expect(classifyAggregationScore(0.75).tier).toBe('auto_merge');
    expect(classifyAggregationScore(0.45).tier).toBe('manual_review');
    expect(classifyAggregationScore(0.449_999).tier).toBe('separate');
  });

  it('时间维度严格执行1分钟、5分钟和15分钟分段', () => {
    const anchor = signal();
    const atOne = scoreAggregationCandidate(anchor, signal({ alarmId: 'A2', detectedAt: '2026-08-25T01:01:00.000Z' }));
    const atFive = scoreAggregationCandidate(anchor, signal({ alarmId: 'A3', detectedAt: '2026-08-25T01:05:00.000Z' }));
    const atFifteen = scoreAggregationCandidate(anchor, signal({ alarmId: 'A4', detectedAt: '2026-08-25T01:15:00.000Z' }));
    expect(rowScore(atOne, 'time')).toBe(1);
    expect(rowScore(atFive, 'time')).toBe(0.7);
    expect(rowScore(atFifteen, 'time')).toBe(0.4);
  });

  it('反向、设施不同和类型不相容即使总分较高也不得自动聚合', () => {
    const anchor = signal();
    const opposite = scoreAggregationCandidate(anchor, signal({
      alarmId: 'OPPOSITE', location: { ...LOCATION, direction: 'down' }, sourceSystem: 'VIDEO-B',
    }));
    const otherFacility = scoreAggregationCandidate(anchor, signal({
      alarmId: 'FACILITY', location: { ...LOCATION, facilityId: 'TUN-G65-OTHER' }, sourceSystem: 'VIDEO-B',
    }));
    const incompatible = scoreAggregationCandidate(anchor, signal({
      alarmId: 'TYPE', eventType: 'fire', sourceSystem: 'VIDEO-B',
    }));
    for (const result of [opposite, otherFacility, incompatible]) {
      expect(result.tier).toBe('manual_review');
      expect(result.automaticMergeBlocks.length).toBeGreaterThan(0);
    }
  });

  it('已明确配置的相容类型得0.7且不触发类型阻断', () => {
    const result = scoreAggregationCandidate(
      signal(),
      signal({ alarmId: 'ALM-FIRE', eventType: 'fire', sourceSystem: 'VIDEO-B' }),
      { typeRelation: 'compatible' },
    );
    expect(rowScore(result, 'typeCompatibility')).toBe(0.7);
    expect(result.automaticMergeBlocks.some((reason) => reason.includes('类型'))).toBe(false);
  });

  it('初次1至3km只降低空间得分，不被错误地即时拆分', () => {
    const leftLocation = { ...LOCATION, facilityId: undefined, kilometer: 100 };
    const rightLocation = { ...LOCATION, facilityId: undefined, kilometer: 102 };
    const result = scoreAggregationCandidate(
      signal({ location: leftLocation }),
      signal({ alarmId: 'ALM-2', sourceSystem: 'VIDEO-B', location: rightLocation }),
    );
    expect(rowScore(result, 'spaceFacility')).toBe(0.6);
    expect(result.automaticMergeBlocks).toEqual([]);
  });
});

describe('FR-EM-003 事实冲突与独立演化拆分', () => {
  it('伤亡、车辆和危化品冲突进入人工比对且不静默覆盖', () => {
    const left = signal({}, { casualties: 0, vehicleCount: 1, hazardousMaterials: false });
    const right = signal({ alarmId: 'ALM-2', sourceSystem: 'VIDEO-B' }, {
      casualties: 2, vehicleCount: 3, hazardousMaterials: true,
    });
    const conflicts = detectAggregationFactConflicts(left, right);
    expect(conflicts.map((conflict) => conflict.field)).toEqual(expect.arrayContaining([
      'casualties', 'vehicleCount', 'hazardousMaterials',
    ]));
    const result = scoreAggregationCandidate(left, right);
    expect(result.tier).toBe('manual_review');
    expect(result.factConflicts.every((conflict) => conflict.status === 'pending')).toBe(true);
  });

  it('两个独立来源持续指向相距超过1km的位置时拆分并保留历史关系', () => {
    const left: EvolutionTrack = {
      trackId: 'TRACK-A', alarmIds: ['A1', 'A2'], sourceSystems: ['VIDEO-A'],
      locations: [{ ...LOCATION, facilityId: undefined, kilometer: 100 }], targetTrackIds: ['TARGET-A'],
    };
    const right: EvolutionTrack = {
      trackId: 'TRACK-B', alarmIds: ['B1', 'B2'], sourceSystems: ['VIDEO-B'],
      locations: [{ ...LOCATION, facilityId: undefined, kilometer: 102 }], targetTrackIds: ['TARGET-B'],
    };
    const result = evaluateIndependentEvolutionSplit('ME-001', left, right, '2026-08-25T02:00:00.000Z');
    expect(result.shouldSplit).toBe(true);
    expect(result.relation).toMatchObject({ originalEventId: 'ME-001', leftTrackId: 'TRACK-A', rightTrackId: 'TRACK-B' });
    expect(result.relation?.leftAlarmIds).toEqual(['A1', 'A2']);
  });

  it('只有一次观测或来源不独立时不得仅凭位置漂移拆分', () => {
    const left: EvolutionTrack = {
      trackId: 'A', alarmIds: ['A1'], sourceSystems: ['VIDEO-A'],
      locations: [{ ...LOCATION, facilityId: undefined, kilometer: 100 }],
    };
    const right: EvolutionTrack = {
      trackId: 'B', alarmIds: ['B1', 'B2'], sourceSystems: ['VIDEO-A'],
      locations: [{ ...LOCATION, facilityId: undefined, kilometer: 103 }],
    };
    const result = evaluateIndependentEvolutionSplit('ME-001', left, right, '2026-08-25T02:00:00.000Z');
    expect(result.shouldSplit).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(['两条演化轨迹尚未各自形成持续观测', '两条轨迹来源不独立']));
  });
});

describe('FR-EM-003 事件级综合可信度', () => {
  it('先求同源均值再对来源等权，结果不取最高Alarm置信度', () => {
    const result = computeEventConfidence([
      alarm({ alarmId: 'A1', sourceSystem: 'VIDEO-A', confidence: 0.9 }),
      alarm({ alarmId: 'A2', sourceSystem: 'VIDEO-A', confidence: 0.7 }),
      alarm({ alarmId: 'B1', sourceSystem: 'VIDEO-B', confidence: 0.6 }),
    ]);
    expect(result.sourceScores).toEqual([
      { sourceSystem: 'VIDEO-A', confidence: 0.8, alarmCount: 2 },
      { sourceSystem: 'VIDEO-B', confidence: 0.6, alarmCount: 1 },
    ]);
    expect(result.confidence).toBeCloseTo(0.7);
    expect(result.confidence).not.toBe(0.9);
  });

  it('无置信度输入时不编造事件可信度', () => {
    const result = computeEventConfidence([alarm({ confidence: undefined })]);
    expect(result.confidence).toBeUndefined();
    expect(result.alarmsWithoutConfidence).toBe(1);
  });
});
