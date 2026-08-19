export type MapTheme = 'dark' | 'light';

export interface MapThemeConfig {
  label: string;
  background: string;
  basemapUrl: string;
  showRaster: boolean;
  roadShadow: string;
  primaryRoad: string;
  secondaryRoad: string;
  laneDivider: string;
  roadLabel: string;
  labelHalo: string;
  landmarkLabel: string;
  controlBackground: string;
  controlBorder: string;
  controlText: string;
  gridBackground: string;
  gridEmpty: string;
  gridBorder: string;
  gridText: string;
}

export const MAP_THEME_CONFIG: Record<MapTheme, MapThemeConfig> = {
  dark: {
    label: '深色',
    background: '#071727',
    basemapUrl: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    showRaster: true,
    roadShadow: '#020812',
    primaryRoad: '#3b8cff',
    secondaryRoad: '#71859a',
    laneDivider: '#d5e7ff',
    roadLabel: '#cfe5ff',
    labelHalo: '#06111f',
    landmarkLabel: '#9fc7f4',
    controlBackground: '#071827',
    controlBorder: '#315372',
    controlText: '#cfe5ff',
    gridBackground: '#081A2B',
    gridEmpty: '#173047',
    gridBorder: '#29465E',
    gridText: '#8FA9C6',
  },
  light: {
    label: '浅色',
    background: '#F7F8FA',
    basemapUrl: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    showRaster: false,
    roadShadow: '#C9D3DF',
    primaryRoad: '#165DFF',
    secondaryRoad: '#86909C',
    laneDivider: '#FFFFFF',
    roadLabel: '#1D2129',
    labelHalo: '#FFFFFF',
    landmarkLabel: '#4E5969',
    controlBackground: '#FFFFFF',
    controlBorder: '#C9CDD4',
    controlText: '#1D2129',
    gridBackground: '#FFFFFF',
    gridEmpty: '#F2F3F5',
    gridBorder: '#E5E6EB',
    gridText: '#4E5969',
  },
};

export function isMapTheme(value: unknown): value is MapTheme {
  return value === 'dark' || value === 'light';
}
