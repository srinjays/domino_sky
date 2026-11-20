/**
 * Environment configuration, validated at startup. Secrets are read only
 * from the environment and never sent to the client or written to logs.
 */
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { z } from 'zod';

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9._-]+$/, 'Invalid model name')
    .default('gemini-2.5-flash'),
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  DATASET_PATH: z.string().default('data/dataset.json'),
  STATIC_DIR: z.string().default('apps/web/dist'),
});

export interface AppConfig {
  trustProxyHops: number;
  port: number;
  env: 'development' | 'production' | 'test';
  geminiApiKey: string | null;
  geminiModel: string;
  aiTimeoutMs: number;
  corsOrigins: string[];
  datasetPath: string;
  staticDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid configuration: ${fields}`);
  }
  const c = parsed.data;
  return {
    trustProxyHops: c.TRUST_PROXY_HOPS,
    port: c.PORT,
    env: c.NODE_ENV,
    geminiApiKey: c.GEMINI_API_KEY ? c.GEMINI_API_KEY : null,
    geminiModel: c.GEMINI_MODEL,
    aiTimeoutMs: c.AI_TIMEOUT_MS,
    corsOrigins: c.CORS_ORIGINS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    datasetPath: resolve(projectRoot, c.DATASET_PATH),
    staticDir: resolve(projectRoot, c.STATIC_DIR),
  };
}

