/**
 * Deterministic fallback explanation, used when the AI is disabled,
 * unavailable, or its answer fails the grounding check. Every value is copied
 * from the Facts Sheet, so this text always passes the verifier (enforced by
 * tests).
 */
import type { FactOption, FactSheet } from './factSheet.js';

export interface FallbackExplanation {
  recommendedOptionId: string | null;
  rationale: string;
  tradeoffs: string[];
}

/** Lowest score wins; ties go to fewer cancellations, then option order. */
export function bestOption(options: readonly FactOption[]): FactOption | null {
  let best: FactOption | null = null;
  for (const o of options) {
    if (!best || o.score < best.score || (o.score === best.score && o.after.cancelledFlights < best.after.cancelledFlights)) {
      best = o;
    }
  }
  return best;
}

export function fallbackExplanation(sheet: FactSheet, best = bestOption(sheet.options)): FallbackExplanation {
  const b = sheet.baseline;
  const closureDesc = sheet.scenario.closures
    .map((c) => `${c.city} (${c.airport}) closed from ${c.start} to ${c.end} (${c.durationMin} min)`)
    .join('; ');

  const lines: string[] = [
    `**Disruption:** ${closureDesc}.`,
    '',
    `**Impact:** ${b.delayedFlights} flights delayed (${b.totalDelayMin} delay minutes in total), ` +
      `${b.cancelledFlights} cancelled, ${b.knockOnFlights} knock-on flights at airports that were open, ` +
      `${b.strandedPax} passengers stranded, ${b.brokenConnections} broken connections, ` +
      `${b.crewDutyBreaches} crew duty breaches.`,
  ];

  if (best) {
    lines.push('', `**Recommended action:** ${best.description}.`);
    const r = best.reduction;
    const improvements: string[] = [];
    if (r.strandedPax > 0) improvements.push(`${r.strandedPax} fewer stranded passengers`);
    if (r.totalDelayMin > 0) improvements.push(`${r.totalDelayMin} fewer delay minutes`);
    if (r.cancelledFlights > 0) improvements.push(`${r.cancelledFlights} fewer cancellations`);
    if (r.brokenConnections > 0) improvements.push(`${r.brokenConnections} fewer broken connections`);
    if (improvements.length > 0) lines.push(`Result: ${improvements.join(', ')}.`);
    lines.push(`Disruption score falls from ${b.score} to ${best.score} (improvement ${best.scoreImprovement}).`);
  } else {
    lines.push('', 'No recovery action improves on the disrupted schedule, so none is recommended.');
  }

  if (sheet.mostAffectedFlights.length > 0) {
    lines.push('', '**Most affected flights:**');
    for (const f of sheet.mostAffectedFlights) {
      const delay = f.status === 'CANCELLED' ? '' : `, ${f.delayMin} min late`;
      lines.push(`- ${f.flightId} (${f.route}, scheduled ${f.scheduledDeparture}): ${f.status}${delay}. ${f.why}`);
    }
  }

  const tradeoffs: string[] = [];
  if (best && best.reduction.cancelledFlights < 0) {
    tradeoffs.push(`Adds ${Math.abs(best.reduction.cancelledFlights)} cancellation(s) to protect the rest of the network.`);
  }
  if (best && best.reduction.totalDelayMin < 0) {
    tradeoffs.push(`Total delay rises by ${Math.abs(best.reduction.totalDelayMin)} minutes.`);
  }
  const alternative = sheet.options.find((o) => o !== best);
  if (alternative) tradeoffs.push(`Alternative: ${alternative.description} (score ${alternative.score}).`);

  return { recommendedOptionId: best?.optionId ?? null, rationale: lines.join('\n'), tradeoffs };
}
