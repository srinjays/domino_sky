/**
 * Domain types used by the engine. Times are integer minutes (see time.ts).
 */
import type { Minutes } from './time.js';
import type { Rules } from './schema.js';

export interface Airport {
  code: string;
  name: string;
  city: string;
  lat: number;
  lon: number;
  tier: string;
  capacityPerHour: number;
}

export interface Aircraft {
  id: string;
  seats: number;
  base: string;
}

export interface Flight {
  id: string;
  aircraftId: string;
  legOrder: number;
  origin: string;
  destination: string;
  schedDep: Minutes;
  schedArr: Minutes;
  blockMin: number;
  pax: number;
  /** Per-flight turnaround before this leg (null for the first leg). */
  turnaroundBeforeMin: number | null;
}

export interface Connection {
  id: string;
  airport: string;
  inboundFlightId: string;
  outboundFlightId: string;
  pax: number;
  minConnectMin: number;
}

export interface Crew {
  id: string;
  tailId: string;
  base: string;
  dutyStart: Minutes;
  maxDutyMin: number;
  flightIds: string[];
}

export interface SpareAircraft {
  id: string;
  base: string;
  availableFrom: Minutes;
  seats: number;
}

export interface DatasetIndex {
  airport: ReadonlyMap<string, Airport>;
  aircraft: ReadonlyMap<string, Aircraft>;
  flight: ReadonlyMap<string, Flight>;
  crew: ReadonlyMap<string, Crew>;
  spare: ReadonlyMap<string, SpareAircraft>;
  connection: ReadonlyMap<string, Connection>;
  /** aircraftId -> flight IDs sorted by leg_order. */
  rotation: ReadonlyMap<string, readonly string[]>;
  /** flightId -> crewId operating it. */
  crewOfFlight: ReadonlyMap<string, string>;
}

export interface Dataset {
  meta: {
    name: string;
    operatingDay?: string;
    minTurnaroundMin: number;
    seatsPerAircraft: number;
    notes: string[];
  };
  rules: Rules;
  airports: readonly Airport[];
  aircraft: readonly Aircraft[];
  /** Sorted by (schedDep, id). */
  flights: readonly Flight[];
  connections: readonly Connection[];
  crews: readonly Crew[];
  spareAircraft: readonly SpareAircraft[];
  index: DatasetIndex;
}

// ---------------------------------------------------------------------------
// Simulation inputs
// ---------------------------------------------------------------------------

/** An airport closed to all departures and arrivals during [start, end). */
export interface Closure {
  airport: string;
  start: Minutes;
  end: Minutes;
}

export type RecoveryAction =
  | { type: 'CANCEL'; flightIds: string[] }
  | { type: 'SWAP_SPARE'; spareId: string; aircraftId: string; fromFlightId: string }
  | { type: 'HOLD'; flightId: string; holdUntil: Minutes };

export interface Scenario {
  closures: Closure[];
  actions?: RecoveryAction[];
}

// ---------------------------------------------------------------------------
// Simulation outputs
// ---------------------------------------------------------------------------

export type DelayCause =
  | { kind: 'NONE' }
  | { kind: 'ORIGIN_CLOSURE'; airport: string; closureIndex: number }
  | { kind: 'DEST_CLOSURE'; airport: string; closureIndex: number }
  | { kind: 'LATE_INBOUND_AIRCRAFT'; flightId: string }
  | { kind: 'LATE_CREW'; flightId: string; crewId: string }
  | { kind: 'CONNECTION_HOLD'; holdUntil: Minutes }
  | { kind: 'SPARE_AVAILABILITY'; spareId: string };

export type CancelReason =
  | { kind: 'RECOVERY_CANCEL' }
  | { kind: 'CREW_DUTY_EXCEEDED'; crewId: string; dutyMin: number; maxDutyMin: number }
  | { kind: 'AIRCRAFT_OUT_OF_POSITION'; aircraftId: string; location: string; causeFlightId: string }
  | { kind: 'CREW_OUT_OF_POSITION'; crewId: string; location: string; causeFlightId: string };

export type FlightStatus = 'ON_TIME' | 'DELAYED' | 'CANCELLED';

export interface DepartureConstraints {
  scheduled: Minutes;
  aircraftReady: Minutes | null;
  crewReady: Minutes | null;
  holdUntil: Minutes | null;
  spareAvailable: Minutes | null;
  afterClosures: Minutes | null;
}

export interface CausalLink {
  flightId: string;
  status: FlightStatus;
  delayMin: number;
  reason: string;
}

export interface CausalChain {
  links: CausalLink[];
  root:
    | { kind: 'CLOSURE'; airport: string; start: Minutes; end: Minutes }
    | { kind: 'RECOVERY_ACTION'; description: string }
    | { kind: 'NONE' };
}

export interface FlightOutcome {
  flightId: string;
  aircraftId: string;
  crewId: string;
  origin: string;
  destination: string;
  schedDep: Minutes;
  schedArr: Minutes;
  blockMin: number;
  pax: number;
  status: FlightStatus;
  actualDep: Minutes | null;
  actualArr: Minutes | null;
  delayMin: number;
  cause: DelayCause;
  cancelReason: CancelReason | null;
  constraints: DepartureConstraints | null;
  chain: CausalChain;
}

export type ConnectionStatus = 'MADE' | 'MISSED' | 'CANCELLED_LEG';

export interface ConnectionOutcome {
  connectionId: string;
  inboundFlightId: string;
  outboundFlightId: string;
  airport: string;
  pax: number;
  minConnectMin: number;
  scheduledConnectMin: number;
  actualConnectMin: number | null;
  status: ConnectionStatus;
}

export interface CrewOutcome {
  crewId: string;
  isStandby: boolean;
  flightIds: string[];
  maxDutyMin: number;
  dutyStart: Minutes;
  /** Last actual arrival of operated flights (null if none operated). */
  lastArr: Minutes | null;
  actualDutyMin: number | null;
  dutyExceeded: boolean;
}

export interface Kpis {
  totalFlights: number;
  operatedFlights: number;
  onTimeFlights: number;
  delayedFlights: number;
  cancelledFlights: number;
  totalDelayMin: number;
  maxDelayMin: number;
  knockOnFlights: number;
  aircraftAffected: number;
  totalConnections: number;
  brokenConnections: number;
  totalPassengers: number;
  strandedPax: number;
  strandedLocalPax: number;
  strandedMissedConnectionPax: number;
  strandedCancelledConnectionPax: number;
  delayedPax: number;
  crewDutyBreaches: number;
}

export interface SimulationResult {
  closures: Closure[];
  actions: RecoveryAction[];
  flights: FlightOutcome[];
  connections: ConnectionOutcome[];
  crews: CrewOutcome[];
  kpis: Kpis;
}
