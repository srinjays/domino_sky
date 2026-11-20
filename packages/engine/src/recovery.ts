/**
 * Deterministic recovery optimiser.
 *
 * 1. Generate candidate actions from the current disruption (cancel a flight,
 *    cancel a round-trip pair, swap in a spare aircraft, hold a flight for
 *    connecting passengers).
 * 2. Re-simulate the whole network for each candidate.
 * 3. Score with a transparent weighted objective and rank.
 * 4. Build a multi-step plan greedily (best single action, then the best
 *    action on top of it, ...) while the score keeps improving.
 *
 * The AI dispatcher never invents actions: it can only choose among the
 * candidates produced and scored here.
 */
import { actionId, validateActions } from './scenario.js';
import type { RecoveryWeights } from './schema.js';
import { simulate, simulateKpis } from './simulate.js';
import { formatClock } from './time.js';
import type { Closure, Dataset, Kpis, RecoveryAction, SimulationResult } from './types.js';

export const DEFAULT_WEIGHTS: RecoveryWeights = { strandedPax: 10, delayMin: 1, cancellation: 100 };
/** Longest hold the optimiser will propose to protect a connection. */
export const MAX_CANDIDATE_HOLD_MIN = 60;

export interface KpiDelta {
  strandedPax: number;
  totalDelayMin: number;
  delayedFlights: number;
  cancelledFlights: number;
  brokenConnections: number;
  crewDutyBreaches: number;
  knockOnFlights: number;
}

export interface CandidateEvaluation {
  id: string;
  action: RecoveryAction;
  description: string;
  kpis: Kpis;
  score: number;
  /** after - before, relative to the state the action was applied to. */
  delta: KpiDelta;
  /** before score - after score (positive = better). */
  improvement: number;
}

export interface RecoveryPlan {
  actions: RecoveryAction[];
  steps: CandidateEvaluation[];
  kpis: Kpis;
  score: number;
  delta: KpiDelta;
}

export interface RecoveryReport {
  weights: RecoveryWeights;
  baseline: { kpis: Kpis; score: number };
  evaluatedCount: number;
  improvingCount: number;
  /** Improving single actions, best first (top N). */
  candidates: CandidateEvaluation[];
  /** Greedy multi-action plan (may be empty if nothing improves). */
  plan: RecoveryPlan;
}

/** Objective to minimise. Lower is better. Weights are shown in the UI. */
export function scoreKpis(kpis: Kpis, weights: RecoveryWeights = DEFAULT_WEIGHTS): number {
  return (
    weights.strandedPax * kpis.strandedPax +
    weights.delayMin * kpis.totalDelayMin +
    weights.cancellation * kpis.cancelledFlights
  );
}

export function kpiDelta(before: Kpis, after: Kpis): KpiDelta {
  return {
    strandedPax: after.strandedPax - before.strandedPax,
    totalDelayMin: after.totalDelayMin - before.totalDelayMin,
    delayedFlights: after.delayedFlights - before.delayedFlights,
    cancelledFlights: after.cancelledFlights - before.cancelledFlights,
    brokenConnections: after.brokenConnections - before.brokenConnections,
    crewDutyBreaches: after.crewDutyBreaches - before.crewDutyBreaches,
    knockOnFlights: after.knockOnFlights - before.knockOnFlights,
  };
}

export function describeAction(dataset: Dataset, action: RecoveryAction): string {
  const fl = (id: string) => dataset.index.flight.get(id);
  switch (action.type) {
    case 'CANCEL': {
      const legs = action.flightIds.map((id) => {
        const f = fl(id);
        return f ? `${id} (${f.origin}→${f.destination} ${formatClock(f.schedDep)})` : id;
      });
      return action.flightIds.length === 1
        ? `Cancel ${legs[0]}`
        : `Cancel round trip ${legs.join(' + ')}`;
    }
    case 'SWAP_SPARE': {
      const spare = dataset.index.spare.get(action.spareId);
      const rotation = dataset.index.rotation.get(action.aircraftId) ?? [];
      const legs = rotation.length - rotation.indexOf(action.fromFlightId);
      return `Swap spare ${action.spareId}${spare ? ` (at ${spare.base})` : ''} with a standby crew into ${action.aircraftId}'s rotation from ${action.fromFlightId} onward (${legs} flight${legs === 1 ? '' : 's'})`;
    }
    case 'HOLD': {
      const f = fl(action.flightId);
      return `Hold ${action.flightId}${f ? ` (${f.origin}→${f.destination})` : ''} until ${formatClock(action.holdUntil)} for connecting passengers`;
    }
  }
}

