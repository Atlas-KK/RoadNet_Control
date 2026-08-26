import { describe, expect, it } from 'vitest';
import type { SessionStorageLike } from '../../appShellState';
import { clearVerificationDraft, persistVerificationDraft, readVerificationDraft } from './verificationDraft';

function storage(): SessionStorageLike {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
  };
}

const snapshot = {
  version: 1 as const, eventId: 'ME-1', userId: 'USR-1', savedAt: '2026-08-25T01:00:00.000Z',
  fields: {
    eventType: 'traffic_accident' as const, confirmedLevel: 'L3' as const, roadCode: 'G65', direction: 'up' as const,
    kilometer: '1180', lanesAffected: '2', lanesTotal: '3', vehicleCount: '2', casualties: '0',
    flowVehPerHour: '1800', speedKmh: '35', hazardousMaterials: false,
    reason: '视频确认', notes: '两车碰撞',
  },
};

describe('FR-EM-011 核实草稿sessionStorage恢复', () => {
  it('按事件和用户隔离保存、恢复和清理草稿', () => {
    const target = storage();
    expect(persistVerificationDraft(target, snapshot)).toBe(true);
    expect(readVerificationDraft(target, 'ME-1', 'USR-1')).toEqual(snapshot);
    expect(readVerificationDraft(target, 'ME-1', 'USR-2')).toBeUndefined();
    expect(clearVerificationDraft(target, 'ME-1', 'USR-1')).toBe(true);
    expect(readVerificationDraft(target, 'ME-1', 'USR-1')).toBeUndefined();
  });

  it('兼容恢复旧版草稿并忽略其中可伪造的班长ID', () => {
    const target = storage();
    target.setItem('roadgov-mvp:monitoring-verification-draft:v1:ME-1:USR-1', JSON.stringify({
      ...snapshot,
      fields: {
        eventType: 'traffic_accident', confirmedLevel: 'L3', roadCode: 'G65', direction: 'up',
        kilometer: '1180', lanesAffected: '2', vehicleCount: '2', casualties: '0',
        hazardousMaterials: false, reason: '视频确认', notes: '旧草稿', supervisorId: 'USR-SUPERVISOR',
      },
    }));

    const restored = readVerificationDraft(target, 'ME-1', 'USR-1');
    expect(restored?.fields).toMatchObject({ lanesTotal: '', flowVehPerHour: '', speedKmh: '' });
    expect(restored?.fields).not.toHaveProperty('supervisorId');
  });

  it('损坏数据不会伪装成可恢复草稿', () => {
    const target = storage();
    target.setItem('roadgov-mvp:monitoring-verification-draft:v1:ME-1:USR-1', '{bad');
    expect(readVerificationDraft(target, 'ME-1', 'USR-1')).toBeUndefined();
  });
});
