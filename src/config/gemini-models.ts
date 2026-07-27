/**
 * Gemini Model Configuration
 *
 * Central catalog of all Gemini models available in the application.
 *
 * ── How to add a new model ──────────────────────────────────────────
 * 1. Add a new entry to the MODELS array below with all required fields.
 * 2. Set `available: true` and `deprecated: false`.
 * 3. To make it the new default, set `recommended: true` on the new entry
 *    and set `recommended: false` on the old default.
 * 4. The rest of the application (UI, API, validation) will pick it up
 *    automatically — no application logic changes needed.
 * ────────────────────────────────────────────────────────────────────
 */

export interface GeminiModel {
  id: string;
  displayName: string;
  description: string;
  generation: number;
  category: 'flash-lite' | 'flash' | 'pro';
  speed: 1 | 2 | 3 | 4 | 5;
  reasoning: 1 | 2 | 3 | 4 | 5;
  recommended: boolean;
  deprecated: boolean;
  available: boolean;
  bestFor: string;
  badges: string[];
}

const MODELS: GeminiModel[] = [
  {
    id: 'gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash-Lite',
    description: 'Balanced speed for general use',
    generation: 2.5,
    category: 'flash-lite',
    speed: 3,
    reasoning: 3,
    recommended: true,
    deprecated: false,
    available: true,
    bestFor: 'General-purpose question generation',
    badges: [],
  },
  {
    id: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    description: 'Strong reasoning at good speed',
    generation: 2.5,
    category: 'flash',
    speed: 3,
    reasoning: 4,
    recommended: false,
    deprecated: false,
    available: true,
    bestFor: 'Complex question generation with reasoning',
    badges: [],
  },
  {
    id: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    description: 'Highest quality reasoning',
    generation: 2.5,
    category: 'pro',
    speed: 2,
    reasoning: 5,
    recommended: false,
    deprecated: false,
    available: true,
    bestFor: 'Most challenging content, maximum accuracy',
    badges: ['🧠 Best Reasoning'],
  },
];

const CATEGORY_ORDER: Record<string, number> = {
  'flash-lite': 0,
  'flash': 1,
  'pro': 2,
};

function sortModels(a: GeminiModel, b: GeminiModel): number {
  if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
  if (a.generation !== b.generation) return b.generation - a.generation;
  return (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99);
}

export function getAvailableModels(): GeminiModel[] {
  return MODELS
    .filter(m => m.available && !m.deprecated)
    .sort(sortModels);
}

export function getRecommendedModel(): GeminiModel {
  const model = MODELS.find(m => m.recommended && m.available && !m.deprecated);
  if (!model) {
    const fallback = MODELS.find(m => m.available && !m.deprecated);
    if (!fallback) throw new Error('No available Gemini models configured');
    return fallback;
  }
  return model;
}

export function getModel(id: string): GeminiModel | undefined {
  return MODELS.find(m => m.id === id);
}

export function resolveModel(modelId: string | undefined | null): string {
  if (!modelId) return getRecommendedModel().id;
  const model = getModel(modelId);
  if (!model || model.deprecated || !model.available) {
    if (modelId) {
      console.warn(`[GeminiModels] Unknown or unavailable model "${modelId}", falling back to "${getRecommendedModel().id}"`);
    }
    return getRecommendedModel().id;
  }
  return model.id;
}
