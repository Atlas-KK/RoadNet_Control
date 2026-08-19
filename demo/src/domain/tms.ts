export interface TmsResult {
  measureId: string;
  title: string;
  supports: string[];
  outcome: '保留' | '降级' | '撤销';
  reason: string;
}
