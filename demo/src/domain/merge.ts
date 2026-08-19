export interface MergeInfo {
  targetId: string;
  sources: string[];
  scoreRows: { dim: string; detail: string; score: number }[];
  total: number;
  decision: string;
}
