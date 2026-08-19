import type { SimEvent } from '../domain/event';

interface PopupDocument {
  createElement(tagName: string): HTMLElement;
}

export interface IncidentPopupProperties {
  id?: unknown;
  label?: unknown;
  road?: unknown;
  kp?: unknown;
  typeLabel?: unknown;
  severityLabel?: unknown;
  summary?: unknown;
  photoUrl?: unknown;
  photoPosition?: unknown;
}

export const EVENT_PHOTO_SHEET = '/event-photos/event-type-contact-sheet.png';

const EVENT_TYPE_META: Record<string, { label: string; photoPosition: string }> = {
  E_追尾: { label: '追尾事故', photoPosition: '0% 0%' },
  E_事故: { label: '交通事故', photoPosition: '0% 0%' },
  E_侧翻: { label: '货车侧翻', photoPosition: '100% 0%' },
  E_抛锚: { label: '车辆抛锚', photoPosition: '0% 100%' },
  E_危化泄漏: { label: '危化品泄漏', photoPosition: '100% 100%' },
};

export function eventTypePresentation(typeNodeId: string, hazmat?: boolean) {
  if (hazmat) return EVENT_TYPE_META.E_危化泄漏;
  if (EVENT_TYPE_META[typeNodeId]) return EVENT_TYPE_META[typeNodeId];
  if (typeNodeId.includes('侧翻')) return EVENT_TYPE_META.E_侧翻;
  if (typeNodeId.includes('抛锚')) return EVENT_TYPE_META.E_抛锚;
  if (typeNodeId.includes('危化') || typeNodeId.includes('泄漏')) return EVENT_TYPE_META.E_危化泄漏;
  return { label: typeNodeId.replace(/^E_/, '') || '交通事件', photoPosition: '0% 0%' };
}

export function createIncidentPopupProperties(event: SimEvent): IncidentPopupProperties {
  const typeMeta = eventTypePresentation(event.typeNodeId, event.hazmat);
  const facts = [
    event.congested ? '已形成拥堵' : '暂未形成持续拥堵',
    `${event.lanesClosed}/${event.lanesTotal} 车道占用`,
    event.casualties ? `伤亡 ${event.casualties} 人` : '',
    event.hazmat ? '涉及危化品' : '',
  ].filter(Boolean);
  return {
    id: event.id,
    label: event.label,
    road: event.road,
    kp: event.accidentKp,
    typeLabel: typeMeta.label,
    severityLabel: event.severity ?? '一般',
    summary: facts.join(' · '),
    photoUrl: EVENT_PHOTO_SHEET,
    photoPosition: typeMeta.photoPosition,
  };
}

function asText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export function createIncidentPopupContent(
  properties: IncidentPopupProperties,
  doc: PopupDocument = document,
): HTMLDivElement {
  const root = doc.createElement('div') as HTMLDivElement;
  root.style.cssText = 'width:220px;overflow:hidden;border-radius:8px;background:#0a1a2c;color:#e8f2ff;font:12px/1.5 Segoe UI,Microsoft YaHei';

  const id = doc.createElement('b');
  id.textContent = asText(properties.id);
  root.append(id);

  const labelLine = doc.createElement('div');
  labelLine.textContent = asText(properties.label);
  root.append(labelLine);

  const locationLine = doc.createElement('div');
  locationLine.textContent = `${asText(properties.road)} K${asText(properties.kp)}`;
  root.append(locationLine);

  const typeLine = doc.createElement('div');
  typeLine.textContent = `${asText(properties.typeLabel)} · ${asText(properties.severityLabel)}`;
  root.append(typeLine);

  const summaryLine = doc.createElement('div');
  summaryLine.textContent = asText(properties.summary);
  root.append(summaryLine);

  if (properties.photoUrl) {
    const photo = doc.createElement('div');
    photo.style.cssText = `height:92px;margin-top:8px;border-radius:6px;background-image:url("${asText(properties.photoUrl)}");background-size:200% 200%;background-position:${asText(properties.photoPosition) || '0% 0%'};background-repeat:no-repeat`;
    root.append(photo);
  }

  return root;
}
