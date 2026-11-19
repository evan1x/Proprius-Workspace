/** Generation settings sent to Ollama's /api/chat `options` (+ optional system prompt). */
export interface ModelParameters {
  temperature: number;
  topP: number;
  topK: number;
  /** Max tokens to generate. -1 = model default / unlimited. */
  numPredict: number;
  /** Context window size in tokens. */
  numCtx: number;
  systemPrompt: string;
}

export const DEFAULT_MODEL_PARAMETERS: ModelParameters = {
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
  numPredict: -1,
  numCtx: 4096,
  systemPrompt: "",
};

const STORAGE_KEY = "proprius.modelParameters";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function normalizeModelParameters(
  value: Partial<ModelParameters> | null | undefined,
): ModelParameters {
  const source = value ?? {};
  return {
    temperature: clamp(Number(source.temperature ?? DEFAULT_MODEL_PARAMETERS.temperature), 0, 2),
    topP: clamp(Number(source.topP ?? DEFAULT_MODEL_PARAMETERS.topP), 0, 1),
    topK: Math.round(
      clamp(Number(source.topK ?? DEFAULT_MODEL_PARAMETERS.topK), 1, 100),
    ),
    numPredict: Math.round(
      clamp(Number(source.numPredict ?? DEFAULT_MODEL_PARAMETERS.numPredict), -1, 8192),
    ),
    numCtx: Math.round(
      clamp(Number(source.numCtx ?? DEFAULT_MODEL_PARAMETERS.numCtx), 512, 131072),
    ),
    systemPrompt:
      typeof source.systemPrompt === "string"
        ? source.systemPrompt
        : DEFAULT_MODEL_PARAMETERS.systemPrompt,
  };
}

export function loadModelParameters(): ModelParameters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MODEL_PARAMETERS };
    return normalizeModelParameters(JSON.parse(raw) as Partial<ModelParameters>);
  } catch {
    return { ...DEFAULT_MODEL_PARAMETERS };
  }
}

export function saveModelParameters(params: ModelParameters): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(normalizeModelParameters(params)),
    );
  } catch {
    // ignore storage failures
  }
}

/** Shape expected by Ollama chat `options`. */
export function toOllamaOptions(params: ModelParameters): Record<string, number> {
  const normalized = normalizeModelParameters(params);
  const options: Record<string, number> = {
    temperature: normalized.temperature,
    top_p: normalized.topP,
    top_k: normalized.topK,
    num_ctx: normalized.numCtx,
  };
  if (normalized.numPredict >= 0) {
    options.num_predict = normalized.numPredict;
  }
  return options;
}
