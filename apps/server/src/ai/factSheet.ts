/**
 * The Facts Sheet: the only information the AI dispatcher receives. Every
 * value is produced by the deterministic engine. The verifier later checks
 * that every number, time and identifier in the AI's answer appears here.
 */
import {
  formatClock,
  type Closure,
  type Dataset,
  type FlightOutcome,
  type Kpis,
  type KpiDelta,
  type RecoveryReport,
  type SimulationResult,
} from '@domino/engine';

export const PLAN_OPTION_ID = 'PLAN';

export interface FactKpis {
  delayedFlights: number;
  cancelledFlights: number;
  totalDelayMin: number;
  maxDelayMin: number;
  knockOnFlights: number;
  brokenConnections: number;
  strandedPax: number;
  delayedPax: number;
  crewDutyBreaches: number;
}

export interface FactOption {
  optionId: string;
  description: string;
  actionIds: string[];
  after: FactKpis;
  /** Positive numbers = reduction versus the disrupted baseline. */
  reduction: {
    strandedPax: number;
    totalDelayMin: number;
    cancelledFlights: number;
    brokenConnections: number;
  };
  score: number;
  scoreImprovement: number;
}

export interface FactFlight {
  flightId: string;
  route: string;
  scheduledDeparture: string;
  status: string;
  delayMin: number;
  pax: number;
  why: string;
}

export interface FactSheet {
  scenario: {
    closures: { airport: string; city: string; start: string; end: string; durationMin: number }[];
  };
  network: {
    totalFlights: number;
    totalPassengers: number;
    aircraft: number;
    /** All airport codes in the network (verifier reference data, not a citable fact). */
    airportCodes: string[];
  };
  baseline: FactKpis & { score: number };
  options: FactOption[];
  mostAffectedFlights: FactFlight[];
  scoring: { strandedPaxWeight: number; delayMinWeight: number; cancellationWeight: number };
}

function factKpis(k: Kpis): FactKpis {
  return {
    delayedFlights: k.delayedFlights,
    cancelledFlights: k.cancelledFlights,
    totalDelayMin: k.totalDelayMin,
    maxDelayMin: k.maxDelayMin,
    knockOnFlights: k.knockOnFlights,
    brokenConnections: k.brokenConnections,
    strandedPax: k.strandedPax,
    delayedPax: k.delayedPax,
    crewDutyBreaches: k.crewDutyBreaches,
  };
}

function reduction(d: KpiDelta): FactOption['reduction'] {
  return {
    strandedPax: -d.strandedPax,
    totalDelayMin: -d.totalDelayMin,
    cancelledFlights: -d.cancelledFlights,
    brokenConnections: -d.brokenConnections,
  };
}

function why(f: FlightOutcome): string {
  const first = f.chain.links[0]?.reason ?? 'On time';
  const root = f.chain.root;
  const rootText =
    root.kind === 'CLOSURE'
      ? ` (root cause: ${root.airport} closed ${formatClock(root.start)}-${formatClock(root.end)})`
      : '';
  return `${first}${rootText}`;
}

export function buildFactSheet(
  dataset: Dataset,
  closures: readonly Closure[],
  baseline: SimulationResult,
  report: RecoveryReport,
  maxOptions = 4,
): FactSheet {
  const options: FactOption[] = report.candidates.slice(0, maxOptions).map((c) => ({
    optionId: c.id,
    description: c.description,
    actionIds: [c.id],
    after: factKpis(c.kpis),
    reduction: reduction(c.delta),
    score: c.score,
    scoreImprovement: c.improvement,
  }));
  if (report.plan.steps.length > 1) {
    options.push({
      optionId: PLAN_OPTION_ID,
      description: `Combined plan: ${report.plan.steps.map((s) => s.description).join('; then ')}`,
      actionIds: report.plan.steps.map((s) => s.id),
      after: factKpis(report.plan.kpis),
      reduction: reduction(report.plan.delta),
      score: report.plan.score,
      scoreImprovement: report.baseline.score - report.plan.score,
    });
  }

  const mostAffected = [...baseline.flights]
    .filter((f) => f.status !== 'ON_TIME')
    .sort(
      (a, b) =>
        Number(b.status === 'CANCELLED') - Number(a.status === 'CANCELLED') ||
        b.delayMin - a.delayMin ||
        a.schedDep - b.schedDep ||
        (a.flightId < b.flightId ? -1 : 1),
    )
    .slice(0, 6)
    .map(
      (f): FactFlight => ({
        flightId: f.flightId,
        route: `${f.origin}-${f.destination}`,
        scheduledDeparture: formatClock(f.schedDep),
        status: f.status,
        delayMin: f.delayMin,
        pax: f.pax,
        why: why(f),
      }),
    );

  return {
    scenario: {
      closures: closures.map((c) => ({
        airport: c.airport,
        city: dataset.index.airport.get(c.airport)?.city ?? c.airport,
        start: formatClock(c.start),
        end: formatClock(c.end),
        durationMin: c.end - c.start,
      })),
    },
    network: {
      totalFlights: baseline.kpis.totalFlights,
      totalPassengers: baseline.kpis.totalPassengers,
      aircraft: dataset.aircraft.length,
      airportCodes: dataset.airports.map((a) => a.code),
    },
    baseline: { ...factKpis(baseline.kpis), score: report.baseline.score },
    options,
    mostAffectedFlights: mostAffected,
    scoring: {
      strandedPaxWeight: report.weights.strandedPax,
      delayMinWeight: report.weights.delayMin,
      cancellationWeight: report.weights.cancellation,
    },
  };
}

