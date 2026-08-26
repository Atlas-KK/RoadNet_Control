import { useEffect, useState } from 'react';
import { MONITORING_EVENT_TYPES, type MonitoringEventType, type TravelDirection } from '../../domain/monitoring';
import { MONITORING_EVENT_TYPE_LABELS } from '../selectors';
import { monitoringDemoRuntime, type ManualMonitoringReportInput } from '../services/monitoringDemoRuntime';
import { useMonitoringStore } from '../store';
import SimulatedUserSwitcher from '../../components/SimulatedUserSwitcher';

function optionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function ManualReportDialog({ onClose }: { onClose: () => void }) {
  const [eventType, setEventType] = useState<MonitoringEventType>('traffic_accident');
  const [roadCode, setRoadCode] = useState('G65');
  const [direction, setDirection] = useState<TravelDirection>('up');
  const [kilometer, setKilometer] = useState('1180');
  const [lanesAffected, setLanesAffected] = useState('1');
  const [lanesTotal, setLanesTotal] = useState('3');
  const [vehicleCount, setVehicleCount] = useState('');
  const [casualties, setCasualties] = useState('');
  const [flowVehPerHour, setFlowVehPerHour] = useState('');
  const [speedKmh, setSpeedKmh] = useState('');
  const [hazardousMaterials, setHazardousMaterials] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const kp = optionalNumber(kilometer);
    if (!roadCode.trim() || kp === undefined || !notes.trim()) {
      setError('道路、有效桩号和接报说明为必填项');
      return;
    }

    const counts = [lanesAffected, lanesTotal, vehicleCount, casualties];
    if (counts.some((value) => value.trim() && optionalInteger(value) === undefined)) {
      setError('车道数、车辆数和伤亡人数必须是非负整数');
      return;
    }
    const affected = optionalInteger(lanesAffected);
    const total = optionalInteger(lanesTotal);
    if (total !== undefined && total < 1) {
      setError('总车道数必须大于0');
      return;
    }
    if (affected !== undefined && total !== undefined && affected > total) {
      setError('影响车道数不能大于总车道数');
      return;
    }
    if ([flowVehPerHour, speedKmh].some((value) => value.trim() && optionalNumber(value) === undefined)) {
      setError('流量和车速必须是非负数');
      return;
    }

    const input: ManualMonitoringReportInput = {
      eventType,
      location: { roadCode: roadCode.trim(), direction, kilometer: kp, facilityType: 'road' },
      notes: notes.trim(),
      lanesAffected: affected, lanesTotal: total,
      vehicleCount: optionalInteger(vehicleCount), casualties: optionalInteger(casualties),
      flowVehPerHour: optionalNumber(flowVehPerHour), speedKmh: optionalNumber(speedKmh),
      hazardousMaterials,
    };
    setBusy(true);
    setError('');
    try {
      await monitoringDemoRuntime.submitManualReport(input);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '人工补报接入失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="monitoring-modal-layer" role="dialog" aria-modal="true" aria-label="事件监测人工补报">
      <button type="button" className="monitoring-modal-backdrop" aria-label="关闭人工补报" onClick={onClose} />
      <section className="monitoring-modal arco-card">
        <header>
          <div><h2>人工补报</h2><p>补充视频算法尚未覆盖的现场事件</p></div>
          <button type="button" className="arco-button arco-icon-button" aria-label="关闭人工补报" onClick={onClose}>×</button>
        </header>
        <p className="monitoring-demo-boundary">通过与视频AI相同的标准化入口写入模拟数据，不接入生产报警渠道。</p>
        <div className="monitoring-manual-grid">
          <label>事件类型<select value={eventType} onChange={(event) => setEventType(event.target.value as MonitoringEventType)}>{MONITORING_EVENT_TYPES.map((type) => <option key={type} value={type}>{MONITORING_EVENT_TYPE_LABELS[type]}</option>)}</select></label>
          <label>道路<input value={roadCode} onChange={(event) => setRoadCode(event.target.value)} /></label>
          <label>方向<select value={direction} onChange={(event) => setDirection(event.target.value as TravelDirection)}><option value="up">上行</option><option value="down">下行</option><option value="unknown">未知</option></select></label>
          <label>桩号 K<input type="number" min="0" step="0.1" value={kilometer} onChange={(event) => setKilometer(event.target.value)} /></label>
          <label>影响车道数<input type="number" min="0" step="1" value={lanesAffected} onChange={(event) => setLanesAffected(event.target.value)} /></label>
          <label>总车道数<input type="number" min="1" step="1" value={lanesTotal} onChange={(event) => setLanesTotal(event.target.value)} /></label>
          <label>涉及车辆数<input type="number" min="0" step="1" value={vehicleCount} onChange={(event) => setVehicleCount(event.target.value)} /></label>
          <label>伤亡人数<input type="number" min="0" step="1" value={casualties} onChange={(event) => setCasualties(event.target.value)} /></label>
          <label>流量（辆/小时）<input type="number" min="0" step="1" value={flowVehPerHour} onChange={(event) => setFlowVehPerHour(event.target.value)} /></label>
          <label>车速（公里/小时）<input type="number" min="0" step="0.1" value={speedKmh} onChange={(event) => setSpeedKmh(event.target.value)} /></label>
        </div>
        <label className="monitoring-manual-check"><input type="checkbox" checked={hazardousMaterials} onChange={(event) => setHazardousMaterials(event.target.checked)} />涉及危化品</label>
        <label className="monitoring-manual-notes">接报说明<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="填写可供核实的现场描述，不得录入真实敏感个人信息" /></label>
        {error ? <div className="arco-alert arco-alert-error" role="alert">{error}</div> : undefined}
        <footer><button type="button" className="arco-button" onClick={onClose}>取消</button><button type="button" className="arco-button arco-button-primary" disabled={busy} onClick={() => void submit()}>{busy ? '接入中…' : '补报并进入待核实'}</button></footer>
      </section>
    </div>
  );
}

