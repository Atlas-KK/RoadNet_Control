export type ChartSpec =
  | {
      kind: 'gantt';
      title: string;
      xLabel: string;
      bars: { name: string; end: number; color: string; note?: string }[];
      refLines: { x: number; label: string; color: string }[];
    }
  | {
      kind: 'queueCurve';
      title: string;
      data: { t: number; tail: number }[];
      hubKp: number;
      hubLabel: string;
      crossT: number;
      crossLabel: string;
    };
