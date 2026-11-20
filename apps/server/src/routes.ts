/**
 * Express API routes. Every request body is validated with a strict Zod
 * schema before it reaches the engine; validation and engine errors (thrown
 * synchronously or as rejected promises, which Express 5 forwards natively)
 * are turned into structured JSON by the global error handler.
 */
import { Router } from 'express';
import {
  SimulateRequestSchema,
  RecoverRequestSchema,
  simulate,
  closureFromInput,
  actionFromInput,
  recommendFromBaseline,
  type Dataset,
  type RecoveryAction,
  type RecoveryReport,
  type SimulationResult,
} from '@domino/engine';
import { buildFactSheet, PLAN_OPTION_ID, type FactSheet } from './ai/factSheet.js';
import { getAiRecommendation, type AiRecommendation } from './ai/dispatcher.js';
import { LruCache } from './cache.js';
import type { AppConfig } from './config.js';

export interface ExplainResponse {
  recommendation: AiRecommendation;
  factSheet: FactSheet;
  report: RecoveryReport;
  /** The recommended option re-simulated in full, for the before/after view. */
  recommended: { optionId: string; score: number; description: string; actions: RecoveryAction[]; result: SimulationResult } | null;
}

export function createRouter(dataset: Dataset, config: AppConfig): Router {
  const router = Router();
  const recoverCache = new LruCache<{baseline: SimulationResult; report: RecoveryReport}>(64);
  const explainCache = new LruCache<ExplainResponse>(64);

  // The network never changes at runtime, so serialise it once.
  const networkPayload = JSON.stringify({
    meta: dataset.meta,
    rules: dataset.rules,
    airports: dataset.airports,
    aircraft: dataset.aircraft,
    flights: dataset.flights,
    connections: dataset.connections,
    crews: dataset.crews,
    spareAircraft: dataset.spareAircraft,
    rotations: Object.fromEntries(dataset.index.rotation),
  });

  function getReport(key: string, closures: ReturnType<typeof closureFromInput>[], weights: RecoveryReport['weights']) {
    let entry = recoverCache.get(key);
    if (!entry) {
      const baseline = simulate(dataset, { closures });
      entry = { baseline, report: recommendFromBaseline(dataset, baseline, weights) };
      recoverCache.set(key, entry);
    }
    return entry;
  }

  router.get('/api/v1/network', (_req, res) => {
    res.type('application/json').set('Cache-Control', 'public, max-age=300').send(networkPayload);
  });

  router.post('/api/v1/simulate', (req, res) => {
    const parsed = SimulateRequestSchema.parse(req.body);
    const result = simulate(dataset, {
      closures: parsed.closures.map(closureFromInput),
      actions: parsed.actions.map(actionFromInput),
    });
    res.json(result);
  });

  router.post('/api/v1/recover', (req, res) => {
    const parsed = RecoverRequestSchema.parse(req.body);
    res.json(getReport(JSON.stringify(parsed), parsed.closures.map(closureFromInput), parsed.weights).report);
  });

  router.post('/api/v1/recover/explain', async (req, res) => {
      const parsed = RecoverRequestSchema.parse(req.body);
      const key = JSON.stringify(parsed);
      const cached = explainCache.get(key);
      if (cached) {
        res.json(cached);
        return;
      }
      const closures = parsed.closures.map(closureFromInput);
      const { baseline, report } = getReport(key, closures, parsed.weights);
      const sheet = buildFactSheet(dataset, closures, baseline, report);
      const recommendation = await getAiRecommendation(config.ai, sheet);

      let recommended: ExplainResponse['recommended'] = null;
      const id = recommendation.recommendedOptionId;
      if (id === PLAN_OPTION_ID && report.plan.actions.length > 0) {
        recommended = {
          optionId: id,
          score: report.plan.score,
          description: sheet.options.find((o) => o.optionId === id)?.description ?? 'Combined plan',
          actions: report.plan.actions,
          result: simulate(dataset, { closures, actions: report.plan.actions }),
        };
      } else if (id) {
        const candidate = report.candidates.find((c) => c.id === id);
        if (candidate) {
          recommended = {
            optionId: id,
            score: candidate.score,
            description: candidate.description,
            actions: [candidate.action],
            result: simulate(dataset, { closures, actions: [candidate.action] }),
          };
        }
      }

      const body: ExplainResponse = { recommendation, factSheet: sheet, report, recommended };
      explainCache.set(key, body);
      res.json(body);
  });

  router.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      dataset: dataset.meta.name,
      flights: dataset.flights.length,
      airports: dataset.airports.length,
      aircraft: dataset.aircraft.length,
      aiEnabled: config.ai !== null,
    });
  });

  return router;
}