interface MonitoringDemoBarProps {
  open: boolean;
  onClose: () => void;
}

export default function MonitoringDemoBar({ open, onClose }: MonitoringDemoBarProps) {
  const scenarios = monitoringDemoRuntime.listScenarios();
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.scenarioId ?? 'abnormal-stop-repeated');
  const [seed, setSeed] = useState('20260825');
  const [snapshot, setSnapshot] = useState(() => monitoringDemoRuntime.getSnapshot());
  const [notice, setNotice] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const activeCount = useMonitoringStore((state) => state.activeEventIds.length);
  const storedEventCount = useMonitoringStore((state) => Object.keys(state.monitoringEventsById).length);
  const connectionState = useMonitoringStore((state) => state.connectionState);

  useEffect(() => monitoringDemoRuntime.subscribe(() => setSnapshot(monitoringDemoRuntime.getSnapshot())), []);

  const start = async () => {
    const parsedSeed = Number(seed);
    if (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0) {
      setNotice('seed必须是非负整数');
      return;
    }
    if (storedEventCount > 0) {
      if (!window.confirm('加载新监测场景将清空事件监测演示数据，但不会影响智能管控。是否继续？')) return;
      await monitoringDemoRuntime.reset();
    }
    try {
      await monitoringDemoRuntime.startScenario(scenarioId, parsedSeed);
      setNotice('场景已启动；消息按脚本时间持续推送');
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '场景启动失败');
    }
  };

  const reset = async () => {
    if (!window.confirm('清空事件监测演示数据？该操作不影响智能管控。')) return;
    await monitoringDemoRuntime.reset();
    setNotice('事件监测演示数据已清空');
  };


  if (!open) return null;

  return (
    <div className="monitoring-demo-drawer-layer" data-testid="monitoring-demo-bar">
      <button type="button" className="monitoring-demo-drawer-backdrop" aria-label="关闭本地演示工具" onClick={onClose} />
      <aside className="monitoring-demo-bar arco-card" role="dialog" aria-modal="true" aria-label="本地演示工具">
        <header className="monitoring-section-heading monitoring-demo-heading">
          <div><h2>本地演示工具</h2><p>场景构造与人工补报，不接入生产报警与视频渠道</p></div>
          <div className="monitoring-demo-heading-actions"><span className="arco-tag monitoring-demo-tag">本地模拟</span><button type="button" className="arco-button arco-icon-button" aria-label="关闭本地演示工具" onClick={onClose}>×</button></div>
        </header>
        <div className="monitoring-demo-identity"><div><strong>模拟操作身份</strong><span>用于验证机构权限和角色差异</span></div><SimulatedUserSwitcher /></div>
        <div className="monitoring-demo-controls">
        <select aria-label="监测演示场景" value={scenarioId} onChange={(event) => setScenarioId(event.target.value as typeof scenarioId)}>{scenarios.map((scenario) => <option key={scenario.scenarioId} value={scenario.scenarioId}>{scenario.name}</option>)}</select>
        <label>seed<input aria-label="监测场景seed" value={seed} onChange={(event) => setSeed(event.target.value)} inputMode="numeric" /></label>
        <button type="button" className="arco-button arco-button-primary arco-button-size-mini" onClick={() => void start()}>加载场景</button>
        {snapshot.playbackState === 'running' ? <button type="button" className="arco-button arco-button-size-mini" onClick={() => monitoringDemoRuntime.pause()}>暂停</button> : undefined}
        {snapshot.playbackState === 'paused' ? <button type="button" className="arco-button arco-button-size-mini" onClick={() => monitoringDemoRuntime.resume()}>继续</button> : undefined}
        <button type="button" className="arco-button arco-button-size-mini" onClick={() => setManualOpen(true)}>人工补报</button>
        <button type="button" className="arco-button arco-button-danger arco-button-size-mini" onClick={() => void reset()}>清空监测数据</button>
      </div>
      <div className="monitoring-demo-status" role="status">
        连接：{connectionState} · 播放：{snapshot.playbackState} · 游标：{snapshot.streamCursor} · 活跃事件：{activeCount}{snapshot.processing ? ' · 处理中' : ''}
        {snapshot.lastError ? ` · 错误：${snapshot.lastError}` : notice ? ` · ${notice}` : ''}
      </div>
        {manualOpen ? <ManualReportDialog onClose={() => setManualOpen(false)} /> : undefined}
      </aside>
    </div>
  );
}

function optionalInteger(value: string): number | undefined {
  const parsed = optionalNumber(value);
  return parsed !== undefined && Number.isSafeInteger(parsed) ? parsed : undefined;
}
