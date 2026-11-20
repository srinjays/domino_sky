/**
 * Scans every 90-minute closure window (in 15-minute steps) at every airport
 * and reports the most disruptive ones, plus any window that cancels a flight
 * through a crew-duty breach. Used to pick the UI presets.
 * Run: npx tsx scripts/scan-scenarios.ts
 */
import { readFileSync } from 'node:fs';
import { loadDataset, simulate, formatClock } from '../packages/engine/src/index.js';

const { dataset } = loadDataset(JSON.parse(readFileSync('data/dataset.json', 'utf8')));
const rows: { label: string; score: number; knock: number; cancelled: number; stranded: number; crew: number; cancelledIds: string }[] = [];

for (const a of dataset.airports) {
  for (let start = 300; start <= 1200; start += 15) {
    const r = simulate(dataset, { closures: [{ airport: a.code, start, end: start + 90 }] });
    const k = r.kpis;
    rows.push({
      label: `${a.code} ${formatClock(start)}-${formatClock(start + 90)}`,
      score: k.strandedPax * 10 + k.totalDelayMin + k.cancelledFlights * 100,
      knock: k.knockOnFlights,
      cancelled: k.cancelledFlights,
      stranded: k.strandedPax,
      crew: k.crewDutyBreaches,
      cancelledIds: r.flights.filter((f) => f.status === 'CANCELLED').map((f) => `${f.flightId}(${f.origin}-${f.destination})`).join(' '),
    });
  }
}

console.log('--- Top 12 by impact ---');
for (const r of [...rows].sort((x, y) => y.score - x.score).slice(0, 12)) console.log(r);
console.log('--- Windows with crew-duty cancellations (first 15) ---');
for (const r of rows.filter((x) => x.crew > 0).slice(0, 15)) console.log(r);
console.log('--- BOM windows with knock-on flights ---');
for (const r of rows.filter((x) => x.label.startsWith('BOM') && x.knock > 0)) console.log(r.label, 'knock', r.knock, 'stranded', r.stranded, 'cancelled', r.cancelledIds);

