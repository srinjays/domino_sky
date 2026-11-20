/**
 * @domino/engine - public API.
 */
export { ZodError } from 'zod';
export * from './time.js';
export * from './types.js';
export * from './schema.js';
export { loadDataset, DatasetError, compareFlights, localPax, uniquePassengerCount } from './dataset.js';
export type { IntegrityIssue } from './dataset.js';
export {
  ScenarioError,
  closureFromInput,
  actionFromInput,
  normalizeClosures,
  validateActions,
  actionId,
  MAX_CLOSURE_MIN,
  MAX_HOLD_MIN,
} from './scenario.js';
export { simulate, applyClosures, standbyCrewId, NO_CREW } from './simulate.js';
export type { ClosureAdjustment } from './simulate.js';
export { evaluateConnections, strandedPassengers } from './passengers.js';
export type { StrandedBreakdown } from './passengers.js';
export { computeKpis } from './kpis.js';
export {
  DEFAULT_WEIGHTS,
  MAX_CANDIDATE_HOLD_MIN,
  scoreKpis,
  kpiDelta,
  describeAction,
  generateCandidates,
  evaluateCandidates,
  recommendRecovery,
  recommendFromBaseline,
} from './recovery.js';
export type {
  CandidateEvaluation,
  KpiDelta,
  RecoveryPlan,
  RecoveryReport,
  RecoveryOptions,
} from './recovery.js';
