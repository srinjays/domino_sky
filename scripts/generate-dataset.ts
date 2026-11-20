/**
 * Generates the bundled demo dataset (data/dataset.json).
 *
 * The organisers' official dataset should replace data/dataset.json; this
 * generator only exists so the project is runnable and testable end-to-end
 * before that file is available. It is fully deterministic (seeded PRNG).
 *
 * Usage: npm run dataset:generate
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDataset, type RawDataset } from '../packages/engine/src/index.js';

const SPEED_KMH = 750;
const TAXI_MIN = 30;

const airports = [
  { code: 'DEL', name: 'Indira Gandhi International', city: 'Delhi', lat: 28.5562, lon: 77.1, minTurnaroundMin: 40 },
  { code: 'BOM', name: 'Chhatrapati Shivaji Maharaj International', city: 'Mumbai', lat: 19.0896, lon: 72.8656, minTurnaroundMin: 40 },
  { code: 'BLR', name: 'Kempegowda International', city: 'Bengaluru', lat: 13.1986, lon: 77.7066, minTurnaroundMin: 40 },
  { code: 'MAA', name: 'Chennai International', city: 'Chennai', lat: 12.9941, lon: 80.1709, minTurnaroundMin: 35 },
  { code: 'CCU', name: 'Netaji Subhas Chandra Bose International', city: 'Kolkata', lat: 22.6547, lon: 88.4467, minTurnaroundMin: 35 },
  { code: 'HYD', name: 'Rajiv Gandhi International', city: 'Hyderabad', lat: 17.2403, lon: 78.4294, minTurnaroundMin: 35 },
  { code: 'AMD', name: 'Sardar Vallabhbhai Patel International', city: 'Ahmedabad', lat: 23.0772, lon: 72.6347, minTurnaroundMin: 30 },
  { code: 'COK', name: 'Cochin International', city: 'Kochi', lat: 10.152, lon: 76.4019, minTurnaroundMin: 30 },
  { code: 'PNQ', name: 'Pune International', city: 'Pune', lat: 18.5822, lon: 73.9197, minTurnaroundMin: 30 },
  { code: 'GOI', name: 'Goa International (Dabolim)', city: 'Goa', lat: 15.3808, lon: 73.8314, minTurnaroundMin: 30 },
  { code: 'JAI', name: 'Jaipur International', city: 'Jaipur', lat: 26.8242, lon: 75.8122, minTurnaroundMin: 30 },
  { code: 'LKO', name: 'Chaudhary Charan Singh International', city: 'Lucknow', lat: 26.7606, lon: 80.8893, minTurnaroundMin: 30 },
  { code: 'GAU', name: 'Lokpriya Gopinath Bordoloi International', city: 'Guwahati', lat: 26.1061, lon: 91.5859, minTurnaroundMin: 30 },
  { code: 'BBI', name: 'Biju Patnaik International', city: 'Bhubaneswar', lat: 20.2444, lon: 85.8178, minTurnaroundMin: 30 },
  { code: 'NAG', name: 'Dr. Babasaheb Ambedkar International', city: 'Nagpur', lat: 21.0922, lon: 79.0472, minTurnaroundMin: 30 },
  { code: 'IXC', name: 'Shaheed Bhagat Singh International', city: 'Chandigarh', lat: 30.6735, lon: 76.7885, minTurnaroundMin: 30 },
];

/** tail, type, seats, first departure, airport sequence, crew split index, slack per turn */
const rotations: {
  tail: string;
  type: string;
  seats: number;
  start: string;
  route: string[];
  split: number;
  slack: number[];
}[] = [
  { tail: 'VT-DSA', type: 'A320neo', seats: 186, start: '06:00', route: ['DEL', 'BOM', 'DEL', 'BOM', 'DEL'], split: 2, slack: [15, 20, 10] },
  { tail: 'VT-DSB', type: 'A320neo', seats: 186, start: '07:00', route: ['BLR', 'BOM', 'BLR', 'CCU', 'BLR'], split: 1, slack: [20, 15, 10] },
  { tail: 'VT-DSC', type: 'A320neo', seats: 186, start: '06:30', route: ['BOM', 'GOI', 'BOM', 'AMD', 'BOM', 'GOI'], split: 3, slack: [10, 20, 15, 10] },
  { tail: 'VT-DSD', type: 'A321neo', seats: 222, start: '07:15', route: ['BOM', 'HYD', 'MAA', 'BOM', 'JAI'], split: 2, slack: [15, 25, 15] },
  { tail: 'VT-DSE', type: 'A320neo', seats: 186, start: '06:15', route: ['DEL', 'CCU', 'GAU', 'CCU', 'DEL'], split: 2, slack: [20, 10, 15] },
  { tail: 'VT-DSF', type: 'A320neo', seats: 186, start: '06:00', route: ['BLR', 'DEL', 'IXC', 'DEL', 'BLR'], split: 2, slack: [25, 10, 20] },
  { tail: 'VT-DSG', type: 'A320neo', seats: 186, start: '06:45', route: ['MAA', 'DEL', 'LKO', 'DEL', 'MAA'], split: 2, slack: [15, 15, 10] },
  { tail: 'VT-DSH', type: 'A321neo', seats: 222, start: '07:30', route: ['HYD', 'BOM', 'COK', 'BOM', 'HYD', 'BLR'], split: 3, slack: [10, 15, 20, 15] },
  { tail: 'VT-DSI', type: 'A320neo', seats: 186, start: '06:20', route: ['CCU', 'BOM', 'NAG', 'BOM', 'CCU'], split: 2, slack: [15, 10, 25] },
  { tail: 'VT-DSJ', type: 'A320neo', seats: 186, start: '06:10', route: ['PNQ', 'DEL', 'JAI', 'DEL', 'PNQ'], split: 2, slack: [20, 15, 10] },
  { tail: 'VT-DSK', type: 'A320neo', seats: 186, start: '07:05', route: ['AMD', 'BLR', 'COK', 'BLR', 'AMD'], split: 2, slack: [10, 20, 15] },
  { tail: 'VT-DSL', type: 'A320neo', seats: 186, start: '06:40', route: ['DEL', 'BBI', 'CCU', 'BLR', 'HYD', 'DEL'], split: 3, slack: [15, 20, 10, 15] },
  { tail: 'VT-DSM', type: 'A320neo', seats: 186, start: '08:00', route: ['GOI', 'DEL', 'GOI', 'BLR', 'GOI'], split: 2, slack: [20, 15, 15] },
  { tail: 'VT-DSN', type: 'A320neo', seats: 186, start: '06:05', route: ['BLR', 'HYD', 'BOM', 'LKO', 'BOM', 'BLR'], split: 3, slack: [10, 15, 20, 10] },
  { tail: 'VT-DSO', type: 'A321neo', seats: 222, start: '06:35', route: ['DEL', 'BOM', 'MAA', 'BOM', 'DEL', 'PNQ'], split: 3, slack: [20, 10, 15, 25] },
  { tail: 'VT-DSP', type: 'A320neo', seats: 186, start: '06:25', route: ['LKO', 'BOM', 'BLR', 'MAA', 'CCU', 'LKO'], split: 3, slack: [15, 10, 20, 15] },
];

