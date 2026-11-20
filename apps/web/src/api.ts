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

import type { RecoveryReport, SimulationResult } from '@domino/engine';
export type {
  CausalChain, CausalLink, ConnectionOutcome, CrewOutcome, FlightOutcome,
  Kpis as SimulationKpis, CandidateEvaluation as RecoveryCandidate, RecoveryReport, SimulationResult,
} from '@domino/engine';
export interface AiRecommendation {
  provider?: 'gemini' | 'groq' | null;
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

