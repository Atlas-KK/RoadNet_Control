import type { EventFinalReport, SimEvent } from '../domain/event';
import type { Plan } from '../domain/plan';
import type { TraceStep } from './trace';
import type { ActiveDemoTwin } from '../gis/demoTwinScenario';
import { demoTwinPhasesForEvent, demoTwinRevisionsForEvent } from '../gis/demoTwinScenario';
import { resolveTrafficMonitorReading } from './trafficMonitor';

interface BuildFinalReportInput {
  event: SimEvent;
  plans: Plan[];
  trace: TraceStep[];
  activeDemoTwin?: ActiveDemoTwin;
  simSec: number;
  completion: { note: string };
  queueCleared: boolean;
}

/** 将演变脚本、推理、预案与效果指标固化为可持久化的事件处置闭环摘要。 */
export function buildEventFinalReport(input: BuildFinalReportInput): EventFinalReport {
  const { event, plans, trace, activeDemoTwin, simSec, completion, queueCleared } = input;
  const relatedPlans = plans
    .filter((plan) => plan.id === `PLAN-${event.id}`)
    .sort((a, b) => a.version - b.version);
  const completedPlan = [...relatedPlans].reverse().find((plan) => plan.state === '已完成');
  const before = resolveTrafficMonitorReading(event, [], event.startSimSec, activeDemoTwin);
  const after = resolveTrafficMonitorReading(event, plans, simSec, activeDemoTwin);

  return {
    generatedSimSec: simSec,
    summary: completion.note,
    completedMeasureCount: completedPlan?.measures.filter((measure) => measure.runState === '已完成').length ?? 0,
    capacityBeforeVehPerHour: before.capacityVehPerHour,
    capacityAfterVehPerHour: after.capacityVehPerHour,
    drivingDensityBeforeVehPerKm: before.drivingDensityVehPerKm,
    drivingDensityAfterVehPerKm: after.drivingDensityVehPerKm,
    queueCleared,
    evolution: demoTwinPhasesForEvent(activeDemoTwin, event.id)
      .filter((phase) => phase.atSimSec <= simSec)
      .map((phase) => ({
        simSec: phase.atSimSec,
        label: phase.label,
        closureActive: phase.traffic.closureActive,
        availableLanes: phase.traffic.availableLanes ?? Math.max(0, event.lanesTotal - event.lanesClosed),
        queuedVehicleCount: phase.traffic.queuedVehicleCount,
        queueSpeedKmh: phase.traffic.queueSpeedKmh,
        visibilityMeters: phase.traffic.visibilityMeters,
        autoIssuedMeasureIds: phase.autoIssueMeasureIds ?? [],
        ventilation: phase.ventilation
          ? { fanId: phase.ventilation.fanId, direction: phase.ventilation.direction, fanEnabled: phase.ventilation.fanEnabled }
          : undefined,
      })),
    planVersions: relatedPlans.map((plan) => ({
      version: plan.version,
      label: plan.label,
      state: plan.state,
      responsible: plan.responsible,
      measures: plan.measures.map((measure) => ({
        measureId: measure.measureId,
        title: measure.title,
        tier: measure.tier,
        summary: measure.summary,
        runState: measure.runState,
        confirmSimSec: measure.confirmSimSec,
        resource: measure.resource,
      })),
    })),
    revisions: demoTwinRevisionsForEvent(activeDemoTwin, event.id).map((revision) => ({
      simSec: revision.simSec,
      note: revision.note,
      retractedFacts: revision.retractedFacts,
    })),
    reasoning: trace
      .filter((step) => step.eventId === event.id)
      .map((step) => ({ phase: step.phase, title: step.title, conclusion: step.conclusion })),
  };
}
