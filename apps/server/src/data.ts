/** Loads and validates the dataset file once at startup. */
import { readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { loadDataset, type Dataset, type IntegrityIssue } from '@domino/engine';

export function loadDatasetFromFile(path: string, cwd: string = process.cwd()): {
  dataset: Dataset;
  warnings: IntegrityIssue[];
} {
  const full = isAbsolute(path) ? path : resolve(cwd, path);
  const raw: unknown = JSON.parse(readFileSync(full, 'utf8'));
  return loadDataset(raw);
}

