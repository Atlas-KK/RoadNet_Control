import { describe, expect, it } from 'vitest';
import { DEMO_CASES, demoCaseById } from './demoCases';

describe('五个运行模式演示案例数据', () => {
  it('案例编号唯一且覆盖五类演示能力', () => {
    const ids = DEMO_CASES.map((item) => item.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toEqual([
      'cross-event-diversion',
      'resource-squeeze',
      'condition-jump',
      'fact-retraction',
      'self-reference',
    ]);
  });

  it('案例二携带资源占用方阶段，案例三携带环境和通风输入', () => {
    const resource = demoCaseById('resource-squeeze');
    expect(resource.events[0].occupyResources).toEqual(['W-01', 'W-02']);
    expect(resource.events[0].input.stage).toContain('已 28min');

    const condition = demoCaseById('condition-jump');
    expect(condition.environment.fogBands[0]).toEqual({ road: 'G65', fromKp: 1170, toKp: 1180.4 });
    expect(condition.events[0].input.wind).toEqual({ dir: 'forward', speed: 2.1 });
    expect(condition.events[0].input.spillLighterThanAir).toBe(true);
    expect(condition.twinScript?.phases.map((phase) => phase.atSimSec)).toEqual(expect.arrayContaining([
      40 * 60 + 18, 43 * 60, 58 * 60, 75 * 60,
    ]));
    expect(condition.twinScript?.phases.at(-1)?.completion).toMatchObject({ finalizeEvent: true });
    expect(condition.twinScript?.resourceRoutes).toEqual(expect.arrayContaining([
      expect.objectContaining({ resourceId: 'L-01', targetKp: 1168, arriveSimSec: 50 * 60 }),
      expect.objectContaining({ resourceId: 'A-01', targetKp: 1178.4, arriveSimSec: 50 * 60 }),
      expect.objectContaining({ resourceId: 'F-STA', targetKp: 1148, arriveSimSec: 58 * 60 }),
    ]));
  });

  it('案例四包含事实撤回阶段，案例五锁定自引用交通流输入', () => {
    const revision = demoCaseById('fact-retraction');
    expect(revision.twinScript?.revisions).toEqual([
      expect.objectContaining({ retractedFacts: ['F_泄漏'], simSec: 25 * 60 }),
    ]);

    const selfReference = demoCaseById('self-reference');
    expect(selfReference.events[0].input).toMatchObject({ accidentKp: 1165.8, q: 5200, lanesClosed: 2 });
  });
});
