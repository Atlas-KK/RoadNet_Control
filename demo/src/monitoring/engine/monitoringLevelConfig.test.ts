import { describe, expect, it } from 'vitest';
import { evaluateMonitoringLevel, MONITORING_LEVEL_CONFIG } from './monitoringLevel';

describe('FR-EM-007 配置引用完整性', () => {
  it('来源携带但未进入敏感设施配置的ID不会被静默视为敏感设施', () => {
    const assessment = evaluateMonitoringLevel({
      eventType: 'fire', fireConfirmed: true, facilityId: 'TUN-UNCONFIGURED-001',
    }, MONITORING_LEVEL_CONFIG);
    expect(assessment.level).toBe('L1');
    expect(assessment.reasonCodes).toEqual(['INSUFFICIENT_INFORMATION_OR_NO_HIGHER_RULE']);
    expect(assessment.insufficiencyCodes).toContain('SENSITIVE_FACILITY_REFERENCE_UNKNOWN');
  });
});
