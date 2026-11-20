/**
 * Additional engine edge-case and integration tests.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadDataset,
  simulate,
  parseHHMM,
  formatClock,
  formatDuration,
  recommendRecovery,
  scoreKpis,
  type Closure,
  type Dataset,
} from '../src/index.js';

function officialDataset(): Dataset {
  const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'data/dataset.json'), 'utf8'));
  return loadDataset(raw).dataset;
}

describe('official dataset — problem-statement scenario (Mumbai storm cancels a distant flight)', () => {
  const closures: Closure[] = [{ airport: 'BOM', start: parseHHMM('14:30'), end: parseHHMM('16:00') }];

  it('a 90-min BOM closure cancels DS0304 DEL→CCU through a crew-duty breach', () => {
    const d = officialDataset();
    const result = simulate(d, { closures });
    const ds0304 = result.flights.find((f) => f.flightId === 'DS0304')!;
    expect(ds0304.origin).toBe('DEL');
    expect(ds0304.destination).toBe('CCU');
    expect(ds0304.status).toBe('CANCELLED');
    expect(ds0304.cancelReason?.kind).toBe('CREW_DUTY_EXCEEDED');
    // The causal chain must lead back to the Mumbai closure.
    expect(ds0304.chain.root).toMatchObject({ kind: 'CLOSURE', airport: 'BOM' });
    expect(result.kpis.crewDutyBreaches).toBeGreaterThan(0);
  });

  it('crew duty never exceeds the legal limit for any operated leg', () => {
    const d = officialDataset();
    const result = simulate(d, { closures });
    for (const c of result.crews) {
      if (c.actualDutyMin !== null) expect(c.actualDutyMin).toBeLessThanOrEqual(c.maxDutyMin);
    }
  });

  it('the recovery optimiser offers a spare-aircraft swap and it saves the cancelled flight', () => {
    const d = officialDataset();
    const report = recommendRecovery(d, closures);
    const swap = report.candidates.find((c) => c.action.type === 'SWAP_SPARE');
    expect(swap).toBeDefined();
    const after = simulate(d, { closures, actions: [swap!.action] });
    expect(after.kpis.strandedPax).toBeLessThan(report.baseline.kpis.strandedPax);
  });
});

describe('official dataset — turnaround slack absorbs delay', () => {
  it('a late aircraft only needs the 30-min minimum turnaround, not the scheduled ground time', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    const ds0201 = result.flights.find((f) => f.flightId === 'DS0201')!;
    const ds0202 = result.flights.find((f) => f.flightId === 'DS0202')!;
    expect(ds0202.actualDep).toBe(Math.max(ds0202.schedDep, ds0201.actualArr! + d.rules.minTurnaroundMin));
    expect(ds0202.delayMin).toBeLessThan(ds0201.delayMin);
  });

  it('every operated leg respects the minimum turnaround after its predecessor', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'HYD', start: parseHHMM('11:45'), end: parseHHMM('13:15') }],
    });
    const byId = new Map(result.flights.map((f) => [f.flightId, f]));
    for (const rot of d.index.rotation.values()) {
      for (let i = 1; i < rot.length; i++) {
        const prev = byId.get(rot[i - 1]!)!;
        const cur = byId.get(rot[i]!)!;
        if (prev.status === 'CANCELLED' || cur.status === 'CANCELLED') continue;
        expect(cur.actualDep! - prev.actualArr!).toBeGreaterThanOrEqual(d.rules.minTurnaroundMin);
      }
    }
  });
});

describe('official dataset — multi-airport closures', () => {
  it('simultaneous BOM and DEL closure creates severe disruption', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [
        { airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') },
        { airport: 'DEL', start: parseHHMM('08:00'), end: parseHHMM('09:30') },
      ],
    });
    // Both major hubs closed → massive cascade
    expect(result.kpis.delayedFlights + result.kpis.cancelledFlights).toBeGreaterThan(10);
    expect(result.kpis.knockOnFlights).toBeGreaterThan(0);
    expect(result.kpis.totalDelayMin).toBeGreaterThan(500);
  });
});

describe('official dataset — recovery improves KPIs', () => {
  it('recovery candidates score lower (better) than baseline', () => {
    const d = officialDataset();
    const closures: Closure[] = [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }];
    const report = recommendRecovery(d, closures);
    const baseScore = report.baseline.score;

    // All returned candidates should improve (or at least not worsen)
    for (const c of report.candidates) {
      expect(c.score).toBeLessThan(baseScore);
      expect(c.improvement).toBeGreaterThan(0);
    }
  });

  it('greedy plan score ≤ best single action score', () => {
    const d = officialDataset();
    const closures: Closure[] = [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }];
    const report = recommendRecovery(d, closures);
    if (report.candidates.length > 0 && report.plan.steps.length > 1) {
      expect(report.plan.score).toBeLessThanOrEqual(report.candidates[0]!.score);
    }
  });
});

describe('official dataset — edge cases', () => {
  it('very short closure (5 min) has minimal impact', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'BOM', start: parseHHMM('03:00'), end: parseHHMM('03:05') }],
    });
    // Closure at 3 AM should affect nothing
    expect(result.kpis.delayedFlights).toBe(0);
    expect(result.kpis.cancelledFlights).toBe(0);
  });

  it('closure at tiny spoke airport has limited impact', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'IXC', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    // IXC (Chandigarh) has few flights → limited cascade
    expect(result.kpis.delayedFlights + result.kpis.cancelledFlights).toBeLessThan(10);
  });

  it('all flights have non-negative block time', () => {
    const d = officialDataset();
    for (const f of d.flights) {
      expect(f.blockMin).toBeGreaterThan(0);
      expect(f.schedArr - f.schedDep).toBe(f.blockMin);
    }
  });

  it('every connection references valid flights', () => {
    const d = officialDataset();
    for (const c of d.connections) {
      expect(d.index.flight.has(c.inboundFlightId)).toBe(true);
      expect(d.index.flight.has(c.outboundFlightId)).toBe(true);
    }
  });

  it('every crew member references valid flights', () => {
    const d = officialDataset();
    for (const c of d.crews) {
      for (const fid of c.flightIds) {
        expect(d.index.flight.has(fid)).toBe(true);
      }
    }
  });
});

describe('formatClock and formatDuration edge cases', () => {
  it('handles next-day times correctly', () => {
    expect(formatClock(1500)).toBe('01:00+1'); // 25 hours = 01:00 next day
    expect(formatClock(1440)).toBe('00:00+1');
  });

  it('formatDuration handles all cases', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(59)).toBe('59m');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(61)).toBe('1h 1m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(-45)).toBe('-45m');
  });
});

describe('simulation invariants on official dataset', () => {
  it('total operated + cancelled = total flights', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    expect(result.kpis.operatedFlights + result.kpis.cancelledFlights).toBe(result.kpis.totalFlights);
  });

  it('on-time + delayed = operated', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    expect(result.kpis.onTimeFlights + result.kpis.delayedFlights).toBe(result.kpis.operatedFlights);
  });

  it('every operated flight has actualDep and actualArr', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    for (const f of result.flights) {
      if (f.status !== 'CANCELLED') {
        expect(f.actualDep).not.toBeNull();
        expect(f.actualArr).not.toBeNull();
        expect(f.actualArr! - f.actualDep!).toBe(f.blockMin);
      }
    }
  });

  it('scoreKpis is consistent with the formula', () => {
    const d = officialDataset();
    const result = simulate(d, {
      closures: [{ airport: 'BOM', start: parseHHMM('08:00'), end: parseHHMM('09:30') }],
    });
    const kpis = result.kpis;
    const score = scoreKpis(kpis);
    const expected = 10 * kpis.strandedPax + 1 * kpis.totalDelayMin + 100 * kpis.cancelledFlights;
    expect(score).toBe(expected);
  });
});

