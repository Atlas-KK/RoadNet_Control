// 阶段5响应式验收合同；CSS断点与此函数保持一致。
export type MonitoringGridColumns = 2 | 3 | 4;

export function monitoringGridColumns(viewportWidth: number): MonitoringGridColumns {
  if (!Number.isFinite(viewportWidth) || viewportWidth < 1280) throw new Error('事件监测MVP最低验收宽度为1280px');
  if (viewportWidth > 1600) return 4;
  if (viewportWidth > 1320) return 3;
  return 2;
}
