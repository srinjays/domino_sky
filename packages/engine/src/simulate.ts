/**
 * The deterministic cascade simulator.
 *
 * Official rules (from the organiser's dataset notes):
 * 1. Each aircraft flies its flights in leg_order. A flight cannot depart
 *    before the previous flight has arrived and the minimum turnaround
 *    (meta.min_turnaround_minutes) has passed.
 * 2. Crew duty runs from duty_start until the arrival of the crew's last
 *    flight and must not exceed max_duty_mins. If a delay would make a leg
 *    arrive after duty_start + max_duty_mins, that leg is cancelled (the crew
 *    cannot legally operate it) and the aircraft stays where it is.
 * 3. A connection is made if the to_flight departs at least
 *    min_connect_minutes after the from_flight arrives.
 *
 * Airport closures are half-open windows [start, end): no departures from
 * and no arrivals at the airport. Departures wait at the origin until the
 * window ends; flights that would land inside the window are held at their
 * origin so they land exactly when it reopens.
 *
 * Flights are processed once, in (scheduled departure, flight ID) order.
 */
import { buildCausalChains } from './causal.js';
import { computeKpis } from './kpis.js';
import { evaluateConnections } from './passengers.js';
import { normalizeClosures, validateActions } from './scenario.js';
import type { Minutes } from './time.js';
import type {
  CancelReason,
  Closure,
  CrewOutcome,
  Dataset,
  DelayCause,
  DepartureConstraints,
  Flight,
  FlightOutcome,
  Kpis,
  RecoveryAction,
  Scenario,
  SimulationResult,
} from './types.js';

export const NO_CREW = 'NO-CREW';

export function standbyCrewId(spareId: string): string {
  return `STBY-${spareId}`;
}

interface AircraftState {
  location: string;
  readyAt: Minutes | null;
  readyKind: 'TURNAROUND' | 'SPARE';
  prevFlightId: string | null;
  lastCancelledFlightId: string | null;
}

interface CrewState {
  id: string;
  isStandby: boolean;
  maxDutyMin: number;
  dutyStart: Minutes;
  location: string | null;
  readyAt: Minutes | null;
  prevFlightId: string | null;
  lastCancelledFlightId: string | null;
  lastArr: Minutes | null;
  exceeded: boolean;
  flightIds: string[];
}

export interface ClosureAdjustment {
  dep: Minutes;
  cause: DelayCause | null;
}

/**
 * Apply airport closures. Closures are half-open intervals [start, end).
 * Origin closure → push departure to closure end.
 * Dest closure → ground hold so arrival = closure end.
 * Iterates to a fixed point.
 */
export function applyClosures(
  dep: Minutes,
  blockMin: number,
  origin: string,
  destination: string,
  closures: readonly Closure[],
): ClosureAdjustment {
  let current = dep;
  let cause: DelayCause | null = null;
  for (let iteration = 0; iteration <= closures.length * 2; iteration++) {
    let changed = false;
    closures.forEach((c, closureIndex) => {
      if (c.airport === origin && current >= c.start && current < c.end) {
        current = c.end;
        cause = { kind: 'ORIGIN_CLOSURE', airport: c.airport, closureIndex };
        changed = true;
      }
      const arr = current + blockMin;
      if (c.airport === destination && arr >= c.start && arr < c.end) {
        current = c.end - blockMin;
        cause = { kind: 'DEST_CLOSURE', airport: c.airport, closureIndex };
        changed = true;
      }
    });
    if (!changed) break;
  }
  return { dep: current, cause };
}

/** Run the simulation. Pure: same inputs always produce the same output. */
export function simulate(dataset: Dataset, scenario: Scenario): SimulationResult {
  return runSimulation(dataset, scenario, true);
}

export function simulateKpis(dataset: Dataset, scenario: Scenario): Kpis {
  return runSimulation(dataset, scenario, false);
}

