/**
 * Causal chains: for every flight, follow the binding constraint backwards
 * (late inbound aircraft -> late crew -> cancelled predecessor ...) until the
 * root cause (an airport closure or a recovery decision) is reached. This is
 * what lets the UI answer "why is this flight late?" for any flight.
 */
import { formatClock } from './time.js';
import type { CausalChain, CausalLink, Closure, Dataset, FlightOutcome } from './types.js';

type OutcomeNoChain = Omit<FlightOutcome, 'chain'>;

export function buildCausalChains(
  _dataset: Dataset,
  outcomes: ReadonlyMap<string, OutcomeNoChain>,
  closures: readonly Closure[],
): Map<string, CausalChain> {
  const chains = new Map<string, CausalChain>();
  for (const id of outcomes.keys()) chains.set(id, chainFor(id, outcomes, closures));
  return chains;
}

function closureRoot(closures: readonly Closure[], index: number): CausalChain['root'] {
  const c = closures[index];
  return c ? { kind: 'CLOSURE', airport: c.airport, start: c.start, end: c.end } : { kind: 'NONE' };
}

function chainFor(
  flightId: string,
  outcomes: ReadonlyMap<string, OutcomeNoChain>,
  closures: readonly Closure[],
): CausalChain {
  const links: CausalLink[] = [];
  const visited = new Set<string>();
  let current: string | null = flightId;

  while (current !== null && !visited.has(current)) {
    visited.add(current);
    const o = outcomes.get(current);
    if (!o) break;
    const link = (reason: string): void => {
      links.push({ flightId: o.flightId, status: o.status, delayMin: o.delayMin, reason });
    };

    if (o.status === 'CANCELLED' && o.cancelReason) {
      const r = o.cancelReason;
      switch (r.kind) {
        case 'RECOVERY_CANCEL':
          link('Cancelled by the recovery plan');
          return { links, root: { kind: 'RECOVERY_ACTION', description: `Cancellation of ${o.flightId}` } };
        case 'AIRCRAFT_OUT_OF_POSITION':
          link(`Cancelled: aircraft ${r.aircraftId} is stuck at ${r.location} after ${r.causeFlightId} was cancelled`);
          current = r.causeFlightId || null;
          continue;
        case 'CREW_OUT_OF_POSITION':
          link(`Cancelled: crew ${r.crewId} is stuck at ${r.location} after ${r.causeFlightId} was cancelled`);
          current = r.causeFlightId || null;
          continue;
        case 'CREW_DUTY_EXCEEDED':
          link(
            `Cancelled: crew ${r.crewId} would work ${r.dutyMin} min, over the ${r.maxDutyMin} min duty limit`,
          );
          // Fall through to the delay cause that pushed the crew over the limit.
          break;
      }
    }

    const c = o.cause;
    const isCancelled = o.status === 'CANCELLED';
    switch (c.kind) {
      case 'NONE':
        if (!isCancelled) link(o.delayMin > 0 ? 'Minor delay' : 'On time');
        return { links, root: { kind: 'NONE' } };
      case 'ORIGIN_CLOSURE': {
        const cl = closures[c.closureIndex];
        if (!isCancelled) {
          link(`Held at ${c.airport}: airport closed${cl ? ` until ${formatClock(cl.end)}` : ''}`);
        }
        return { links, root: closureRoot(closures, c.closureIndex) };
      }
      case 'DEST_CLOSURE': {
        const cl = closures[c.closureIndex];
        if (!isCancelled) {
          link(`Held at origin: destination ${c.airport} closed${cl ? ` until ${formatClock(cl.end)}` : ''}`);
        }
        return { links, root: closureRoot(closures, c.closureIndex) };
      }
      case 'LATE_INBOUND_AIRCRAFT':
        if (!isCancelled) link(`Waiting for its aircraft, arriving late on ${c.flightId}`);
        current = c.flightId || null;
        continue;
      case 'LATE_CREW':
        if (!isCancelled) link(`Waiting for crew ${c.crewId}, arriving late on ${c.flightId}`);
        current = c.flightId || null;
        continue;
      case 'CONNECTION_HOLD':
        if (!isCancelled) link(`Held until ${formatClock(c.holdUntil)} for connecting passengers`);
        return { links, root: { kind: 'RECOVERY_ACTION', description: `Hold of ${o.flightId}` } };
      case 'SPARE_AVAILABILITY':
        if (!isCancelled) link(`Waiting for spare aircraft ${c.spareId} to become available`);
        return { links, root: { kind: 'RECOVERY_ACTION', description: `Spare ${c.spareId} swap` } };
    }
  }
  return { links, root: { kind: 'NONE' } };
}

