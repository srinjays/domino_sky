/**
 * Express application factory. Kept separate from the entry point so the
 * full HTTP stack (security middleware, validation, routes, error handling)
 * can be exercised in integration tests without opening a port.
 */
import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Dataset } from '@domino/engine';
import type { AppConfig } from './config.js';
import { createRouter } from './routes.js';
import { errorHandler, notFoundHandler } from './errors.js';

export function createApp(dataset: Dataset, config: AppConfig): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(
    cors({
      origin: config.env === 'production' ? false : config.corsOrigins,
      methods: ['GET', 'POST'],
      maxAge: 86400,
    }),
  );
  app.use(express.json({ limit: '32kb', strict: true }));

  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60_000,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again shortly' },
    });
  app.use('/api', limiter(config.env === 'test' ? 10_000 : 120));
  app.use('/api/v1/recover/explain', limiter(config.env === 'test' ? 10_000 : 15));

  app.use(createRouter(dataset, config));
  app.use('/api', notFoundHandler);

  // In production the same process serves the built single-page UI.
  const staticDir = resolve(process.cwd(), config.staticDir);
  if (config.env === 'production' && existsSync(staticDir)) {
    app.use(express.static(staticDir, { maxAge: '1h', index: false }));
    // Express 5 wildcard syntax: any non-API path falls back to the SPA shell.
    app.get('/{*splat}', (_req, res) => res.sendFile(resolve(staticDir, 'index.html')));
  }

  app.use(errorHandler(config.env === 'production'));
  return app;
}