function runSimulation(dataset: Dataset, scenario: Scenario, detailed: true): SimulationResult;
function runSimulation(dataset: Dataset, scenario: Scenario, detailed: false): Kpis;
function runSimulation(dataset: Dataset, scenario: Scenario, detailed: boolean): SimulationResult | Kpis {
  const closures = normalizeClosures(dataset, scenario.closures);
  const actions: RecoveryAction[] = (scenario.actions ?? []).map((a) =>
    a.type === 'CANCEL' ? { ...a, flightIds: [...a.flightIds] } : { ...a },
  );
  validateActions(dataset, actions);

  const { rules } = dataset;
  const crewsEnabled = dataset.crews.length > 0;

  // ---- Apply recovery actions -----------------------------------------------
  const cancelledByAction = new Set<string>();
  const holdUntil = new Map<string, Minutes>();
  const opAircraft = new Map<string, string>();
  const opCrew = new Map<string, string>();
  for (const f of dataset.flights) {
    opAircraft.set(f.id, f.aircraftId);
    opCrew.set(f.id, crewsEnabled ? (dataset.index.crewOfFlight.get(f.id) ?? NO_CREW) : NO_CREW);
  }
  const swaps = actions.filter((a) => a.type === 'SWAP_SPARE');
  for (const a of actions) {
    if (a.type === 'CANCEL') a.flightIds.forEach((id) => cancelledByAction.add(id));
    if (a.type === 'HOLD') holdUntil.set(a.flightId, a.holdUntil);
  }
  for (const s of swaps) {
    const rotation = dataset.index.rotation.get(s.aircraftId)!;
    for (const fid of rotation.slice(rotation.indexOf(s.fromFlightId))) {
      opAircraft.set(fid, s.spareId);
      opCrew.set(fid, crewsEnabled ? standbyCrewId(s.spareId) : NO_CREW);
    }
  }

  // ---- Initial aircraft states -----------------------------------------------
  const aircraftStates = new Map<string, AircraftState>();
  for (const [acId, rotIds] of dataset.index.rotation) {
    const first = dataset.index.flight.get(rotIds[0] ?? '');
    if (!first) continue;
    aircraftStates.set(acId, {
      location: first.origin,
      readyAt: null,
      readyKind: 'TURNAROUND',
      prevFlightId: null,
      lastCancelledFlightId: null,
    });
  }
  for (const s of swaps) {
    const spare = dataset.index.spare.get(s.spareId)!;
    aircraftStates.set(spare.id, {
      location: spare.base,
      readyAt: spare.availableFrom,
      readyKind: 'SPARE',
      prevFlightId: null,
      lastCancelledFlightId: null,
    });
  }

  // ---- Initial crew states ---------------------------------------------------
  const crewStates = new Map<string, CrewState>();
  if (crewsEnabled) {
    // Build pairings after swaps
    const pairing = new Map<string, string[]>();
    for (const f of dataset.flights) {
      const crewId = opCrew.get(f.id)!;
      if (!pairing.has(crewId)) pairing.set(crewId, []);
      pairing.get(crewId)!.push(f.id);
    }
    for (const c of dataset.crews) if (!pairing.has(c.id)) pairing.set(c.id, []);
    for (const [crewId, flightIds] of pairing) {
      const crew = dataset.index.crew.get(crewId);
      const first = dataset.index.flight.get(flightIds[0] ?? '');
      crewStates.set(crewId, {
        id: crewId,
        isStandby: !crew,
        maxDutyMin: crew ? crew.maxDutyMin : rules.standbyCrewMaxDutyMin,
        // Official duty_start for rostered crews; standby crews start when their first flight departs
        dutyStart: crew ? crew.dutyStart : (first ? first.schedDep - 45 : 0),
        location: first ? first.origin : null,
        readyAt: null,
        prevFlightId: null,
        lastCancelledFlightId: null,
        lastArr: null,
        exceeded: false,
        flightIds,
      });
    }
  }

  // ---- Propagate -------------------------------------------------------------
  const outcomes = new Map<string, Omit<FlightOutcome, 'chain'>>();
  const ordered = dataset.flights;

  for (const f of ordered) {
    const acId = opAircraft.get(f.id)!;
    const crewId = opCrew.get(f.id)!;
    const ac = aircraftStates.get(acId)!;
    const crew = crewsEnabled ? crewStates.get(crewId) ?? null : null;
    const base = baseOutcome(f, acId, crewId);

    const cancel = (reason: CancelReason, cause: DelayCause, constraints: DepartureConstraints | null) => {
      outcomes.set(f.id, { ...base, status: 'CANCELLED', cancelReason: reason, cause, constraints });
      ac.lastCancelledFlightId = f.id;
      if (crew) crew.lastCancelledFlightId = f.id;
    };

    // Explicit cancellation
    if (cancelledByAction.has(f.id)) {
      cancel({ kind: 'RECOVERY_CANCEL' }, { kind: 'NONE' }, null);
      continue;
    }
    // Aircraft out of position
    if (ac.location !== f.origin) {
      cancel(
        { kind: 'AIRCRAFT_OUT_OF_POSITION', aircraftId: acId, location: ac.location, causeFlightId: ac.lastCancelledFlightId ?? '' },
        { kind: 'NONE' },
        null,
      );
      continue;
    }
    // Crew out of position
    if (crew && crew.location !== null && crew.location !== f.origin) {
      cancel(
        { kind: 'CREW_OUT_OF_POSITION', crewId, location: crew.location, causeFlightId: crew.lastCancelledFlightId ?? '' },
        { kind: 'NONE' },
        null,
      );
      continue;
    }

    // Compute earliest departure
    const blockMin = f.blockMin;
    const constraints: DepartureConstraints = {
      scheduled: f.schedDep,
      aircraftReady: ac.readyKind === 'TURNAROUND' ? ac.readyAt : null,
      spareAvailable: ac.readyKind === 'SPARE' ? ac.readyAt : null,
      crewReady: crew?.readyAt ?? null,
      holdUntil: holdUntil.get(f.id) ?? null,
      afterClosures: null,
    };

    let dep = f.schedDep;
    let cause: DelayCause = { kind: 'NONE' };

    if (constraints.aircraftReady !== null && constraints.aircraftReady > dep) {
      dep = constraints.aircraftReady;
      cause = { kind: 'LATE_INBOUND_AIRCRAFT', flightId: ac.prevFlightId ?? '' };
    }
    if (constraints.spareAvailable !== null && constraints.spareAvailable > dep) {
      dep = constraints.spareAvailable;
      cause = { kind: 'SPARE_AVAILABILITY', spareId: acId };
    }
    if (crew && constraints.crewReady !== null && constraints.crewReady > dep) {
      dep = constraints.crewReady;
      cause = { kind: 'LATE_CREW', flightId: crew.prevFlightId ?? '', crewId };
    }
    if (constraints.holdUntil !== null && constraints.holdUntil > dep) {
      dep = constraints.holdUntil;
      cause = { kind: 'CONNECTION_HOLD', holdUntil: constraints.holdUntil };
    }

    // Apply closures
    const adjusted = applyClosures(dep, blockMin, f.origin, f.destination, closures);
    if (adjusted.dep > dep) {
      dep = adjusted.dep;
      cause = adjusted.cause ?? cause;
      constraints.afterClosures = adjusted.dep;
    }

    const arr = dep + blockMin;

    // Crew duty check: duty = lastArr - dutyStart, must not exceed maxDutyMin
    if (crew) {
      const dutyMin = arr - crew.dutyStart;
      if (dutyMin > crew.maxDutyMin) {
        crew.exceeded = true;
        cancel(
          { kind: 'CREW_DUTY_EXCEEDED', crewId, dutyMin, maxDutyMin: crew.maxDutyMin },
          cause,
          constraints,
        );
        continue;
      }
      crew.location = f.destination;
      crew.readyAt = arr; // crew is ready when the flight lands
      crew.prevFlightId = f.id;
      crew.lastArr = arr;
    }

    // Rule 1: the next leg of this aircraft may depart once the *minimum*
    // turnaround (meta.min_turnaround_minutes) has passed. The per-flight
    // turnaround_before_min field equals the *scheduled* ground time (verified
    // for all 54 non-first legs by scripts/audit-dataset.ts), so any scheduled
    // ground time above the minimum is slack that absorbs inbound delay.
    ac.location = f.destination;
    ac.readyAt = arr + rules.minTurnaroundMin;
    ac.readyKind = 'TURNAROUND';
    ac.prevFlightId = f.id;

    const delayMin = dep - f.schedDep;
    outcomes.set(f.id, {
      ...base,
      status: delayMin >= rules.delayThresholdMin ? 'DELAYED' : 'ON_TIME',
      actualDep: dep,
      actualArr: arr,
      delayMin,
      cause,
      constraints,
    });
  }

  // ---- Assemble results -------------------------------------------------------
  const connections = evaluateConnections(dataset, outcomes);
  const crews = crewOutcomes(crewStates);
  const kpis = computeKpis(dataset, [...outcomes.values()], connections, crews, closures);
  if (!detailed) return kpis;
  const chains = buildCausalChains(dataset, outcomes, closures);
  const flights: FlightOutcome[] = ordered.map((f) => ({
    ...outcomes.get(f.id)!,
    chain: chains.get(f.id)!,
  }));
  return { closures, actions, flights, connections, crews, kpis };
}

