import { describe, expect, it } from 'vitest';
import { buildDemoScenario, DEMO_MONITORING_SCENARIOS } from './demoScenarios';

describe('FR-EM-002 六个固定模拟场景', () => {
  it('场景目录严格包含执行文档指定的六个场景', () => {
    expect(DEMO_MONITORING_SCENARIOS.map((scenario) => scenario.scenarioId)).toEqual([
      'abnormal-stop-repeated',
      'pedestrian-false-positive',
      'road-debris-observation',
      'tunnel-accident-l3',
      'tunnel-fire-l4',
      'traffic-congestion-monitoring',
    ]);
  });

  it('异常停车产生12条连续告警和1条驶离解除消息', () => {
    const messages = buildDemoScenario('abnormal-stop-repeated', 42);
    expect(messages.filter((item) => item.message.kind === 'source_alarm')).toHaveLength(12);
    expect(messages.at(-1)?.message.kind).toBe('source_clear');
  });

  it('全部模拟消息和证据均携带simulation标识', () => {
    for (const scenario of DEMO_MONITORING_SCENARIOS) {
      const messages = buildDemoScenario(scenario.scenarioId, 7);
      expect(messages.length).toBeGreaterThan(0);
      for (const { message } of messages) {
        expect(message.simulation).toBe(true);
        expect(message.payload.simulation).toBe(true);
        if (message.kind === 'source_alarm') {
          expect(message.payload.eventType).toBe(scenario.eventType);
          expect(message.payload.evidence.every((item) => item.simulation)).toBe(true);
          expect(message.payload.evidence.some((item) => item.kind === 'key_frame')).toBe(true);
        }
      }
    }
  });

  it('同一seed产生完全一致的场景消息，不同seed改变确定性样本', () => {
    const first = buildDemoScenario('tunnel-accident-l3', 2026);
    const second = buildDemoScenario('tunnel-accident-l3', 2026);
    const different = buildDemoScenario('tunnel-accident-l3', 2027);
    expect(first).toEqual(second);
    expect(different).not.toEqual(first);
  });
});
