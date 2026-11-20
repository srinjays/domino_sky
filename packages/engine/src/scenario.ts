/**
 * Scenario construction: HH:MM strings → integer minutes, validation.
 */
import { formatClock, parseHHMM } from './time.js';
import type { ClosureInput, RecoveryActionInput } from './schema.js';
import type { Closure, Dataset, RecoveryAction } from './types.js';

export class ScenarioError extends Error {
  constructor(
    message: string,
    public readonly details: string[] = [],
  ) {
    super(message);
    this.name = 'ScenarioError';
  }
}

export const MAX_CLOSURE_MIN = 18 * 60;
export const MAX_HOLD_MIN = 6 * 60;

export function closureFromInput(input: ClosureInput): Closure {
  return { airport: input.airport, start: parseHHMM(input.start), end: parseHHMM(input.end) };
}

export function actionFromInput(input: RecoveryActionInput): RecoveryAction {
  switch (input.type) {
    case 'CANCEL':
      return { type: 'CANCEL', flightIds: [...input.flightIds] };
    case 'SWAP_SPARE':
      return { type: 'SWAP_SPARE', spareId: input.spareId, aircraftId: input.aircraftId, fromFlightId: input.fromFlightId };
    case 'HOLD':
      return { type: 'HOLD', flightId: input.flightId, holdUntil: parseHHMM(input.holdUntil) };
  }
}

export function normalizeClosures(dataset: Dataset, closures: readonly Closure[]): Closure[] {
  const errors: string[] = [];
  if (closures.length === 0) errors.push('At least one closure is required');
  closures.forEach((c, i) => {
    if (!dataset.index.airport.has(c.airport)) errors.push(`closures[${i}]: unknown airport "${c.airport}"`);
    if (!Number.isInteger(c.start) || !Number.isInteger(c.end)) errors.push(`closures[${i}]: times must be whole minutes`);
    if (c.end <= c.start) errors.push(`closures[${i}]: end must be after start`);
    if (c.end - c.start > MAX_CLOSURE_MIN) errors.push(`closures[${i}]: closure longer than ${MAX_CLOSURE_MIN} minutes`);
  });
  if (errors.length) throw new ScenarioError('Invalid closure', errors);
  return [...closures]
    .map((c) => ({ ...c }))
    .sort((a, b) => a.start - b.start || a.end - b.end || (a.airport < b.airport ? -1 : a.airport > b.airport ? 1 : 0));
}

export function validateActions(dataset: Dataset, actions: readonly RecoveryAction[]): void {
  const errors: string[] = [];
  const usedSpares = new Set<string>();
  const swappedAircraft = new Set<string>();
  const cancelled = new Set<string>();
  const held = new Set<string>();

  actions.forEach((a, i) => {
    const at = `actions[${i}]`;
    switch (a.type) {
      case 'CANCEL': {
        if (a.flightIds.length === 0) errors.push(`${at}: no flights to cancel`);
        for (const fid of a.flightIds) {
          if (!dataset.index.flight.has(fid)) errors.push(`${at}: unknown flight "${fid}"`);
          if (cancelled.has(fid)) errors.push(`${at}: flight ${fid} cancelled twice`);
          cancelled.add(fid);
        }
        break;
      }
      case 'SWAP_SPARE': {
        const spare = dataset.index.spare.get(a.spareId);
        const rotation = dataset.index.rotation.get(a.aircraftId);
        const from = dataset.index.flight.get(a.fromFlightId);
        if (!spare) errors.push(`${at}: unknown spare aircraft "${a.spareId}"`);
        if (!rotation) errors.push(`${at}: unknown aircraft "${a.aircraftId}"`);
        if (!from) errors.push(`${at}: unknown flight "${a.fromFlightId}"`);
        if (spare && from && rotation) {
          if (!rotation.includes(from.id)) errors.push(`${at}: flight ${from.id} not operated by ${a.aircraftId}`);
          if (from.origin !== spare.base) errors.push(`${at}: spare ${spare.id} at ${spare.base}, flight departs ${from.origin}`);
        }
        if (usedSpares.has(a.spareId)) errors.push(`${at}: spare ${a.spareId} used twice`);
        if (swappedAircraft.has(a.aircraftId)) errors.push(`${at}: aircraft ${a.aircraftId} swapped twice`);
        usedSpares.add(a.spareId);
        swappedAircraft.add(a.aircraftId);
        break;
      }
      case 'HOLD': {
        const f = dataset.index.flight.get(a.flightId);
        if (!f) { errors.push(`${at}: unknown flight "${a.flightId}"`); break; }
        if (!Number.isInteger(a.holdUntil)) errors.push(`${at}: holdUntil must be whole minutes`);
        if (a.holdUntil <= f.schedDep) errors.push(`${at}: hold must be later than scheduled departure`);
        if (a.holdUntil - f.schedDep > MAX_HOLD_MIN) errors.push(`${at}: hold longer than ${MAX_HOLD_MIN} minutes`);
        if (held.has(a.flightId)) errors.push(`${at}: flight ${a.flightId} held twice`);
        held.add(a.flightId);
        break;
      }
    }
  });
  if (errors.length) throw new ScenarioError('Invalid recovery action', [...new Set(errors)]);
}

export function actionId(action: RecoveryAction): string {
  switch (action.type) {
    case 'CANCEL':
      return `CANCEL:${action.flightIds.join('+')}`;
    case 'SWAP_SPARE':
      return `SWAP:${action.spareId}:${action.aircraftId}:${action.fromFlightId}`;
    case 'HOLD':
      return `HOLD:${action.flightId}@${formatClock(action.holdUntil)}`;
  }
}
