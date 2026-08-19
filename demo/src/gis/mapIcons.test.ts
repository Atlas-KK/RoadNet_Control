import { describe, expect, it } from 'vitest';
import {
  DEVICE_ICON_BY_KIND,
  MAP_ICON_KEYS,
  MAP_ICON_URLS,
  OVERLAY_ICON_BY_KIND,
  RADAR_ICON_BY_KIND,
} from './mapIcons';

describe('GIS icon system', () => {
  it('keeps a unique generated asset for every map icon key', () => {
    expect(MAP_ICON_KEYS).toHaveLength(17);
    expect(new Set(MAP_ICON_KEYS).size).toBe(MAP_ICON_KEYS.length);
    for (const key of MAP_ICON_KEYS) expect(MAP_ICON_URLS[key]).toBe(`/map-icons/${key}.png`);
  });

  it('maps devices, overlays and simulated vehicles to concrete pictograms', () => {
    expect(DEVICE_ICON_BY_KIND).toMatchObject({ camera: 'camera', vms: 'vms', fan: 'fan', wind_sensor: 'wind' });
    expect(OVERLAY_ICON_BY_KIND).toMatchObject({ tunnel: 'tunnel', fog: 'fog', controlZone: 'control', hub: 'hub' });
    expect(RADAR_ICON_BY_KIND).toMatchObject({ '小客车': 'car', '大货车': 'truck', '大客车': 'bus' });
  });
});
