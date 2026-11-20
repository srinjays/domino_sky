/**
 * Zod schemas matching the official organiser dataset (flight_network.json).
 *
 * Field names use the organiser's naming verbatim so the loader is a thin
 * mapping layer rather than a guessing game.
 */
import { z } from 'zod';
import { isHHMM } from './time.js';

// ---- Primitives -----------------------------------------------------------
const id = z.string().trim().min(1).max(32);
export const AirportCodeSchema = z.string().trim().regex(/^[A-Z]{3}$/, 'Airport code must be 3 uppercase letters');
export const HHMMSchema = z.string().trim().refine(isHHMM, 'Time must be HH:MM (00:00-47:59)');
const nonNegInt = z.number().int().nonnegative();
const positiveInt = z.number().int().positive();

// ---- Official dataset shapes -----------------------------------------------

export const OfficialAirportSchema = z.object({
  id: AirportCodeSchema,
  name: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(80),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  tier: z.string().trim().default('spoke'),
  capacity_per_hour: positiveInt.max(200).default(10),
});

export const OfficialFlightSchema = z.object({
  flight_id: id,
  tail_id: id,
  leg_order: positiveInt,
  origin: AirportCodeSchema,
  destination: AirportCodeSchema,
  dep: HHMMSchema,
  arr: HHMMSchema,
  block_minutes: positiveInt.max(600),
  pax: nonNegInt.max(1000),
  turnaround_before_min: z.number().int().nonnegative().nullable(),
});

export const OfficialConnectionSchema = z.object({
  connection_id: id,
  airport: AirportCodeSchema,
  from_flight: id,
  to_flight: id,
  passengers: positiveInt.max(1000),
  min_connect_minutes: nonNegInt.max(600),
});

export const OfficialCrewSchema = z.object({
  crew_id: id,
  tail_id: id,
  base: AirportCodeSchema,
  duty_start: HHMMSchema,
  max_duty_mins: positiveInt.max(1440),
  flight_ids: z.array(id).min(1).max(20),
});

export const OfficialSpareSchema = z.object({
  tail_id: id,
  base: AirportCodeSchema,
  available_from: HHMMSchema,
  seats: positiveInt.max(1000),
});

export const OfficialDatasetSchema = z.object({
  meta: z.object({
    dataset: z.string().max(400).default('Domino Sky flight network'),
    operating_day: z.string().max(400).optional(),
    min_turnaround_minutes: nonNegInt.max(240).default(30),
    seats_per_aircraft: positiveInt.max(1000).default(180),
    notes: z.array(z.string()).default([]),
  }),
  airports: z.array(OfficialAirportSchema).min(1).max(500),
  flights: z.array(OfficialFlightSchema).min(1).max(5000),
  connections: z.array(OfficialConnectionSchema).max(5000).default([]),
  crews: z.array(OfficialCrewSchema).max(2000).default([]),
  spare_aircraft: z.array(OfficialSpareSchema).max(100).default([]),
});

export type OfficialDataset = z.input<typeof OfficialDatasetSchema>;
export type ParsedOfficialDataset = z.output<typeof OfficialDatasetSchema>;

// ---- Engine rules (derived from the official meta) -------------------------

export interface Rules {
  /** Global minimum turnaround unless overridden per-flight. */
  minTurnaroundMin: number;
  /** All aircraft have this many seats (uniform fleet). */
  seatsPerAircraft: number;
  /** Delay at or above which a flight is classed as "delayed". */
  delayThresholdMin: number;
  /** Maximum duty for standby crews that come with spare aircraft. */
  standbyCrewMaxDutyMin: number;
}

// ---- API / simulation input schemas ----------------------------------------

export const ClosureInputSchema = z
  .object({
    airport: AirportCodeSchema,
    start: HHMMSchema,
    end: HHMMSchema,
  })
  .strict();

export const RecoveryActionInputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CANCEL'),
    flightIds: z.array(id).min(1).max(10),
  }).strict(),
  z.object({
    type: z.literal('SWAP_SPARE'),
    spareId: id,
    aircraftId: id,
    fromFlightId: id,
  }).strict(),
  z.object({
    type: z.literal('HOLD'),
    flightId: id,
    holdUntil: HHMMSchema,
  }).strict(),
]);

export const WeightsSchema = z
  .object({
    strandedPax: z.number().min(0).max(1000).default(10),
    delayMin: z.number().min(0).max(1000).default(1),
    cancellation: z.number().min(0).max(100000).default(100),
  })
  .strict();

export const SimulateRequestSchema = z
  .object({
    closures: z.array(ClosureInputSchema).min(1).max(4),
    actions: z.array(RecoveryActionInputSchema).max(8).default([]),
  })
  .strict();

export const RecoverRequestSchema = z
  .object({
    closures: z.array(ClosureInputSchema).min(1).max(4),
    weights: WeightsSchema.default({}),
  })
  .strict();

export type ClosureInput = z.infer<typeof ClosureInputSchema>;
export type RecoveryActionInput = z.infer<typeof RecoveryActionInputSchema>;
export type SimulateRequest = z.infer<typeof SimulateRequestSchema>;
export type RecoverRequest = z.infer<typeof RecoverRequestSchema>;
export type RecoveryWeights = z.output<typeof WeightsSchema>;
