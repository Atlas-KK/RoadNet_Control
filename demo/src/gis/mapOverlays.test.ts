import { describe, expect, it } from 'vitest';
import { nearestUpstreamHub, resolveMapOverlays, type RuntimeOverlayContext } from './mapOverlays';
import { EMPTY_ENVIRONMENT } from '../engine/conditions';
import { HUBS } from '../data/network';
import { demoCaseById } from '../data/demoCases';
import { resolveDemoTwin } from './demoTwinScenario';

describe('地图叠加要素（静态路网设施 + 运行期环境）', () => {
  it('无环境要素时仍常驻渲染隧道带、分流线与枢纽点（与场景/事件无关）', () => {
    const { lines, points } = resolveMapOverlays(EMPTY_ENVIRONMENT, []);
    expect(lines.some((l) => l.kind === 'tunnel')).toBe(true);
    expect(lines.some((l) => l.kind === 'diversion')).toBe(true);
    expect(points.some((p) => p.kind === 'hub')).toBe(true);
    // 团雾为运行期要素，无雾区配置时不应出现。
    expect(lines.some((l) => l.kind === 'fog')).toBe(false);
  });

  it('隧道带覆盖 data/network.ts 声明的全部隧道（含新增秦岭/终南山隧道群）', () => {
    const { lines } = resolveMapOverlays(EMPTY_ENVIRONMENT, []);
    const tunnelLabels = lines.filter((l) => l.kind === 'tunnel').map((l) => l.label);
    expect(tunnelLabels).toContain('青云隧道');
    expect(tunnelLabels).toContain('终南山特长隧道');
    expect(tunnelLabels).toContain('秦岭1号隧道');
    expect(tunnelLabels).toContain('秦岭2号隧道');
  });

  it('environment.fogBands 驱动团雾带；坐标插值折线含首尾', () => {
    const { lines } = resolveMapOverlays({ fogBands: [{ road: 'G65', fromKp: 1170, toKp: 1174 }], offlineDeviceIds: [] }, []);
    const fog = lines.find((l) => l.kind === 'fog');
    expect(fog).toBeDefined();
    expect(fog!.coordinates.length).toBeGreaterThan(1);
  });

  it('命中高亮引用时对应要素被强调', () => {
    const { lines } = resolveMapOverlays({ fogBands: [{ road: 'G65', fromKp: 1170, toKp: 1174 }], offlineDeviceIds: [] }, ['fog']);
    expect(lines.find((l) => l.kind === 'fog')!.emph).toBe(true);
    expect(lines.find((l) => l.kind === 'tunnel')!.emph).toBe(false);
  });

  it('无聚焦预案时不生成 wind/controlZone/closure，避免回退为场景硬编码', () => {
    const { lines, points } = resolveMapOverlays(EMPTY_ENVIRONMENT, []);
    expect(lines.some((l) => l.kind === 'wind' || l.kind === 'controlZone')).toBe(false);
    expect(points.some((p) => p.kind === 'closure')).toBe(false);
  });

  it('从聚焦预案措施参数回填通风方向、无人管制区和封道执行点', () => {
    const { lines, points } = resolveMapOverlays(EMPTY_ENVIRONMENT, ['wind', 'controlZone', 'closure'], {
      road: 'G65',
      plan: {
        measures: [
          {
            measureId: 'M_通风',
            params: {
              排风方向: { value: '反向排风至入口侧', source: '模板计算' },
              无人管制区: { value: 'K1178.4–K1179.9', source: 'GIS现算' },
            },
          },
          {
            measureId: 'M_全封',
            params: {
              封道执行落点: { value: 'VMS-05@K1168', source: 'GIS现算' },
            },
          },
        ],
      },
    });

    const controlZone = lines.find((line) => line.kind === 'controlZone');
    const wind = lines.find((line) => line.kind === 'wind');
    const closure = points.find((point) => point.kind === 'closure');
    expect(controlZone?.label).toBe('无人管制区 K1178.4–K1179.9');
    expect(controlZone?.emph).toBe(true);
    expect(wind?.label).toBe('反向排风至入口侧');
    expect(wind?.emph).toBe(true);
    expect(wind?.coordinates[0]).toEqual(controlZone?.coordinates.at(-1));
    expect(closure?.label).toBe('VMS-05@K1168');
    expect(closure?.kp).toBe(1168);
    expect(closure?.emph).toBe(true);
  });

  it('nearestUpstreamHub 返回同路且桩号更小的最近枢纽', () => {
    const hub = nearestUpstreamHub('G65', 1165.8);
    expect(hub?.id).toBe('K1160枢纽');
    expect(nearestUpstreamHub('G65', 1150)).toBeUndefined(); // 已在枢纽上游，无更近枢纽
    expect(nearestUpstreamHub('G65S', 1260)).toBeUndefined(); // 南段暂无声明枢纽
  });

  it('案例三在风机启动后沿隧道绘制风场和扩散带，并在全封前隐藏封道点', () => {
    const script = demoCaseById('condition-jump').twinScript!;
    const active = { eventId: 'EV-S3', script };
    const plan: RuntimeOverlayContext['plan'] = {
      measures: [
        { measureId: 'M_通风', params: { 排风方向: { value: '正向排风至出口侧', source: '模板计算' as const }, 无人管制区: { value: 'K1178.4–K1179.9', source: 'GIS现算' as const } } },
        { measureId: 'M_全封', params: { 封道执行落点: { value: 'VMS-05@K1168', source: 'GIS现算' as const } } },
      ],
    };
    const beforeClosure = resolveMapOverlays(EMPTY_ENVIRONMENT, [], { road: 'G65', plan, twin: resolveDemoTwin(active, 42 * 60) });
    const afterClosure = resolveMapOverlays(EMPTY_ENVIRONMENT, [], { road: 'G65', plan, twin: resolveDemoTwin(active, 43 * 60) });

    expect(beforeClosure.lines.find((line) => line.kind === 'wind')?.label).toContain('FAN-01');
    expect(beforeClosure.lines.some((line) => line.kind === 'gasPlume')).toBe(true);
    expect(beforeClosure.points.some((point) => point.kind === 'closure')).toBe(false);
    expect(afterClosure.points.find((point) => point.kind === 'closure')?.kp).toBe(1168);
  });

  it('HUBS 为非空静态表，供地图与自引用检测复用', () => {
    expect(HUBS.length).toBeGreaterThan(0);
  });
});
