import { describe, expect, it } from 'vitest';
import { nearestCameraId } from './devices';

describe('nearestCameraId', () => {
  it('G65 K1190 选择 CAM-1195', () => expect(nearestCameraId('G65', 1190)).toBe('CAM-1195'));
  it('G65 K1178 选择 CAM-1177', () => expect(nearestCameraId('G65', 1178)).toBe('CAM-1177'));
  it('同道路无摄像机时不跨道路选择', () => expect(nearestCameraId('G56', 24)).toBeUndefined());
  it('G65S K1262 选择终南山洞内摄像机', () => expect(nearestCameraId('G65S', 1262)).toBe('CAM-1264'));
});
