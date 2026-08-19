import { describe, expect, it } from 'vitest';
import { createIncidentPopupContent } from './incidentPopup';

class FakeElement {
  public textContent = '';
  public style = { cssText: '' };
  public children: FakeElement[] = [];

  append(child: FakeElement) {
    this.children.push(child);
  }
}

const fakeDocument = {
  createElement: () => new FakeElement(),
};

describe('incident popup content', () => {
  it('places dynamic event fields in text nodes instead of HTML strings', () => {
    const popup = createIncidentPopupContent(
      {
        id: 'EV-XSS',
        label: '<img src=x onerror=alert(1)>',
        road: 'G65',
        kp: '1190',
      },
      fakeDocument as unknown as Document,
    ) as unknown as FakeElement;

    expect(popup.children[1].textContent).toBe('<img src=x onerror=alert(1)>');
    expect(popup.children[1].children).toHaveLength(0);
  });
});
