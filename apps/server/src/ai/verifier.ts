/**
 * AI Grounding Verifier.
 *
 * Before any AI-generated text reaches the user, every concrete value it
 * mentions is checked against the Facts Sheet produced by the deterministic
 * engine:
 *
 *   1. the recommended option must be one of the engine's candidates;
 *   2. every option ID, clock time, flight/tail/crew/connection ID and
 *      airport code must appear in the Facts Sheet;
 *   3. every number must equal a number in the Facts Sheet (numeric fields
 *      and numbers embedded in its strings). The only exception is option
 *      rank ordinals 1..N ("option 2").
 *
 * Tokens are consumed in that order so that, for example, the "09" and "30"
 * inside "09:30" are never mistaken for free-standing numbers.
 */
import type { FactSheet } from './factSheet.js';

export interface VerificationResult {
  passed: boolean;
  errors: string[];
  /** Number of individual values that were checked. */
  checkedCount: number;
}

const TIME_RE = /\b\d{1,2}:\d{2}(?:\+1)?/g;
const ENTITY_ID_RE = /\b(?:VT-[A-Z]{2}\d{2}|DS\d{4}|CR\d{2}|CX\d{2}|STBY-VT-[A-Z]{2}\d{2})\b/g;
const NUMBER_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;
const AIRPORT_RE = /\b[A-Z]{3}\b/g;

interface AllowedValues {
  optionIds: Set<string>;
  times: Set<string>;
  entityIds: Set<string>;
  numbers: Set<number>;
  airports: Set<string>;
}

function collectStrings(obj: unknown, out: string[]): void {
  if (typeof obj === 'string') out.push(obj);
  else if (Array.isArray(obj)) obj.forEach((v) => collectStrings(v, out));
  else if (obj !== null && typeof obj === 'object') Object.values(obj).forEach((v) => collectStrings(v, out));
}

function collectNumbers(obj: unknown, out: Set<number>): void {
  if (typeof obj === 'number' && Number.isFinite(obj)) {
    out.add(obj);
    out.add(Math.abs(obj));
  } else if (Array.isArray(obj)) obj.forEach((v) => collectNumbers(v, out));
  else if (obj !== null && typeof obj === 'object') Object.values(obj).forEach((v) => collectNumbers(v, out));
}

function parseNumber(token: string): number {
  return Number(token.replace(/,/g, ''));
}

/** Build the sets of values the AI is allowed to mention. */
export function allowedValues(sheet: FactSheet): AllowedValues {
  const optionIds = new Set(sheet.options.map((o) => o.optionId));
  // The airport-code list is reference data for the verifier, not a fact the
  // AI may cite, so it is excluded from the allowed strings.
  const { airportCodes: codeList, ...networkFacts } = sheet.network;
  const facts = { ...sheet, network: networkFacts };
  const strings: string[] = [];
  collectStrings(facts, strings);

  const times = new Set<string>();
  const entityIds = new Set<string>();
  const numbers = new Set<number>();
  const airportCodes = new Set(codeList);
  const airports = new Set<string>();

  collectNumbers(facts, numbers);
  for (let s of strings) {
    for (const id of optionIds) s = s.split(id).join(' ');
    for (const t of s.match(TIME_RE) ?? []) times.add(t.replace(/^(\d):/, '0$1:'));
    s = s.replace(TIME_RE, ' ');
    for (const id of s.match(ENTITY_ID_RE) ?? []) entityIds.add(id);
    s = s.replace(ENTITY_ID_RE, ' ');
    for (const code of s.match(AIRPORT_RE) ?? []) if (airportCodes.has(code)) airports.add(code);
    for (const n of s.match(NUMBER_RE) ?? []) numbers.add(parseNumber(n));
  }
  // Option rank ordinals ("option 1", "the 2nd alternative").
  for (let i = 1; i <= sheet.options.length; i++) numbers.add(i);
  return { optionIds, times, entityIds, numbers, airports };
}

/** Verify one piece of free text. Mutates `errors` and returns the number of checks. */
function verifyText(text: string, allowed: AllowedValues, airportCodes: Set<string>, errors: string[]): number {
  let checked = 0;
  let rest = text;

  for (const id of allowed.optionIds) {
    if (rest.includes(id)) {
      checked++;
      rest = rest.split(id).join(' ');
    }
  }
  for (const t of rest.match(TIME_RE) ?? []) {
    checked++;
    if (!allowed.times.has(t.replace(/^(\d):/, '0$1:'))) errors.push(`Time ${t} is not in the fact sheet`);
  }
  rest = rest.replace(TIME_RE, ' ');

  for (const id of rest.match(ENTITY_ID_RE) ?? []) {
    checked++;
    if (!allowed.entityIds.has(id)) errors.push(`Identifier ${id} is not in the fact sheet`);
  }
  rest = rest.replace(ENTITY_ID_RE, ' ');

  for (const code of rest.match(AIRPORT_RE) ?? []) {
    if (!airportCodes.has(code)) continue; // ordinary capitalised words
    checked++;
    if (!allowed.airports.has(code)) errors.push(`Airport ${code} is not part of this scenario`);
  }

  for (const token of rest.match(NUMBER_RE) ?? []) {
    checked++;
    if (!allowed.numbers.has(parseNumber(token))) errors.push(`Number ${token} is not in the fact sheet`);
  }
  return checked;
}

/**
 * Verify an AI answer: the recommended option plus every free-text field
 * (rationale and each trade-off).
 */
export function verifyResponse(
  texts: string | readonly string[],
  recommendedOptionId: string | null | undefined,
  sheet: FactSheet,
): VerificationResult {
  const errors: string[] = [];
  let checkedCount = 0;
  const allowed = allowedValues(sheet);
  const airportCodes = new Set(sheet.network.airportCodes);

  if (recommendedOptionId !== undefined && recommendedOptionId !== null) {
    checkedCount++;
    if (!allowed.optionIds.has(recommendedOptionId)) {
      errors.push(`Recommended option "${recommendedOptionId}" is not among the engine's candidates`);
    }
  } else if (sheet.options.length > 0) {
    checkedCount++;
    errors.push('No recommended option was given although candidates exist');
  }

  for (const text of typeof texts === 'string' ? [texts] : texts) {
    checkedCount += verifyText(text, allowed, airportCodes, errors);
  }
  return { passed: errors.length === 0, errors, checkedCount };
}
