import { describe, expect, it } from 'vitest';
import type { MonitoringEvent } from '../../domain/monitoring';
import {
  applySuggestedLevelAssessment,
  evaluateMonitoringLevel,
  MONITORING_LEVEL_CONFIG,
  type MonitoringLevelConfig,
} from './monitoringLevel';

const tunnelId = MONITORING_LEVEL_CONFIG.sensitiveFacilityIds[0];
const keyNodeId = MONITORING_LEVEL_CONFIG.keyNodes[0]?.id;

describe('FR-EM-007 监测等级短路规则', () => {
  it('L4命中后短路，不被同时命中的L3/L2规则覆盖', () => {
    const assessment = evaluateMonitoringLevel({
      eventType: 'traffic_accident', casualties: 1, lanesAffected: 2, lanesTotal: 3,
      eventConfirmed: true, persistent: true,
    });
    expect(assessment.level).toBe('L4');
    expect(assessment.reasonCodes).toContain('CASUALTIES_KNOWN');
    expect(assessment.reasonCodes).not.toContain('LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT');
  });

  it('隧道确认火灾和已配置关键节点失效进入L4', () => {
    expect(evaluateMonitoringLevel({ eventType: 'fire', fireConfirmed: true, facilityId: tunnelId }).level).toBe('L4');
    expect(evaluateMonitoringLevel({ eventType: 'abnormal_stop', keyNodeFailureId: keyNodeId }).reasonCodes)
      .toContain('CONFIGURED_KEY_NODE_FAILURE');
  });

  it('车道、危险驾驶和拥堵阈值按配置进入L3', () => {
    expect(evaluateMonitoringLevel({ eventType: 'traffic_accident', lanesAffected: 2, lanesTotal: 3 }).level).toBe('L3');
    expect(evaluateMonitoringLevel({ eventType: 'wrong_way_driving', eventConfirmed: true }).level).toBe('L3');
    const congestion = evaluateMonitoringLevel({
      eventType: 'traffic_congestion', eventConfirmed: true, congestionDurationMin: 10, queueLengthKm: 3,
    });
    expect(congestion.level).toBe('L3');
    expect(congestion.reasonCodes).toContain('CONGESTION_DURATION_AND_QUEUE_THRESHOLD_REACHED');
  });

  it('L2和L1结果也始终提供可追踪reasonCodes', () => {
    const l2 = evaluateMonitoringLevel({ eventType: 'road_debris', persistent: true });
    const l1 = evaluateMonitoringLevel({ eventType: 'fire', evidenceCount: 1, confidence: 0.2 });
    expect(l2).toMatchObject({ level: 'L2', reasonCodes: ['PERSISTENT_ABNORMAL_STOP_OR_DEBRIS'] });
    expect(l1).toMatchObject({ level: 'L1', reasonCodes: ['INSUFFICIENT_INFORMATION_OR_NO_HIGHER_RULE'] });
  });

  it('缺失关键配置时返回依据不足，不自建节点、设施或阈值', () => {
    const emptyConfig: MonitoringLevelConfig = { keyNodes: [], sensitiveFacilityIds: [] };
    const assessment = evaluateMonitoringLevel({
      eventType: 'traffic_congestion', predictedKeyNodeId: '未知节点', predictedKeyNodeArrivalMin: 10,
      facilityId: '未知设施', eventConfirmed: true,
    }, emptyConfig);
    expect(assessment.level).toBe('L2');
    expect(assessment.insufficiencyCodes).toEqual(expect.arrayContaining([
      'KEY_NODE_CONFIG_MISSING', 'TRAFFIC_THRESHOLD_CONFIG_MISSING',
    ]));
  });

  it('更新suggestedLevel时不覆盖人工confirmedLevel，也不映射管控Severity', () => {
    const event: MonitoringEvent = {
      monitoringEventId: 'ME-LVL', version: 3, alarmIds: [], eventType: 'traffic_accident',
      location: { roadCode: 'G65', direction: 'up' }, suggestedLevel: 'L4', confirmedLevel: 'L2',
      verificationStatus: 'confirmed', lifecycleStatus: 'monitoring', observationCount: 0, conflicts: [],
      detectedAt: '2026-08-25T02:00:00.000Z', updatedAt: '2026-08-25T02:01:00.000Z', simulation: true,
    };
    const updated = applySuggestedLevelAssessment(
      event,
      evaluateMonitoringLevel({ eventType: 'traffic_accident', lanesAffected: 2, lanesTotal: 3 }),
      '2026-08-25T02:02:00.000Z',
    );
    expect(updated.suggestedLevel).toBe('L3');
    expect(updated.confirmedLevel).toBe('L2');
    expect(updated.suggestedLevelReasonCodes).toContain('LANES_AFFECTED_AT_LEAST_CONFIGURED_COUNT');
    expect('severity' in updated).toBe(false);
  });
});
