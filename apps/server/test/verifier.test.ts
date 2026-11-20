/**
 * AI verifier unit tests.
 */
import { describe, it, expect } from 'vitest';
import { verifyResponse } from '../src/ai/verifier.js';
import type { FactSheet } from '../src/ai/factSheet.js';

function mockSheet(overrides?: Partial<FactSheet>): FactSheet {
  return {
    scenario: {
      closures: [{ airport: 'BOM', city: 'Mumbai', start: '08:00', end: '09:30', durationMin: 90 }],
    },
    network: { totalFlights: 70, totalPassengers: 9735, aircraft: 16, airportCodes: ['BOM', 'DEL', 'BLR', 'HYD', 'CCU', 'MAA', 'GOI', 'JAI', 'AMD', 'PNQ', 'COK', 'GAU', 'PAT', 'IXC', 'ATQ', 'NAG'] },
    baseline: {
      delayedFlights: 17, cancelledFlights: 0, totalDelayMin: 1040, maxDelayMin: 80,
      knockOnFlights: 9, brokenConnections: 3, strandedPax: 92, delayedPax: 2611,
      crewDutyBreaches: 0, score: 1960,
    },
    options: [
      {
        optionId: 'CANCEL-DS0201',
        description: 'Cancel DS0201 (DEL→BOM 06:00)',
        actionIds: ['CANCEL-DS0201'],
        after: {
          delayedFlights: 10, cancelledFlights: 3, totalDelayMin: 500, maxDelayMin: 60,
          knockOnFlights: 4, brokenConnections: 1, strandedPax: 40, delayedPax: 1200,
          crewDutyBreaches: 0,
        },
        reduction: { strandedPax: 52, totalDelayMin: 540, cancelledFlights: -3, brokenConnections: 2 },
        score: 1200,
        scoreImprovement: 760,
      },
    ],
    mostAffectedFlights: [
      { flightId: 'DS0201', route: 'DEL-BOM', scheduledDeparture: '06:00', status: 'DELAYED', delayMin: 80, pax: 155, why: 'Ground hold' },
    ],
    scoring: { strandedPaxWeight: 10, delayMinWeight: 1, cancellationWeight: 100 },
    ...overrides,
  };
}

describe('AI Grounding Verifier', () => {
  it('passes a correctly grounded response', () => {
    const sheet = mockSheet();
    const text = 'I recommend cancelling DS0201 (DEL-BOM). This reduces stranded passengers from 92 to 40, saving 52 passengers. Total delay drops from 1040 to 500 minutes.';
    const result = verifyResponse(text, 'CANCEL-DS0201', sheet);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.checkedCount).toBeGreaterThan(0);
  });

  it('rejects an invalid option ID', () => {
    const sheet = mockSheet();
    const text = 'I recommend SWAP-SPARE-999.';
    const result = verifyResponse(text, 'SWAP-SPARE-999', sheet);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('SWAP-SPARE-999'))).toBe(true);
  });

  it('rejects hallucinated numbers', () => {
    const sheet = mockSheet();
    const text = 'This saves 9999 passengers and reduces delay by 42069 minutes.';
    const result = verifyResponse(text, 'CANCEL-DS0201', sheet);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('9999'))).toBe(true);
  });

  it('allows small common numbers', () => {
    const sheet = mockSheet();
    const text = 'Option 1 is the best of 3 alternatives.';
    const result = verifyResponse(text, 'CANCEL-DS0201', sheet);
    expect(result.passed).toBe(true);
  });

  it('allows numbers from the fact sheet', () => {
    const sheet = mockSheet();
    const text = 'The network has 70 flights and 16 aircraft. BOM closure delays 17 flights with total 1040 minutes.';
    const result = verifyResponse(text, 'CANCEL-DS0201', sheet);
    expect(result.passed).toBe(true);
  });

  it('passes with undefined option ID when no candidates exist', () => {
    const sheet = mockSheet({ options: [] });
    const text = 'No recovery needed.';
    const result = verifyResponse(text, undefined, sheet);
    expect(result.passed).toBe(true);
  });

  it('fails with undefined option ID when candidates exist', () => {
    const sheet = mockSheet();
    const text = 'No recovery needed.';
    const result = verifyResponse(text, undefined, sheet);
    expect(result.passed).toBe(false);
    expect(result.errors.some((e) => e.includes('No recommended option'))).toBe(true);
  });
});

