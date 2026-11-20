/** Gemini selects an engine-scored option. Displayed metrics and explanations
 * are rendered from that option's fact sheet for both AI and fallback paths. */
import { z } from 'zod';
import type { FactSheet } from './factSheet.js';
import { fallbackExplanation } from './fallback.js';
import { verifyResponse, type VerificationResult } from './verifier.js';

export interface AiRecommendation {
  recommendedOptionId: string | null;
  rationale: string;
  tradeoffs: string[];
  /** True when the engine selected the option without Gemini. */
  isAiFallback: boolean;
  /** Why the AI answer was not used (null when it was used or AI is disabled). */
  fallbackReason: string | null;
  /** Verification of the text that is actually displayed. */
  verification: VerificationResult;
  model: string | null;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

/** Shape the model must return (also sent to Gemini as the response schema). */
const AiAnswerSchema = z.object({
  recommendedOptionId: z.string().min(1).max(200),
}).strict();
type AiAnswer = z.infer<typeof AiAnswerSchema>;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recommendedOptionId: { type: 'STRING' },
  },
  required: ['recommendedOptionId'],
};

export const SYSTEM_PROMPT = `Select one improving recovery option from the supplied flight-disruption fact sheet.
Consider the weighted score, stranded passengers, delay, and cancellations. Return only its exact recommendedOptionId.
The application will explain your selection using the engine's figures.`;

function buildUserPrompt(sheet: FactSheet): string {
  const { airportCodes: _codes, ...network } = sheet.network;
  return `Fact sheet:\n${JSON.stringify({ ...sheet, network })}`;
}

async function callGemini(config: GeminiConfig, sheet: FactSheet): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      // The key travels in a header, never in the URL (URLs end up in logs).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: buildUserPrompt(sheet) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.1,
          maxOutputTokens: 1024,
        },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty Gemini response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function parseAiAnswer(text: string): AiAnswer {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return AiAnswerSchema.parse(JSON.parse(cleaned));
}

function fallback(sheet: FactSheet, model: string | null, reason: string | null): AiRecommendation {
  const fb = fallbackExplanation(sheet);
  return {
    recommendedOptionId: fb.recommendedOptionId,
    rationale: fb.rationale,
    tradeoffs: fb.tradeoffs,
    isAiFallback: true,
    fallbackReason: reason,
    verification: verifyResponse([fb.rationale, ...fb.tradeoffs], fb.recommendedOptionId, sheet),
    model,
  };
}

type GeminiCaller = (config: GeminiConfig, sheet: FactSheet) => Promise<string>;

export async function getAiRecommendation(
  config: GeminiConfig | null,
  sheet: FactSheet,
  caller: GeminiCaller = callGemini,
): Promise<AiRecommendation> {
  if (!config) return fallback(sheet, null, null);
  if (sheet.options.length === 0) return fallback(sheet, config.model, 'No improving recovery option exists');

  const MAX_ATTEMPTS = 2;
  let lastError = 'Unknown error';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const answer = parseAiAnswer(await caller(config, sheet));
      const option = sheet.options.find(o => o.optionId === answer.recommendedOptionId);
      if (!option) throw new Error('Unknown recovery option');
      const explanation = fallbackExplanation(sheet, option);
      return {
        ...explanation,
        verification: verifyResponse([explanation.rationale, ...explanation.tradeoffs], option.optionId, sheet),
        isAiFallback: false,
        fallbackReason: null,
        model: config.model,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    console.warn(`[ai] attempt ${attempt} rejected: ${lastError}`);
  }
  return fallback(sheet, config.model, lastError);
}
