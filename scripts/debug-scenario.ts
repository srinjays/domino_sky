import { loadDataset, simulate, parseHHMM, formatClock } from '../packages/engine/src/index.js';
import { readFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync('data/dataset.json', 'utf8'));
const { dataset } = loadDataset(raw);

// Test multiple BOM closure windows
for (const [label, start, end] of [
  ['BOM 08:00-09:30', '08:00', '09:30'],
  ['BOM 14:00-15:30', '14:00', '15:30'],
  ['BOM 06:00-07:30', '06:00', '07:30'],
  ['BOM 10:00-11:30', '10:00', '11:30'],
] as const) {
  const result = simulate(dataset, {
    closures: [{ airport: 'BOM', start: parseHHMM(start), end: parseHHMM(end) }],
  });
  const disrupted = result.flights.filter(f => f.status !== 'ON_TIME');
  console.log(`\n=== ${label} ===`);
  console.log(`Disrupted: ${disrupted.length}, KnockOn: ${result.kpis.knockOnFlights}, Delayed: ${result.kpis.delayedFlights}, Cancelled: ${result.kpis.cancelledFlights}`);
  console.log(`TotalDelay: ${result.kpis.totalDelayMin}min, Stranded: ${result.kpis.strandedPax}, BrokenCx: ${result.kpis.brokenConnections}`);
  for (const f of disrupted) {
    console.log(`  ${f.flightId} ${f.origin}→${f.destination} sched=${formatClock(f.schedDep)} actual=${f.actualDep !== null ? formatClock(f.actualDep) : 'N/A'} status=${f.status} delay=${f.delayMin}m cause=${f.cause.kind}`);
  }
}

