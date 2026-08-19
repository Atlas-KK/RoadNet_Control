import { describe, expect, it } from 'vitest';
import { demoCaseById } from '../data/demoCases';
import { resolveDemoTwin, routeForResource, type ActiveDemoTwin } from './demoTwinScenario';

function activeCase(id: Parameters<typeof demoCaseById>[0]): ActiveDemoTwin {
  const demoCase = demoCaseById(id);
  if (!demoCase.twinScript) throw new Error(`Missing twin script for ${id}`);
  return {
    eventId: `event-${demoCase.twinScript.eventIndex}`,
    eventIds: demoCase.events.map((_, index) => `event-${index}`),
    script: demoCase.twinScript,
  };
}

describe('scripted demo twins', () => {
  it('keeps the case one G56 collision visible while replacing the conflicting diversion', () => {
    const active = activeCase('cross-event-diversion');
    expect(resolveDemoTwin(active, 82 * 60, 'event-0')?.phase.traffic.queueTailKp).toBe(29.7);
    expect(resolveDemoTwin(active, 83 * 60, 'event-1')?.phase.diversion).toMatchObject({
      connectorRoad: 'S204', fromKp: 1140,
    });
  });

  it('moves W-01 from the occupied case two scene only after release', () => {
    const active = activeCase('resource-squeeze');
    expect(routeForResource(active, 'W-01', 56 * 60)).toMatchObject({ targetKp: 1180 });
    expect(routeForResource(active, 'W-01', 57 * 60)).toMatchObject({ fromKp: 1180, targetKp: 1210 });
    expect(resolveDemoTwin(active, 81 * 60, 'event-1')?.phase.traffic.queueTailKp).toBe(1208.6);
  });

  it('removes the hazardous-state GIS effects only after case four verification', () => {
    const active = activeCase('fact-retraction');
    expect(resolveDemoTwin(active, 7 * 60)?.phase.ventilation?.fanEnabled).toBe(true);
    const verified = resolveDemoTwin(active, 25 * 60)?.phase;
    expect(verified?.ventilation).toBeUndefined();
    expect(verified).toMatchObject({
      traffic: { closureActive: false, controlledFlow: { speedKmh: 40 } },
    });
  });

  it('uses the self-reference timing to switch case five to S204 before the queue reaches K1160', () => {
    const active = activeCase('self-reference');
    expect(resolveDemoTwin(active, 3 * 60)?.phase.diversion?.connectorRoad).toBe('S204');
    expect(resolveDemoTwin(active, 36 * 60)?.phase.traffic.queueTailKp).toBe(1160);
  });
});