const spares = [
  { id: 'SP-1', type: 'A320neo', seats: 186, airport: 'DEL', availableFrom: '06:00' },
  { id: 'SP-2', type: 'A320neo', seats: 186, airport: 'BLR', availableFrom: '09:00' },
  { id: 'SP-3', type: 'A320neo', seats: 186, airport: 'BOM', availableFrom: '07:00' },
];

const HUBS = new Set(['DEL', 'BOM', 'BLR', 'HYD', 'CCU', 'MAA']);

// --- deterministic helpers ---------------------------------------------------
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261120);
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const round5 = (n: number) => Math.round(n / 5) * 5;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const airportBy = new Map(airports.map((a) => [a.code, a]));

function distanceKm(a: string, b: string): number {
  const A = airportBy.get(a)!;
  const B = airportBy.get(b)!;
  const rad = Math.PI / 180;
  const dLat = (B.lat - A.lat) * rad;
  const dLon = (B.lon - A.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A.lat * rad) * Math.cos(B.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const blockMin = (a: string, b: string) => round5((distanceKm(a, b) / SPEED_KMH) * 60 + TAXI_MIN);

// --- flights ---------------------------------------------------------------
interface GenFlight {
  id: string;
  aircraftId: string;
  origin: string;
  destination: string;
  dep: number;
  arr: number;
  pax: number;
  seats: number;
}
const flights: GenFlight[] = [];
const crews: { id: string; base: string; maxDutyMin: number; flightIds: string[] }[] = [];
let flightNo = 101;

rotations.forEach((r, ri) => {
  let t = toMin(r.start);
  const ids: string[] = [];
  for (let i = 0; i < r.route.length - 1; i++) {
    const origin = r.route[i]!;
    const destination = r.route[i + 1]!;
    const block = blockMin(origin, destination);
    const load = 0.72 + rand() * 0.23;
    const f: GenFlight = {
      id: `DS${flightNo++}`,
      aircraftId: r.tail,
      origin,
      destination,
      dep: t,
      arr: t + block,
      pax: Math.floor(r.seats * load),
      seats: r.seats,
    };
    flights.push(f);
    ids.push(f.id);
    const turn = airportBy.get(destination)!.minTurnaroundMin;
    t = f.arr + turn + (r.slack[i] ?? 15);
  }
  const letter = String.fromCharCode(65 + ri);
  crews.push({ id: `CR-${letter}1`, base: r.route[0]!, maxDutyMin: 600, flightIds: ids.slice(0, r.split) });
  crews.push({
    id: `CR-${letter}2`,
    base: r.route[r.split]!,
    maxDutyMin: 600,
    flightIds: ids.slice(r.split),
  });
});

// Crew cross-over: crew CR-B1 (VT-DSB, BLR->BOM) also flies VT-DSA's BOM->DEL leg,
// so a Mumbai disruption reaches Delhi through the crew, not only the aircraft.
function moveFlightToCrew(flightId: string, toCrew: string): void {
  for (const c of crews) c.flightIds = c.flightIds.filter((id) => id !== flightId);
  crews.find((c) => c.id === toCrew)!.flightIds.push(flightId);
}
const fById = new Map(flights.map((f) => [f.id, f]));
function crossover(fromCrew: string, flightId: string): void {
  const crew = crews.find((c) => c.id === fromCrew)!;
  const first = fById.get(crew.flightIds[0]!)!;
  const last = fById.get(crew.flightIds[crew.flightIds.length - 1]!)!;
  const next = fById.get(flightId)!;
  const duty = next.arr + 30 - (first.dep - 60);
  if (last.destination === next.origin && next.dep >= last.arr + 30 && duty <= crew.maxDutyMin) {
    moveFlightToCrew(flightId, fromCrew);
  }
}
// Find VT-DSA's second BOM departure and let CR-B1 fly it when feasible.
const dsaFromBom = flights.filter((f) => f.aircraftId === 'VT-DSA' && f.origin === 'BOM');
for (const f of dsaFromBom) crossover('CR-B1', f.id);
const dsiFromBom = flights.filter((f) => f.aircraftId === 'VT-DSI' && f.origin === 'BOM');
for (const f of dsiFromBom) crossover('CR-P1', f.id);

// Re-split any crew whose duty became too long: move tail flights to a new crew.
for (const c of [...crews]) {
  const fl = c.flightIds.map((id) => fById.get(id)!).sort((a, b) => a.dep - b.dep);
  c.flightIds = fl.map((f) => f.id);
}
const nonEmptyCrews = crews.filter((c) => c.flightIds.length > 0);

// --- connections -------------------------------------------------------------
const connections: { id: string; inboundFlightId: string; outboundFlightId: string; pax: number; minConnectMin: number }[] = [];
const connectingOn = new Map<string, number>();
let cx = 1;
const sorted = [...flights].sort((a, b) => a.dep - b.dep || a.id.localeCompare(b.id));
for (const inbound of sorted) {
  if (!HUBS.has(inbound.destination)) continue;
  for (const outbound of sorted) {
    if (outbound.origin !== inbound.destination || outbound.aircraftId === inbound.aircraftId) continue;
    if (outbound.destination === inbound.origin) continue;
    const mct = inbound.destination === 'DEL' || inbound.destination === 'BOM' ? 60 : 45;
    const gap = outbound.dep - inbound.arr;
    if (gap < mct || gap > mct + 105) continue;
    if (rand() > 0.55) continue;
    const pax = 6 + Math.floor(rand() * 19);
    const inUsed = connectingOn.get(inbound.id) ?? 0;
    const outUsed = connectingOn.get(outbound.id) ?? 0;
    if (inUsed + pax > inbound.pax * 0.4 || outUsed + pax > outbound.pax * 0.4) continue;
    connectingOn.set(inbound.id, inUsed + pax);
    connectingOn.set(outbound.id, outUsed + pax);
    connections.push({
      id: `CX${String(cx++).padStart(2, '0')}`,
      inboundFlightId: inbound.id,
      outboundFlightId: outbound.id,
      pax,
      minConnectMin: mct,
    });
  }
}

const dataset: RawDataset = {
  meta: {
    name: 'Domino Sky demo network',
    operatingDate: '2026-07-15',
    timezone: 'Asia/Kolkata',
    source:
      'Synthetic placeholder generated by scripts/generate-dataset.ts. Replace data/dataset.json with the organiser dataset.',
  },
  rules: {
    crewReportMin: 60,
    crewReleaseMin: 30,
    crewMinConnectMin: 30,
    delayThresholdMin: 15,
    defaultMinTurnaroundMin: 35,
    standbyCrewMaxDutyMin: 600,
  },
  airports,
  aircraft: rotations.map((r) => ({ id: r.tail, type: r.type, seats: r.seats, base: r.route[0]! })),
  flights: sorted.map((f) => ({
    id: f.id,
    aircraftId: f.aircraftId,
    origin: f.origin,
    destination: f.destination,
    schedDep: hhmm(f.dep),
    schedArr: hhmm(f.arr),
    pax: f.pax,
  })),
  connections,
  crews: nonEmptyCrews,
  spareAircraft: spares,
};

// Validate with the engine before writing (throws on any integrity error).
const { warnings } = loadDataset(dataset);
const out = resolve(process.cwd(), 'data/dataset.json');
writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n');
console.log(
  `Wrote ${out}: ${airports.length} airports, ${rotations.length} aircraft, ${flights.length} flights, ` +
    `${connections.length} connections, ${nonEmptyCrews.length} crews, ${spares.length} spares` +
    (warnings.length ? `, ${warnings.length} warnings` : ''),
);