function baseOutcome(f: Flight, aircraftId: string, crewId: string): Omit<FlightOutcome, 'chain'> {
  return {
    flightId: f.id,
    aircraftId,
    crewId,
    origin: f.origin,
    destination: f.destination,
    schedDep: f.schedDep,
    schedArr: f.schedArr,
    blockMin: f.blockMin,
    pax: f.pax,
    status: 'ON_TIME',
    actualDep: null,
    actualArr: null,
    delayMin: 0,
    cause: { kind: 'NONE' },
    cancelReason: null,
    constraints: null,
  };
}

function crewOutcomes(states: Map<string, CrewState>): CrewOutcome[] {
  const result: CrewOutcome[] = [];
  for (const s of states.values()) {
    if (s.flightIds.length === 0 && s.isStandby) continue;
    const actualDutyMin = s.lastArr !== null ? s.lastArr - s.dutyStart : null;
    result.push({
      crewId: s.id,
      isStandby: s.isStandby,
      flightIds: [...s.flightIds],
      maxDutyMin: s.maxDutyMin,
      dutyStart: s.dutyStart,
      lastArr: s.lastArr,
      actualDutyMin,
      dutyExceeded: s.exceeded,
    });
  }
  return result.sort((a, b) => (a.crewId < b.crewId ? -1 : a.crewId > b.crewId ? 1 : 0));
}
