import { describe, expect, it } from 'vitest';
import { createRadarVehiclePopupContent } from './radarVehiclePopup';

class FakeElement {
  public className = '';
  public textContent = '';
  public children: FakeElement[] = [];

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }
}

const fakeDocument = {
  createElement: () => new FakeElement(),
};

describe('GIS radar vehicle popup', () => {
  it('renders radar vehicle fields as text nodes instead of HTML', () => {
    const popup = createRadarVehiclePopupContent(
      {
        id: '<img src=x onerror=alert(1)>',
        kind: '小客车',
        speed: '42',
        lane: '2',
        status: '慢行',
        road: 'G65',
        kp: '1179',
      },
      fakeDocument as unknown as Document,
    ) as unknown as FakeElement;

    expect(popup.children[0].textContent).toBe('雷视目标 <img src=x onerror=alert(1)>');
    expect(popup.children[0].children).toHaveLength(0);
  });
});