/** Generate candidate actions that could improve the given simulation state. */
export function generateCandidates(
  dataset: Dataset,
  current: SimulationResult,
  existing: readonly RecoveryAction[] = [],
): RecoveryAction[] {
  const cancelledByAction = new Set<string>();
  const usedSpares = new Set<string>();
  const swappedAircraft = new Set<string>();
  const held = new Set<string>();
  for (const a of existing) {
    if (a.type === 'CANCEL') a.flightIds.forEach((id) => cancelledByAction.add(id));
    if (a.type === 'SWAP_SPARE') {
      usedSpares.add(a.spareId);
      swappedAircraft.add(a.aircraftId);
    }
    if (a.type === 'HOLD') held.add(a.flightId);
  }
  const outcome = new Map(current.flights.map((f) => [f.flightId, f]));
  const candidates: RecoveryAction[] = [];

  for (const f of current.flights) {
    if (f.status === 'ON_TIME' || cancelledByAction.has(f.flightId)) continue;
    const scheduled = dataset.index.flight.get(f.flightId)!;
    const rotation = dataset.index.rotation.get(scheduled.aircraftId) ?? [];
    const pos = rotation.indexOf(f.flightId);

    if (f.status !== 'CANCELLED') candidates.push({ type: 'CANCEL', flightIds: [f.flightId] });

    const next = dataset.index.flight.get(rotation[pos + 1] ?? '');
    if (next && next.destination === scheduled.origin && !cancelledByAction.has(next.id)) {
      candidates.push({ type: 'CANCEL', flightIds: [f.flightId, next.id] });
    }
    const prev = dataset.index.flight.get(rotation[pos - 1] ?? '');
    if (prev && prev.origin === scheduled.destination && !cancelledByAction.has(prev.id)) {
      candidates.push({ type: 'CANCEL', flightIds: [prev.id, f.flightId] });
    }

    if (!swappedAircraft.has(scheduled.aircraftId) && f.aircraftId === scheduled.aircraftId) {
      for (const spare of dataset.spareAircraft) {
        if (usedSpares.has(spare.id) || spare.base !== scheduled.origin) continue;
        candidates.push({
          type: 'SWAP_SPARE',
          spareId: spare.id,
          aircraftId: scheduled.aircraftId,
          fromFlightId: f.flightId,
        });
      }
    }
  }

  for (const c of current.connections) {
    if (c.status !== 'MISSED' || held.has(c.outboundFlightId)) continue;
    const inbound = outcome.get(c.inboundFlightId);
    const outbound = dataset.index.flight.get(c.outboundFlightId);
    if (!inbound || inbound.actualArr === null || !outbound) continue;
    const holdUntil = inbound.actualArr + c.minConnectMin;
    if (holdUntil > outbound.schedDep && holdUntil - outbound.schedDep <= MAX_CANDIDATE_HOLD_MIN) {
      candidates.push({ type: 'HOLD', flightId: outbound.id, holdUntil });
    }
  }

  // Deduplicate and keep only actions that are valid together with `existing`.
  const seen = new Set<string>();
  return candidates.filter((a) => {
    const id = actionId(a);
    if (seen.has(id)) return false;
    seen.add(id);
    try {
      validateActions(dataset, [...existing, a]);
      return true;
    } catch {
      return false;
    }
  });
}

function compareEvaluations(a: CandidateEvaluation, b: CandidateEvaluation): number {
  return (
    a.score - b.score ||
    a.kpis.cancelledFlights - b.kpis.cancelledFlights ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Evaluate every candidate on top of `existing` actions; returns all, best first. */
export function evaluateCandidates(
  dataset: Dataset,
  closures: readonly Closure[],
  existing: readonly RecoveryAction[],
  current: SimulationResult,
  weights: RecoveryWeights = DEFAULT_WEIGHTS,
): CandidateEvaluation[] {
  const currentScore = scoreKpis(current.kpis, weights);
  return generateCandidates(dataset, current, existing)
    .map((action): CandidateEvaluation => {
      const kpis = simulateKpis(dataset, { closures: [...closures], actions: [...existing, action] });
      const score = scoreKpis(kpis, weights);
      return {
        id: actionId(action),
        action,
        description: describeAction(dataset, action),
        kpis,
        score,
        delta: kpiDelta(current.kpis, kpis),
        improvement: currentScore - score,
      };
    })
    .sort(compareEvaluations);
}

export interface RecoveryOptions {
  topN?: number;
  maxPlanSteps?: number;
}

export function recommendRecovery(
  dataset: Dataset,
  closures: readonly Closure[],
  weights: RecoveryWeights = DEFAULT_WEIGHTS,
  options: RecoveryOptions = {},
): RecoveryReport {
  return recommendFromBaseline(dataset, simulate(dataset, { closures: [...closures] }), weights, options);
}

export function recommendFromBaseline(
  dataset: Dataset,
  baseline: SimulationResult,
  weights: RecoveryWeights,
  options: RecoveryOptions = {},
): RecoveryReport {
  const closures = baseline.closures;
  const topN = options.topN ?? 5;
  const maxPlanSteps = options.maxPlanSteps ?? 3;
  const baselineScore = scoreKpis(baseline.kpis, weights);

  const firstRound = evaluateCandidates(dataset, closures, [], baseline, weights);
  const improving = firstRound.filter((c) => c.improvement > 0);

  // Greedy plan.
  const planActions: RecoveryAction[] = [];
  const steps: CandidateEvaluation[] = [];
  let current = baseline;
  let round = firstRound;
  for (let step = 0; step < maxPlanSteps; step++) {
    const best = round[0];
    if (!best || best.improvement <= 0) break;
    planActions.push(best.action);
    steps.push(best);
    current = simulate(dataset, { closures: [...closures], actions: [...planActions] });
    if (step + 1 < maxPlanSteps) {
      round = evaluateCandidates(dataset, closures, planActions, current, weights);
    }
  }

  return {
    weights,
    baseline: { kpis: baseline.kpis, score: baselineScore },
    evaluatedCount: firstRound.length,
    improvingCount: improving.length,
    candidates: improving.slice(0, topN),
    plan: {
      actions: planActions,
      steps,
      kpis: current.kpis,
      score: scoreKpis(current.kpis, weights),
      delta: kpiDelta(baseline.kpis, current.kpis),
    },
  };
}

