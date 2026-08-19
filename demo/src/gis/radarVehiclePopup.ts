function radarProperty(properties: Record<string, unknown>, key: string): string {
  const value = properties[key];
  return value == null ? '' : String(value);
}

function appendRadarPopupLine(container: HTMLElement, ownerDocument: Document, text: string, className?: string): void {
  const line = ownerDocument.createElement('div');
  if (className) line.className = className;
  line.textContent = text;
  container.appendChild(line);
}

export function createRadarVehiclePopupContent(properties: Record<string, unknown>, ownerDocument: Document = document): HTMLElement {
  const node = ownerDocument.createElement('div');
  node.className = 'min-w-[190px] text-xs leading-relaxed text-[#dcecff]';
  appendRadarPopupLine(node, ownerDocument, `雷视目标 ${radarProperty(properties, 'id')}`, 'mb-1 font-semibold text-white');
  appendRadarPopupLine(node, ownerDocument, `车型：${radarProperty(properties, 'kind')}`);
  appendRadarPopupLine(node, ownerDocument, `速度：${radarProperty(properties, 'speed')} km/h · 车道 ${radarProperty(properties, 'lane')}`);
  appendRadarPopupLine(node, ownerDocument, `状态：${radarProperty(properties, 'status')} · 轨迹连续`);
  appendRadarPopupLine(node, ownerDocument, `位置：${radarProperty(properties, 'road')} K${radarProperty(properties, 'kp')}`);
  appendRadarPopupLine(node, ownerDocument, '来源：雷视融合仿真数据', 'mt-1 text-[#81f0e0]');
  return node;
}
