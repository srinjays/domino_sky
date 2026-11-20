/**
 * Global error handling. Validation and engine errors map to 400 with a
 * structured body; anything else is a 500 whose details are only exposed
 * outside production. Stack traces are never sent to clients.
 */
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from '@domino/engine';
import { DatasetError, ScenarioError } from '@domino/engine';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not found' });
}

export const errorHandler = (isProd: boolean) => (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof ScenarioError) {
    res.status(400).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof DatasetError) {
    res.status(400).json({ error: err.message, details: err.issues.map((i) => i.message) });
    return;
  }
  // Malformed JSON bodies and oversized payloads from express.json().
  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    res.status(status).json({ error: status === 413 ? 'Request body too large' : 'Malformed request body' });
    return;
  }

  console.error('[error]', err);
  res.status(500).json({
    error: !isProd && err instanceof Error ? err.message : 'Internal server error',
  });
}
