/**
 * Explicit text-generation models shared by the UI and server allowlist.
 * Google model IDs checked 2026-10-10: https://ai.google.dev/gemini-api/docs/models
 * Availability/quota for the deployment key still depends on Google; no fallback.
 * Keep the previously verified deployment model as the default.
 */
export const AI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash' },
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash (Preview)' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (Preview)' },
  { id: 'gemma-4-31b-it', label: 'Gemma 4 31B' },
] as const;

export type AiModelId = typeof AI_MODELS[number]['id'];
export const DEFAULT_AI_MODEL: AiModelId = 'gemini-3.5-flash';
/** Google troubleshooting, checked 15/10/2026: Gemini 3.6+ ignores sampling controls. */
export const supportsAiTemperature=(model:string)=>!/^gemini-(?:3\.(?:[6-9]|\d{2,})|[4-9])(?:[.-]|$)/.test(model);

/**
 * Removed from the picker 10/10/2026 but still present in saved prompt rows and caches.
 * Reading maps them to the current default instead of failing the whole prompt stock.
 */
export const LEGACY_AI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.6-flash'] as const;

export function isAiModelId(value: unknown): value is AiModelId {
  return typeof value === 'string' && AI_MODELS.some(model => model.id === value);
}

/** Current id, or a removed id mapped to the current default; undefined when unknown. */
export function normalizeAiModel(value: unknown): AiModelId | undefined {
  if (isAiModelId(value)) return value;
  return typeof value === 'string' && (LEGACY_AI_MODELS as readonly string[]).includes(value) ? DEFAULT_AI_MODEL : undefined;
}
