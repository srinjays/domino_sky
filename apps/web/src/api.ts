/**
 * API client for Domino Sky server.
 */

const BASE = '/api/v1';

export interface NetworkData {
  meta: { name: string; operatingDay?: string; minTurnaroundMin: number; seatsPerAircraft: number; notes: string[] };
  rules: { minTurnaroundMin: number; seatsPerAircraft: number; delayThresholdMin: number; standbyCrewMaxDutyMin: number };
  airports: { code: string; name: string; city: string; lat: number; lon: number; tier: string; capacityPerHour: number }[];
  aircraft: { id: string; seats: number; base: string }[];
  flights: { id: string; aircraftId: string; origin: string; destination: string; schedDep: number; schedArr: number; pax: number }[];
  connections: { id: string; airport: string; inboundFlightId: string; outboundFlightId: string; pax: number; minConnectMin: number }[];
  crews: { id: string; base: string; maxDutyMin: number; flightIds: string[] }[];
  spareAircraft: { id: string; base: string; availableFrom: number; seats: number }[];
  rotations: Record<string, string[]>;
}

export interface SimulationKpis {
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

export interface CausalLink {
  flightId: string;
  status: string;
  delayMin: number;
  reason: string;
}

export interface CausalChain {
  links: CausalLink[];
  root: { kind: 'CLOSURE'; airport: string; start: number; end: number }
    | { kind: 'RECOVERY_ACTION'; description: string }
    | { kind: 'NONE' };
}

export interface FlightOutcome {
  flightId: string;
  aircraftId: string;
  crewId: string;
  origin: string;
  destination: string;
  schedDep: number;
  schedArr: number;
  blockMin: number;
  pax: number;
  status: 'ON_TIME' | 'DELAYED' | 'CANCELLED';
  actualDep: number | null;
  actualArr: number | null;
  delayMin: number;
  cause: { kind: string; [key: string]: unknown };
  cancelReason: { kind: string; [key: string]: unknown } | null;
  constraints: Record<string, number | null> | null;
  chain: CausalChain;
}

export interface ConnectionOutcome {
  connectionId: string;
  inboundFlightId: string;
  outboundFlightId: string;
  airport: string;
  pax: number;
  minConnectMin: number;
  scheduledConnectMin: number;
  actualConnectMin: number | null;
  status: 'MADE' | 'MISSED' | 'CANCELLED_LEG';
}

export interface CrewOutcome {
  crewId: string;
  isStandby: boolean;
  flightIds: string[];
  maxDutyMin: number;
  dutyStart: number;
  lastArr: number | null;
  actualDutyMin: number | null;
  dutyExceeded: boolean;
}

export interface SimulationResult {
  closures: { airport: string; start: number; end: number }[];
  actions: unknown[];
  flights: FlightOutcome[];
  connections: ConnectionOutcome[];
  crews: CrewOutcome[];
  kpis: SimulationKpis;
}

export interface RecoveryCandidate {
  id: string;
  action: unknown;
  description: string;
  kpis: SimulationKpis;
  score: number;
  delta: Record<string, number>;
  improvement: number;
}

export interface RecoveryReport {
  weights: { strandedPax: number; delayMin: number; cancellation: number };
  baseline: { kpis: SimulationKpis; score: number };
  evaluatedCount: number;
  improvingCount: number;
  candidates: RecoveryCandidate[];
  plan: {
    actions: unknown[];
    steps: RecoveryCandidate[];
    kpis: SimulationKpis;
    score: number;
    delta: Record<string, number>;
  };
}

export interface AiRecommendation {
  recommendedOptionId: string | null;
  rationale: string;
  tradeoffs: string[];
  isAiFallback: boolean;
  /** Why the AI answer was not used (null when it was used or AI is disabled). */
  fallbackReason: string | null;
  verification: { passed: boolean; errors: string[]; checkedCount: number };
  model: string | null;
}

export interface ExplainResult {
  recommendation: AiRecommendation;
  factSheet: unknown;
  report: RecoveryReport;
  /** The recommended option re-simulated in full, for the before/after view. */
  recommended: { optionId: string; score?: number; description: string; actions: unknown[]; result: SimulationResult } | null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `API error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchNetwork(): Promise<NetworkData> {
  return apiFetch<NetworkData>(`${BASE}/network`);
}

export async function runSimulation(closures: { airport: string; start: string; end: string }[], signal?: AbortSignal): Promise<SimulationResult> {
  return apiFetch<SimulationResult>(`${BASE}/simulate`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ closures }),
  });
}

export async function runRecovery(closures: { airport: string; start: string; end: string }[], signal?: AbortSignal): Promise<ExplainResult> {
  return apiFetch<ExplainResult>(`${BASE}/recover/explain`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ closures }),
  });
}

