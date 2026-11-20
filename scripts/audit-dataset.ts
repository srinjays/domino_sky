/**
 * Audits the official dataset against the organiser's stated rules and
 * prints any assumption the engine relies on. Run: npx tsx scripts/audit-dataset.ts
 */
import { readFileSync } from 'node:fs';
import { loadDataset } from '../packages/engine/src/index.js';

const raw = JSON.parse(readFileSync('data/dataset.json', 'utf8'));
const { dataset: d, warnings } = loadDataset(raw);
console.log('warnings:', warnings.length, 'rules:', d.rules);

let mismatchTurn = 0;
let minGap = Infinity;
for (const [tail, rot] of d.index.rotation) {
  for (let i = 1; i < rot.length; i++) {
    const prev = d.index.flight.get(rot[i - 1]!)!;
    const cur = d.index.flight.get(rot[i]!)!;
    const gap = cur.schedDep - prev.schedArr;
    minGap = Math.min(minGap, gap);
    if (cur.turnaroundBeforeMin !== gap) {
      mismatchTurn++;
      console.log(`turnaround field != scheduled gap: ${tail} ${cur.id} field=${cur.turnaroundBeforeMin} gap=${gap}`);
    }
  }
}
console.log(`turnaround_before_min mismatches vs scheduled gap: ${mismatchTurn}; smallest scheduled gap: ${minGap}`);

for (const c of d.crews) {
  const last = d.index.flight.get(c.flightIds[c.flightIds.length - 1]!)!;
  const first = d.index.flight.get(c.flightIds[0]!)!;
  const duty = last.schedArr - c.dutyStart;
  if (duty > c.maxDutyMin) console.log(`crew ${c.id} scheduled duty ${duty} > ${c.maxDutyMin}`);
  console.log(`crew ${c.id} slack=${c.maxDutyMin - duty}min dutyStart->firstDep=${first.schedDep - c.dutyStart}`);
}

for (const c of d.connections) {
  const a = d.index.flight.get(c.inboundFlightId)!;
  const b = d.index.flight.get(c.outboundFlightId)!;
  const gap = b.schedDep - a.schedArr;
  if (a.destination !== c.airport || b.origin !== c.airport) console.log(`connection ${c.id} airport mismatch`);
  if (gap < c.minConnectMin) console.log(`connection ${c.id} scheduled gap ${gap} < MCT ${c.minConnectMin}`);
}

const connecting = new Map<string, number>();
for (const c of d.connections) {
  connecting.set(c.inboundFlightId, (connecting.get(c.inboundFlightId) ?? 0) + c.pax);
  connecting.set(c.outboundFlightId, (connecting.get(c.outboundFlightId) ?? 0) + c.pax);
}
for (const f of d.flights) {
  if ((connecting.get(f.id) ?? 0) > f.pax) console.log(`flight ${f.id} connecting pax > booked pax`);
}
console.log('audit done');

