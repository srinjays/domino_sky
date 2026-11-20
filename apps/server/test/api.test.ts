import { expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { loadDatasetFromFile } from '../src/data.js';
import { getAiRecommendation } from '../src/ai/dispatcher.js';
import type { ExplainResponse } from '../src/routes.js';

const config = loadConfig({NODE_ENV:'test'});
const app = createApp(loadDatasetFromFile(config.datasetPath).dataset, config);

it('uses Groq when both keys are configured and grounds the returned plan', async () => {
  const settings = loadConfig({ NODE_ENV: 'test', GROQ_API_KEY: 'groq-test', GEMINI_API_KEY: 'gemini-test' });
  const service = createApp(loadDatasetFromFile(settings.datasetPath).dataset, settings);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({
    choices: [{ message: { content: '{"recommendedOptionId":"PLAN"}' } }],
  }));
  try {
    const res = await request(service).post('/api/v1/recover/explain')
      .send({ closures: [{ airport: 'BOM', start: '08:00', end: '09:30' }] }).expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer groq-test' } });
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'openai/gpt-oss-20b' });
    expect(res.body.recommendation).toMatchObject({ provider: 'groq', isAiFallback: false });
    expect(res.body.recommended.score).toBe(675);
  } finally { fetchMock.mockRestore(); }
});

it('returns the engine plan on Groq quota exhaustion without an immediate retry', async () => {
  const settings = loadConfig({ NODE_ENV: 'test', GROQ_API_KEY: 'groq-test' });
  const service = createApp(loadDatasetFromFile(settings.datasetPath).dataset, settings);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 429 }));
  try {
    const res = await request(service).post('/api/v1/recover/explain')
      .send({ closures: [{ airport: 'BOM', start: '08:00', end: '09:30' }] }).expect(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.body.recommendation).toMatchObject({ isAiFallback: true, recommendedOptionId: 'PLAN' });
    expect(res.body.recommended.score).toBe(675);
  } finally { fetchMock.mockRestore(); }
});

it('rejects invalid engine input as a client error', async () => {
  const res = await request(app).post('/api/v1/simulate').send({closures:[]}).expect(400);
  expect(res.body.details[0].path).toBe('closures');
});

it('counts rejected request bodies toward the production explanation limit', async () => {
  const production = createApp(loadDatasetFromFile(config.datasetPath).dataset, { ...config, env: 'production' });
  const submit = () => request(production).post('/api/v1/recover/explain').type('json').send('{');
  for (let i = 0; i < 15; i++) {
    await submit().expect(400, { error: 'Malformed request body' });
  }
  await submit().expect(429).expect('Retry-After', /^\d+$/);
  await request(production).get('/api/health').expect(200);
});

it('rejects oversized JSON with a bounded public error', async () => {
  await request(app).post('/api/v1/simulate').send({ note: 'x'.repeat(32 * 1024) })
    .expect(413, { error: 'Request body too large' });
});

it('keeps provider diagnostics private and uses the engine plan after both attempts fail', async () => {
  const scenario = { closures: [{ airport: 'BOM', start: '08:00', end: '09:30' }] };
  const response = await request(app).post('/api/v1/recover/explain').send(scenario).expect(200);
  const sheet = (response.body as ExplainResponse).factSheet;
  const marker = 'private-test-diagnostic';
  const provider = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(marker));
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const result = await getAiRecommendation({ provider: 'gemini', apiKey: 'test-key', model: 'test', timeoutMs: 1000 }, sheet);
    expect(provider).toHaveBeenCalledTimes(2);
    for (const [url, options] of provider.mock.calls) {
      expect(String(url)).toBe('https://generativelanguage.googleapis.com/v1beta/models/test:generateContent');
      expect(options).toMatchObject({ redirect: 'error', headers: { 'x-goog-api-key': 'test-key' } });
    }
    expect(result).toMatchObject({
      recommendedOptionId: 'PLAN', isAiFallback: true, fallbackReason: 'Recovery provider unavailable',
    });
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(JSON.stringify(warnings.mock.calls)).not.toContain(marker);
  } finally {
    provider.mockRestore();
    warnings.mockRestore();
  }
});

it('grounds the displayed explanation in the particular option selected by the model', async () => {
  const res = await request(app).post('/api/v1/recover/explain').send({closures:[{airport:'BOM',start:'08:00',end:'09:30'}]}).expect(200);
  const { recommended, factSheet } = res.body as ExplainResponse;
  expect(recommended?.optionId).toBe('PLAN');
  expect(recommended?.score).toBe(675);
  const option = factSheet.options[0]!;
  const fakeConfig = {provider:'gemini', apiKey:'test', model:'test', timeoutMs:1000} as const;
  const chosen = await getAiRecommendation(fakeConfig, factSheet, async () => JSON.stringify({recommendedOptionId:option.optionId}));
  expect(chosen.isAiFallback).toBe(false);
  expect(chosen.rationale).toContain(option.description);
  expect(chosen.rationale).toContain('to ' + option.score + ' (improvement');
  const invalid = await getAiRecommendation(fakeConfig, factSheet, async () => JSON.stringify({recommendedOptionId:option.optionId,rationale:'16 passengers stranded.'}));
  expect(invalid.isAiFallback).toBe(true);
  expect(invalid.rationale).not.toContain('16 passengers stranded.');
});
