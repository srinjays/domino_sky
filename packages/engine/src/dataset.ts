/**
 * Dataset loading: validates the official organiser JSON (flight_network.json),
 * normalises to integer minutes, builds indices, and runs integrity checks.
 */
import { OfficialDatasetSchema, type ParsedOfficialDataset, type Rules } from './schema.js';
import { parseHHMM, formatClock } from './time.js';
import type {
  Aircraft,
  Airport,
  Connection,
  Crew,
  Dataset,
  DatasetIndex,
  Flight,
  SpareAircraft,
} from './types.js';

export interface IntegrityIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export class DatasetError extends Error {
  constructor(
    message: string,
    public readonly issues: IntegrityIssue[],
  ) {
    super(message);
    this.name = 'DatasetError';
  }
}

/** Deterministic flight ordering: scheduled departure, then ID. */
export function compareFlights(a: Flight, b: Flight): number {
  return a.schedDep - b.schedDep || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function uniqueMap<T>(
  items: readonly T[],
  key: (t: T) => string,
  kind: string,
  issues: IntegrityIssue[],
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const k = key(item);
    if (map.has(k)) {
      issues.push({ severity: 'error', code: 'DUPLICATE_ID', message: `Duplicate ${kind} "${k}"` });
    } else {
      map.set(k, item);
    }
  }
  return map;
}

/**
 * Validate and normalise the official organiser dataset. Throws a
 * {@link DatasetError} on schema or integrity errors.
 */
export function loadDataset(raw: unknown): { dataset: Dataset; warnings: IntegrityIssue[] } {
  const parsed = OfficialDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    const issues: IntegrityIssue[] = parsed.error.issues.map((i) => ({
      severity: 'error',
      code: 'SCHEMA',
      message: `${i.path.join('.') || '(root)'}: ${i.message}`,
    }));
    throw new DatasetError('Dataset does not match the schema', issues);
  }
  const { dataset, issues } = buildDataset(parsed.data);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new DatasetError(`Dataset has ${errors.length} integrity error(s)`, issues);
  }
  return { dataset, warnings: issues.filter((i) => i.severity === 'warning') };
}

