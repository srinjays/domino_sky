import { expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { loadDatasetFromFile } from '../src/data.js';
import { getAiRecommendation } from '../src/ai/dispatcher.js';
import type { ExplainResponse } from '../src/routes.js';

const config = loadConfig({NODE_ENV:'test'});
const app = createApp(loadDatasetFromFile(config.datasetPath).dataset, config);

it('rejects invalid engine input as a client error', async () => {
  const res = await request(app).post('/api/v1/simulate').send({closures:[]}).expect(400);
  expect(res.body.details[0].path).toBe('closures');
});

it('grounds the displayed explanation in the particular option selected by the model', async () => {
  const res = await request(app).post('/api/v1/recover/explain').send({closures:[{airport:'BOM',start:'08:00',end:'09:30'}]}).expect(200);
  const { recommended, factSheet } = res.body as ExplainResponse;
  expect(recommended?.optionId).toBe('PLAN');
  expect(recommended?.score).toBe(675);
  const option = factSheet.options[0]!;
  const fakeConfig = {apiKey:'test', model:'test', timeoutMs:1000};
  const chosen = await getAiRecommendation(fakeConfig, factSheet, async () => JSON.stringify({recommendedOptionId:option.optionId}));
  expect(chosen.isAiFallback).toBe(false);
  expect(chosen.rationale).toContain(option.description);
  expect(chosen.rationale).toContain('to ' + option.score + ' (improvement');
  const invalid = await getAiRecommendation(fakeConfig, factSheet, async () => JSON.stringify({recommendedOptionId:option.optionId,rationale:'16 passengers stranded.'}));
  expect(invalid.isAiFallback).toBe(true);
  expect(invalid.rationale).not.toContain('16 passengers stranded.');
});
