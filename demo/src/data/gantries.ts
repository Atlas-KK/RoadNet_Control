import type { RoadId } from './network';

/** 第一阶段演示用门架台账；生产环境可由门架资产接口替换。 */
export interface GantrySpec {
  id: string;
  road: RoadId;
  kp: number;
  label: string;
  laneCount: number;
}

export const GANTRIES: GantrySpec[] = [
  { id: 'G65-GT-1140', road: 'G65', kp: 1140, label: 'G65 K1140 上游门架', laneCount: 3 },
  { id: 'G65-GT-1162', road: 'G65', kp: 1162, label: 'G65 K1162 门架', laneCount: 3 },
  { id: 'G65-GT-1195', road: 'G65', kp: 1195, label: 'G65 K1195 门架', laneCount: 3 },
  { id: 'G65-GT-1205', road: 'G65', kp: 1205, label: 'G65 K1205 门架', laneCount: 3 },
  { id: 'G65S-GT-1230', road: 'G65S', kp: 1230, label: 'G65S K1230 门架', laneCount: 3 },
  { id: 'G65S-GT-1248', road: 'G65S', kp: 1248, label: 'G65S K1248 门架', laneCount: 3 },
  { id: 'G65S-GT-1278', road: 'G65S', kp: 1278, label: 'G65S K1278 门架', laneCount: 3 },
  { id: 'G56-GT-20', road: 'G56', kp: 20, label: 'G56 K20 门架', laneCount: 2 },
  { id: 'G56-GT-35', road: 'G56', kp: 35, label: 'G56 K35 门架', laneCount: 2 },
  { id: 'G56-GT-50', road: 'G56', kp: 50, label: 'G56 K50 门架', laneCount: 2 },
  { id: 'S204-GT-10', road: 'S204', kp: 10, label: 'S204 K10 门架', laneCount: 2 },
  { id: 'S204-GT-30', road: 'S204', kp: 30, label: 'S204 K30 门架', laneCount: 2 },
  { id: 'S204-GT-50', road: 'S204', kp: 50, label: 'S204 K50 门架', laneCount: 2 },
];