function buildDataset(raw: ParsedOfficialDataset): { dataset: Dataset; issues: IntegrityIssue[] } {
  const issues: IntegrityIssue[] = [];
  const globalTurn = raw.meta.min_turnaround_minutes;
  const globalSeats = raw.meta.seats_per_aircraft;

  const rules: Rules = {
    minTurnaroundMin: globalTurn,
    seatsPerAircraft: globalSeats,
    // The organiser defines no on-time tolerance, so any positive delay is "late".
    delayThresholdMin: 1,
    // Standby crews that fly with a spare get the same legal limit as rostered crews.
    standbyCrewMaxDutyMin: raw.crews.reduce((m, c) => Math.max(m, c.max_duty_mins), 0) || 600,
  };

  // --- Airports -----------------------------------------------------------
  const airports: Airport[] = raw.airports.map((a) => ({
    code: a.id,
    name: a.name,
    city: a.city,
    lat: a.lat,
    lon: a.lng,
    tier: a.tier,
    capacityPerHour: a.capacity_per_hour,
  }));
  const airportMap = uniqueMap(airports, (a) => a.code, 'airport', issues);

  // --- Aircraft (derived from distinct tail_id values) ---------------------
  const tailBases = new Map<string, string>();
  for (const f of raw.flights) {
    if (!tailBases.has(f.tail_id)) {
      tailBases.set(f.tail_id, f.origin); // first leg's origin = base
    }
  }
  const aircraft: Aircraft[] = [...tailBases.entries()].map(([tailId, base]) => ({
    id: tailId,
    seats: globalSeats,
    base,
  }));
  const aircraftMap = uniqueMap(aircraft, (a) => a.id, 'aircraft', issues);

  // --- Flights (sorted by leg_order within each tail, then globally by dep) -
  const rawFlightsByTail = new Map<string, typeof raw.flights>();
  for (const f of raw.flights) {
    if (!rawFlightsByTail.has(f.tail_id)) rawFlightsByTail.set(f.tail_id, []);
    rawFlightsByTail.get(f.tail_id)!.push(f);
  }
  for (const arr of rawFlightsByTail.values()) {
    arr.sort((a, b) => a.leg_order - b.leg_order);
  }
  const flights: Flight[] = raw.flights
    .map((f) => ({
      id: f.flight_id,
      aircraftId: f.tail_id,
      legOrder: f.leg_order,
      origin: f.origin,
      destination: f.destination,
      schedDep: parseHHMM(f.dep),
      schedArr: parseHHMM(f.arr),
      blockMin: f.block_minutes,
      pax: f.pax,
      turnaroundBeforeMin: f.turnaround_before_min,
    }))
    .sort(compareFlights);
  const flightMap = uniqueMap(flights, (f) => f.id, 'flight', issues);

  // --- Connections ---------------------------------------------------------
  const connections: Connection[] = raw.connections.map((c) => ({
    id: c.connection_id,
    airport: c.airport,
    inboundFlightId: c.from_flight,
    outboundFlightId: c.to_flight,
    pax: c.passengers,
    minConnectMin: c.min_connect_minutes,
  }));
  const connectionMap = uniqueMap(connections, (c) => c.id, 'connection', issues);

  // --- Crews ---------------------------------------------------------------
  const crews: Crew[] = raw.crews.map((c) => ({
    id: c.crew_id,
    tailId: c.tail_id,
    base: c.base,
    dutyStart: parseHHMM(c.duty_start),
    maxDutyMin: c.max_duty_mins,
    flightIds: [...c.flight_ids],
  }));
  const crewMap = uniqueMap(crews, (c) => c.id, 'crew', issues);

  // --- Spare aircraft ------------------------------------------------------
  const spareAircraft: SpareAircraft[] = raw.spare_aircraft.map((s) => ({
    id: s.tail_id,
    base: s.base,
    availableFrom: parseHHMM(s.available_from),
    seats: s.seats,
  }));
  const spareMap = uniqueMap(spareAircraft, (s) => s.id, 'spare aircraft', issues);
  for (const s of spareAircraft) {
    if (aircraftMap.has(s.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `Spare aircraft "${s.id}" reuses a fleet aircraft ID`,
      });
    }
  }

  // --- Referential integrity -----------------------------------------------
  for (const f of flights) {
    if (!aircraftMap.has(f.aircraftId)) {
      issues.push({ severity: 'error', code: 'UNKNOWN_AIRCRAFT', message: `Flight ${f.id} references unknown aircraft "${f.aircraftId}"` });
    }
    for (const code of [f.origin, f.destination]) {
      if (!airportMap.has(code)) {
        issues.push({ severity: 'error', code: 'UNKNOWN_AIRPORT', message: `Flight ${f.id} references unknown airport "${code}"` });
      }
    }
    if (f.origin === f.destination) {
      issues.push({ severity: 'error', code: 'SAME_ORIGIN_DEST', message: `Flight ${f.id} departs and arrives at ${f.origin}` });
    }
    if (f.schedArr <= f.schedDep) {
      issues.push({ severity: 'error', code: 'NON_POSITIVE_BLOCK', message: `Flight ${f.id} arrives (${formatClock(f.schedArr)}) at or before departure (${formatClock(f.schedDep)})` });
    }
    if (f.pax > globalSeats) {
      issues.push({ severity: 'error', code: 'OVERBOOKED', message: `Flight ${f.id} has ${f.pax} pax but seats = ${globalSeats}` });
    }
  }
  for (const s of spareAircraft) {
    if (!airportMap.has(s.base)) {
      issues.push({ severity: 'error', code: 'UNKNOWN_AIRPORT', message: `Spare ${s.id} is at unknown airport "${s.base}"` });
    }
  }

  // --- Aircraft rotations (by leg_order within each tail) ------------------
  const rotation = new Map<string, string[]>();
  for (const a of aircraft) rotation.set(a.id, []);
  for (const tailFlights of rawFlightsByTail.values()) {
    for (const rf of tailFlights) {
      rotation.get(rf.tail_id)?.push(rf.flight_id);
    }
  }
  // Validate continuity
  for (const [acId, ids] of rotation) {
    for (let i = 1; i < ids.length; i++) {
      const prev = flightMap.get(ids[i - 1]!)!;
      const next = flightMap.get(ids[i]!)!;
      if (prev.destination !== next.origin) {
        issues.push({
          severity: 'error',
          code: 'ROTATION_DISCONTINUOUS',
          message: `Aircraft ${acId}: ${prev.id} arrives at ${prev.destination} but ${next.id} departs from ${next.origin}`,
        });
      }
    }
    if (ids.length === 0) {
      issues.push({ severity: 'warning', code: 'IDLE_AIRCRAFT', message: `Aircraft ${acId} has no flights` });
    }
  }

  // --- Crew validation -----------------------------------------------------
  const crewOfFlight = new Map<string, string>();
  for (const c of crews) {
    for (const fid of c.flightIds) {
      if (!flightMap.has(fid)) {
        issues.push({ severity: 'error', code: 'UNKNOWN_FLIGHT', message: `Crew ${c.id} references unknown flight "${fid}"` });
        continue;
      }
      const existing = crewOfFlight.get(fid);
      if (existing !== undefined) {
        issues.push({ severity: 'error', code: 'FLIGHT_MULTIPLE_CREWS', message: `Flight ${fid} assigned to crews ${existing} and ${c.id}` });
      } else {
        crewOfFlight.set(fid, c.id);
      }
    }
    // Validate the crew's last flight's arrival doesn't exceed duty
    if (c.flightIds.length > 0) {
      const last = flightMap.get(c.flightIds[c.flightIds.length - 1]!);
      if (last) {
        const dutyMin = last.schedArr - c.dutyStart;
        if (dutyMin > c.maxDutyMin) {
          issues.push({
            severity: 'error',
            code: 'PLANNED_DUTY_EXCEEDED',
            message: `Crew ${c.id} is rostered for ${dutyMin} min of duty (max ${c.maxDutyMin})`,
          });
        }
      }
    }
  }
  // Check all flights have crews
  for (const f of flights) {
    if (!crewOfFlight.has(f.id)) {
      issues.push({ severity: 'warning', code: 'FLIGHT_WITHOUT_CREW', message: `Flight ${f.id} has no crew assigned` });
    }
  }

  // --- Connection validation -----------------------------------------------
  const connectingPax = new Map<string, number>();
  for (const c of connections) {
    if (!flightMap.has(c.inboundFlightId)) {
      issues.push({ severity: 'error', code: 'UNKNOWN_FLIGHT', message: `Connection ${c.id} references unknown inbound flight "${c.inboundFlightId}"` });
    }
    if (!flightMap.has(c.outboundFlightId)) {
      issues.push({ severity: 'error', code: 'UNKNOWN_FLIGHT', message: `Connection ${c.id} references unknown outbound flight "${c.outboundFlightId}"` });
    }
    const inF = flightMap.get(c.inboundFlightId);
    const outF = flightMap.get(c.outboundFlightId);
    if (inF && outF) {
      if (inF.destination !== c.airport) {
        issues.push({ severity: 'warning', code: 'CONNECTION_AIRPORT_MISMATCH', message: `Connection ${c.id}: inbound ${inF.id} arrives at ${inF.destination}, not ${c.airport}` });
      }
      if (outF.origin !== c.airport) {
        issues.push({ severity: 'warning', code: 'CONNECTION_AIRPORT_MISMATCH', message: `Connection ${c.id}: outbound ${outF.id} departs ${outF.origin}, not ${c.airport}` });
      }
    }
    connectingPax.set(c.inboundFlightId, (connectingPax.get(c.inboundFlightId) ?? 0) + c.pax);
    connectingPax.set(c.outboundFlightId, (connectingPax.get(c.outboundFlightId) ?? 0) + c.pax);
  }
  for (const [fid, cp] of connectingPax) {
    const f = flightMap.get(fid);
    if (f && cp > f.pax) {
      issues.push({ severity: 'error', code: 'CONNECTING_PAX_EXCEED_BOOKED', message: `Flight ${fid} has ${cp} connecting pax but only ${f.pax} booked` });
    }
  }

  const index: DatasetIndex = {
    airport: airportMap,
    aircraft: aircraftMap,
    flight: flightMap,
    crew: crewMap,
    spare: spareMap,
    connection: connectionMap,
    rotation,
    crewOfFlight,
  };

  return {
    dataset: {
      meta: {
        name: raw.meta.dataset,
        operatingDay: raw.meta.operating_day,
        minTurnaroundMin: globalTurn,
        seatsPerAircraft: globalSeats,
        notes: raw.meta.notes,
      },
      rules,
      airports,
      aircraft,
      flights,
      connections,
      crews,
      spareAircraft,
      index,
    },
    issues,
  };
}

/** Passengers on a flight who are not part of any connection. */
export function localPax(dataset: Dataset, flightId: string): number {
  const f = dataset.index.flight.get(flightId);
  if (!f) return 0;
  let connecting = 0;
  for (const c of dataset.connections) {
    if (c.inboundFlightId === flightId || c.outboundFlightId === flightId) connecting += c.pax;
  }
  return Math.max(0, f.pax - connecting);
}

/** Total unique passengers: each connecting pax is booked on two flights. */
export function uniquePassengerCount(dataset: Dataset): number {
  const booked = dataset.flights.reduce((s, f) => s + f.pax, 0);
  const connecting = dataset.connections.reduce((s, c) => s + c.pax, 0);
  return booked - connecting;
}
