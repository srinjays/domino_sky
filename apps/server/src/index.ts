/**
 * Server entry point: validate configuration, load and integrity-check the
 * dataset once, then start listening. Fails fast on any startup problem.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { loadDatasetFromFile } from './data.js';
import { createApp } from './app.js';

const config = loadConfig({ NODE_ENV: import.meta.url.includes('/dist/') ? 'production' : 'development', ...process.env });

const datasetPath = resolve(process.cwd(), config.datasetPath);
if (!existsSync(datasetPath)) {
  console.error(`[startup] Dataset not found at ${datasetPath}. Set DATASET_PATH or run from the repo root.`);
  process.exit(1);
}

const { dataset, warnings } = loadDatasetFromFile(datasetPath);
for (const w of warnings) console.warn(`[dataset] warning: ${w.message}`);
console.log(
  `[dataset] "${dataset.meta.name}": ${dataset.airports.length} airports, ${dataset.aircraft.length} aircraft, ` +
    `${dataset.flights.length} flights, ${dataset.connections.length} connections, ` +
    `${dataset.crews.length} crews, ${dataset.spareAircraft.length} spares`,
);

const app = createApp(dataset, config);
const server = app.listen(config.port, () => {
  console.log(
    `[server] Domino Sky listening on http://localhost:${config.port} (${config.env}) - ` +
      (config.ai ? `AI enabled (${config.ai.provider}, ${config.ai.model})` : 'AI disabled, deterministic explanations only'),
  );
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
