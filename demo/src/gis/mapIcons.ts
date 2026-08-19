export type MapIconKey =
  | 'incident'
  | 'camera'
  | 'vms'
  | 'fan'
  | 'wind'
  | 'wrecker'
  | 'ambulance'
  | 'patrol'
  | 'fire'
  | 'car'
  | 'truck'
  | 'bus'
  | 'queue'
  | 'hub'
  | 'fog'
  | 'tunnel'
  | 'control';

export const MAP_ICON_KEYS: MapIconKey[] = [
  'incident', 'camera', 'vms', 'fan',
  'wind',
  'wrecker', 'ambulance', 'patrol', 'fire',
  'car', 'truck', 'bus', 'queue',
  'hub', 'fog', 'tunnel', 'control',
];

export const MAP_ICON_URLS: Record<MapIconKey, string> = Object.fromEntries(
  MAP_ICON_KEYS.map((key) => [key, `/map-icons/${key}.png`]),
) as Record<MapIconKey, string>;

export const DEVICE_ICON_BY_KIND: Record<string, MapIconKey> = {
  camera: 'camera',
  vms: 'vms',
  traffic_signal: 'control',
  lane_signal: 'control',
  fan: 'fan',
  wind_sensor: 'wind',
};

export const OVERLAY_ICON_BY_KIND: Record<string, MapIconKey> = {
  tunnel: 'tunnel',
  fog: 'fog',
  controlZone: 'control',
  wind: 'wind',
  gasPlume: 'fog',
  diversion: 'hub',
  closure: 'control',
  hub: 'hub',
};

export const RADAR_ICON_BY_KIND: Record<string, MapIconKey> = {
  '小客车': 'car',
  '大货车': 'truck',
  '大客车': 'bus',
  '小货车': 'truck',
};
