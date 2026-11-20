/**
 * Engine unit and golden-scenario tests.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  loadDataset,
  simulate,
  parseHHMM,
  formatClock,
  formatDuration,
  applyClosures,
  DatasetError,
  ScenarioError,
  recommendRecovery,
  scoreKpis,
  type Closure,
  type Dataset,
  type SimulationResult,
  type Kpis,
} from '../src/index.js';
import { TEST_DATASET } from './fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function ds(): Dataset {
  return loadDataset(TEST_DATASET).dataset;
}

function run(dataset: Dataset, closures: Closure[]): SimulationResult {
  return simulate(dataset, { closures });
}

function byId(result: SimulationResult, flightId: string) {
  return result.flights.find((f) => f.flightId === flightId)!;
}

// ---------------------------------------------------------------------------
// Time utilities
// ---------------------------------------------------------------------------
describe('time utilities', () => {
  it('parseHHMM and formatClock roundtrip', () => {
    expect(parseHHMM('00:00')).toBe(0);
    expect(parseHHMM('23:59')).toBe(1439);
    expect(parseHHMM('06:30')).toBe(390);
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1439)).toBe('23:59');
    expect(formatClock(1500)).toBe('01:00+1');
  });

  it('formatDuration', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45m');
    expect(formatDuration(90)).toBe('1h 30m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(-30)).toBe('-30m');
  });

  it('rejects invalid times', () => {
    expect(() => parseHHMM('25:61')).toThrow();
    expect(() => parseHHMM('abc')).toThrow();
    expect(() => parseHHMM('48:00')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Dataset loading
// ---------------------------------------------------------------------------
describe('dataset loading', () => {
  it('loads the test dataset without errors', () => {
    const { dataset, warnings } = loadDataset(TEST_DATASET);
    expect(warnings).toEqual([]);
    expect(dataset.airports).toHaveLength(4);
    expect(dataset.aircraft).toHaveLength(3);
    expect(dataset.flights).toHaveLength(8);
    expect(dataset.connections).toHaveLength(2);
    expect(dataset.crews).toHaveLength(4);
    expect(dataset.spareAircraft).toHaveLength(1);
  });

  it('detects duplicate flight IDs', () => {
    const bad = {
      ...TEST_DATASET,
      flights: [...TEST_DATASET.flights, { ...TEST_DATASET.flights[0]! }],
    };
    expect(() => loadDataset(bad)).toThrow(DatasetError);
  });

  it('validates all rotations are continuous', () => {
    const d = ds();
    for (const [_acId, rotation] of d.index.rotation) {
      for (let i = 1; i < rotation.length; i++) {
        const prev = d.index.flight.get(rotation[i - 1]!)!;
        const next = d.index.flight.get(rotation[i]!)!;
        expect(prev.destination).toBe(next.origin);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Closure application
// ---------------------------------------------------------------------------
describe('applyClosures', () => {
  it('no closure = no change', () => {
    const adj = applyClosures(360, 150, 'DEL', 'BOM', []);
    expect(adj.dep).toBe(360);
    expect(adj.cause).toBeNull();
  });

  it('origin closure delays departure to closure end', () => {
    const adj = applyClosures(360, 150, 'BOM', 'DEL', [{ airport: 'BOM', start: 300, end: 400 }]);
    expect(adj.dep).toBe(400);
    expect(adj.cause?.kind).toBe('ORIGIN_CLOSURE');
  });

  it('destination closure applies ground hold', () => {
    // Flight dep 360, block 150, arr 510; dest closed 480-540
    const adj = applyClosures(360, 150, 'DEL', 'BOM', [{ airport: 'BOM', start: 480, end: 540 }]);
    // Must arrive at 540 → dep at 540-150 = 390
    expect(adj.dep).toBe(390);
    expect(adj.cause?.kind).toBe('DEST_CLOSURE');
  });

  it('multiple closures compose', () => {
    const closures: Closure[] = [
      { airport: 'BOM', start: 300, end: 400 },
      { airport: 'BOM', start: 500, end: 600 },
    ];
    const adj = applyClosures(350, 60, 'BOM', 'DEL', closures);
    expect(adj.dep).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Simulation: no disruption (baseline)
// ---------------------------------------------------------------------------
describe('simulation baseline (no disruption)', () => {
  it('all flights on time with minimal closure', () => {
    const d = ds();
    // Close HYD at midnight for 1 minute — affects nothing
    const result = run(d, [{ airport: 'HYD', start: 0, end: 1 }]);
    for (const f of result.flights) {
      expect(f.status).toBe('ON_TIME');
      expect(f.delayMin).toBe(0);
      expect(f.actualDep).toBe(f.schedDep);
    }
    expect(result.kpis.delayedFlights).toBe(0);
    expect(result.kpis.cancelledFlights).toBe(0);
    expect(result.kpis.strandedPax).toBe(0);
    expect(result.kpis.brokenConnections).toBe(0);
  });

  it('all connections made', () => {
    const d = ds();
    const result = run(d, [{ airport: 'HYD', start: 0, end: 1 }]);
    for (const c of result.connections) {
      expect(c.status).toBe('MADE');
    }
  });
});

// ---------------------------------------------------------------------------
// Golden scenario: BOM closure 08:00-09:30 (90 min)
// ---------------------------------------------------------------------------
describe('golden scenario: BOM 08:00-09:30', () => {
  const BOM_CLOSURE: Closure = { airport: 'BOM', start: 480, end: 570 };

  it('F01 (DEL→BOM dep 06:00 arr 08:30): ground-held at DEL', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f01 = byId(result, 'F01');
    // F01 block = 150 min. Scheduled arr = 08:30 (510), BOM closed until 09:30 (570)
    // Ground hold: dep = 570 - 150 = 420 (07:00)
    expect(f01.actualDep).toBe(420); // 07:00
    expect(f01.actualArr).toBe(570); // 09:30
    expect(f01.delayMin).toBe(60);
    expect(f01.status).toBe('DELAYED');
    expect(f01.cause.kind).toBe('DEST_CLOSURE');
  });

  it('F02 (BOM→DEL dep 09:10): cascade from F01 late arrival + minimum turnaround', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f02 = byId(result, 'F02');
    // F01 arrives at 570 (09:30). Minimum turnaround = 30 min (meta).
    // Aircraft ready at 570 + 30 = 600 (10:00). Scheduled dep 09:10 (550).
    // The 40 min of scheduled ground time absorbs nothing here: 600 - 550 = 50.
    expect(f02.actualDep).toBe(600);
    expect(f02.delayMin).toBe(50);
    expect(f02.status).toBe('DELAYED');
    expect(f02.cause.kind).toBe('LATE_INBOUND_AIRCRAFT');
  });

  it('cascade reaches HYD: F03 delayed by AC1 from F02, scheduled slack absorbs 10 min', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f03 = byId(result, 'F03');
    // F02 dep 600 + 150 = arr 750 (12:30). Ready 750 + 30 = 780 (13:00).
    // F03 scheduled dep 740 (12:20) → delayed by 40 (F02 was 50 late; 10 min slack).
    expect(f03.actualDep).toBe(780);
    expect(f03.delayMin).toBe(40);
    expect(f03.status).toBe('DELAYED');
    // F03 is DEL→HYD, neither is BOM → knock-on
    expect(result.kpis.knockOnFlights).toBeGreaterThan(0);
  });

  it('F04: delay keeps shrinking as scheduled ground time above the minimum absorbs it', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f04 = byId(result, 'F04');
    // F03 arr 780 + 130 = 910. Ready 940. F04 sched 910 → delay 30.
    expect(f04.actualDep).toBe(940);
    expect(f04.delayMin).toBe(30);
  });

  it('F05 (BLR→BOM dep 07:00 arr 08:30): ground-held', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f05 = byId(result, 'F05');
    // F05 block = 90 min. arr = 510, BOM closed until 570
    // Ground hold: dep = 570 - 90 = 480 (08:00)
    expect(f05.actualDep).toBe(480);
    expect(f05.actualArr).toBe(570);
    expect(f05.delayMin).toBe(60);
    expect(f05.status).toBe('DELAYED');
  });

  it('F08 (BOM→HYD dep 06:30): departs before closure, unaffected', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f08 = byId(result, 'F08');
    // F08 dep 06:30 (390) < closure start 08:00 (480), so it departs normally
    expect(f08.actualDep).toBe(390);
    expect(f08.status).toBe('ON_TIME');
  });

  it('connection CX01 (F01→F06): missed because gap < MCT', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const cx01 = result.connections.find((c) => c.connectionId === 'CX01')!;
    expect(cx01.actualConnectMin).toBe(30);
    expect(cx01.status).toBe('MISSED');
  });

  it('causal chain traces back to BOM closure', () => {
    const d = ds();
    const result = run(d, [BOM_CLOSURE]);
    const f03 = byId(result, 'F03');
    expect(f03.chain.root.kind).toBe('CLOSURE');
    if (f03.chain.root.kind === 'CLOSURE') {
      expect(f03.chain.root.airport).toBe('BOM');
    }
    expect(f03.chain.links.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Cancellation cascade
// ---------------------------------------------------------------------------
describe('cancellation cascade', () => {
  it('cancelling F01 makes F02 infeasible (aircraft out of position)', () => {
    const d = ds();
    const result = simulate(d, {
      closures: [{ airport: 'HYD', start: 0, end: 1 }],
      actions: [{ type: 'CANCEL', flightIds: ['F01'] }],
    });
    const f02 = byId(result, 'F02');
    expect(f02.status).toBe('CANCELLED');
    expect(f02.cancelReason?.kind).toBe('AIRCRAFT_OUT_OF_POSITION');
  });

  it('cancelling a round-trip pair frees later flights', () => {
    const d = ds();
    const result = simulate(d, {
      closures: [{ airport: 'HYD', start: 0, end: 1 }],
      actions: [{ type: 'CANCEL', flightIds: ['F01', 'F02'] }],
    });
    const f03 = byId(result, 'F03');
    // AC1 starts at DEL, F01+F02 cancelled → AC1 stays at DEL
    // F03 origin DEL → AC1 available. CR-B is a separate crew at DEL.
    expect(f03.status).toBe('ON_TIME');
  });
});

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------
describe('recovery', () => {
  const BOM_CLOSURE: Closure = { airport: 'BOM', start: 480, end: 570 };

  it('generates candidates and ranks by score (ascending)', () => {
    const d = ds();
    const report = recommendRecovery(d, [BOM_CLOSURE]);
    expect(report.evaluatedCount).toBeGreaterThan(0);
    for (let i = 1; i < report.candidates.length; i++) {
      expect(report.candidates[i]!.score).toBeGreaterThanOrEqual(report.candidates[i - 1]!.score);
    }
  });

  it('every candidate has a valid ID and description', () => {
    const d = ds();
    const report = recommendRecovery(d, [BOM_CLOSURE]);
    for (const c of report.candidates) {
      expect(c.id).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(typeof c.score).toBe('number');
    }
  });

  it('scoreKpis matches the formula', () => {
    const kpis: Kpis = {
      totalFlights: 8, operatedFlights: 7, onTimeFlights: 5,
      delayedFlights: 2, cancelledFlights: 1,
      totalDelayMin: 120, maxDelayMin: 60,
      knockOnFlights: 1, aircraftAffected: 2,
      totalConnections: 2, brokenConnections: 1,
      totalPassengers: 1000, strandedPax: 25,
      strandedLocalPax: 10, strandedMissedConnectionPax: 15, strandedCancelledConnectionPax: 0,
      delayedPax: 200, crewDutyBreaches: 0,
    };
    const score = scoreKpis(kpis, { strandedPax: 10, delayMin: 1, cancellation: 100 });
    expect(score).toBe(10 * 25 + 1 * 120 + 100 * 1);
  });
});

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------
describe('property-based tests', () => {
  const d = ds();

  it('no closure → zero delay', () => {
    const result = run(d, [{ airport: 'HYD', start: 0, end: 1 }]);
    expect(result.kpis.totalDelayMin).toBe(0);
    expect(result.kpis.cancelledFlights).toBe(0);
  });

  it('delays are non-negative', () => {
    const airportCodes = ['DEL', 'BOM', 'BLR', 'HYD'];
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 300, max: 900 }),
        fc.integer({ min: 30, max: 180 }),
        (airportIdx, start, duration) => {
          const result = run(d, [{
            airport: airportCodes[airportIdx]!,
            start,
            end: start + duration,
          }]);
          for (const f of result.flights) {
            expect(f.delayMin).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('actualArr - actualDep = block time for operated flights', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        fc.integer({ min: 300, max: 900 }),
        fc.integer({ min: 30, max: 120 }),
        (airportIdx, start, duration) => {
          const airportCodes = ['DEL', 'BOM', 'BLR', 'HYD'];
          const result = run(d, [{
            airport: airportCodes[airportIdx]!,
            start,
            end: start + duration,
          }]);
          for (const f of result.flights) {
            if (f.status !== 'CANCELLED' && f.actualDep !== null && f.actualArr !== null) {
              expect(f.actualArr - f.actualDep).toBe(f.blockMin);
            }
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('determinism: same input → same output', () => {
    const closure: Closure = { airport: 'BOM', start: 480, end: 570 };
    const r1 = run(d, [closure]);
    const r2 = run(d, [closure]);
    expect(r1.kpis).toStrictEqual(r2.kpis);
    for (let i = 0; i < r1.flights.length; i++) {
      expect(r1.flights[i]!.actualDep).toBe(r2.flights[i]!.actualDep);
      expect(r1.flights[i]!.status).toBe(r2.flights[i]!.status);
    }
  });

  it('longer closure → delays never decrease (monotonicity)', () => {
    const short = run(d, [{ airport: 'BOM', start: 480, end: 540 }]);
    const long = run(d, [{ airport: 'BOM', start: 480, end: 600 }]);
    expect(long.kpis.totalDelayMin).toBeGreaterThanOrEqual(short.kpis.totalDelayMin);
  });
});

// ---------------------------------------------------------------------------
// Scenario validation
// ---------------------------------------------------------------------------
describe('scenario validation', () => {
  it('rejects unknown airport', () => {
    expect(() => run(ds(), [{ airport: 'XXX', start: 300, end: 400 }])).toThrow(ScenarioError);
  });

  it('rejects end before start', () => {
    expect(() => run(ds(), [{ airport: 'BOM', start: 400, end: 300 }])).toThrow(ScenarioError);
  });
});

// ---------------------------------------------------------------------------
// Official dataset loading
// ---------------------------------------------------------------------------
describe('official dataset', () => {
  it('loads the official flight_network.json', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/dataset.json'), 'utf8'));
    const { dataset, warnings } = loadDataset(raw);
    expect(warnings).toEqual([]);
    expect(dataset.airports).toHaveLength(16);
    expect(dataset.flights).toHaveLength(70);
    expect(dataset.aircraft).toHaveLength(16);
    expect(dataset.connections).toHaveLength(21);
    expect(dataset.crews).toHaveLength(16);
    expect(dataset.spareAircraft).toHaveLength(2);
  });

  it('BOM 90-min closure cascades as described in the problem statement', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const raw = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'data/dataset.json'), 'utf8'));
    const { dataset } = loadDataset(raw);
    // 90-minute morning closure at Mumbai (BOM) — peak departure window
    // demonstrates the full cascade: BOM closure → ground holds → late inbound →
    // knock-on delays at DEL, BLR, HYD, COK, PNQ, AMD, etc.
    const result = simulate(dataset, {
      closures: [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    // Multiple flights should be disrupted
    expect(result.kpis.delayedFlights + result.kpis.cancelledFlights).toBeGreaterThan(5);
    // Knock-on effects spread to airports with clear skies
    expect(result.kpis.knockOnFlights).toBeGreaterThan(0);
    // Significant cumulative delay
    expect(result.kpis.totalDelayMin).toBeGreaterThan(100);
    // Some passenger connections broken
    expect(result.kpis.brokenConnections).toBeGreaterThan(0);
    // Some passengers stranded
    expect(result.kpis.strandedPax).toBeGreaterThan(0);
  });
});
