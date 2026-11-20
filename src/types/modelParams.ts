/** Generation settings sent to Ollama's /api/chat `options` (+ optional system prompt). */
export interface ModelParameters {
  // Basic
  temperature: number;
  topP: number;
  topK: number;
  /** Max tokens to generate. -1 = model default / unlimited. */
  numPredict: number;
  systemPrompt: string;

  // Advanced
  /** Context window size in tokens. */
  numCtx: number;
  repeatPenalty: number;
  repeatLastN: number;
  presencePenalty: number;
  frequencyPenalty: number;
  minP: number;
  typicalP: number;
  /** 0 = disabled, 1 = Mirostat, 2 = Mirostat 2.0 */
  mirostat: number;
  mirostatTau: number;
  mirostatEta: number;
  /** -1 = random seed */
  seed: number;
  /** Comma-separated stop strings. */
  stop: string;
}

export const DEFAULT_MODEL_PARAMETERS: ModelParameters = {
  temperature: 0.8,
  topP: 0.9,
  topK: 40,
  numPredict: -1,
  systemPrompt: "",
  numCtx: 4096,
  repeatPenalty: 1.1,
  repeatLastN: 64,
  presencePenalty: 0,
  frequencyPenalty: 0,
  minP: 0,
  typicalP: 1,
  mirostat: 0,
  mirostatTau: 5,
  mirostatEta: 0.1,
  seed: -1,
  stop: "",
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
    temperature: clamp(
      Number(source.temperature ?? DEFAULT_MODEL_PARAMETERS.temperature),
      0,
      2,
    ),
    topP: clamp(Number(source.topP ?? DEFAULT_MODEL_PARAMETERS.topP), 0, 1),
    topK: Math.round(
      clamp(Number(source.topK ?? DEFAULT_MODEL_PARAMETERS.topK), 1, 100),
    ),
    numPredict: Math.round(
      clamp(
        Number(source.numPredict ?? DEFAULT_MODEL_PARAMETERS.numPredict),
        -1,
        8192,
      ),
    ),
    systemPrompt:
      typeof source.systemPrompt === "string"
        ? source.systemPrompt
        : DEFAULT_MODEL_PARAMETERS.systemPrompt,
    numCtx: Math.round(
      clamp(Number(source.numCtx ?? DEFAULT_MODEL_PARAMETERS.numCtx), 512, 131072),
    ),
    repeatPenalty: clamp(
      Number(source.repeatPenalty ?? DEFAULT_MODEL_PARAMETERS.repeatPenalty),
      0,
      2,
    ),
    repeatLastN: Math.round(
      clamp(
        Number(source.repeatLastN ?? DEFAULT_MODEL_PARAMETERS.repeatLastN),
        -1,
        2048,
      ),
    ),
    presencePenalty: clamp(
      Number(source.presencePenalty ?? DEFAULT_MODEL_PARAMETERS.presencePenalty),
      -2,
      2,
    ),
    frequencyPenalty: clamp(
      Number(
        source.frequencyPenalty ?? DEFAULT_MODEL_PARAMETERS.frequencyPenalty,
      ),
      -2,
      2,
    ),
    minP: clamp(Number(source.minP ?? DEFAULT_MODEL_PARAMETERS.minP), 0, 1),
    typicalP: clamp(
      Number(source.typicalP ?? DEFAULT_MODEL_PARAMETERS.typicalP),
      0,
      1,
    ),
    mirostat: Math.round(
      clamp(Number(source.mirostat ?? DEFAULT_MODEL_PARAMETERS.mirostat), 0, 2),
    ),
    mirostatTau: clamp(
      Number(source.mirostatTau ?? DEFAULT_MODEL_PARAMETERS.mirostatTau),
      0,
      10,
    ),
    mirostatEta: clamp(
      Number(source.mirostatEta ?? DEFAULT_MODEL_PARAMETERS.mirostatEta),
      0,
      1,
    ),
    seed: Math.round(
      clamp(Number(source.seed ?? DEFAULT_MODEL_PARAMETERS.seed), -1, 2_147_483_647),
    ),
    stop:
      typeof source.stop === "string"
        ? source.stop
        : DEFAULT_MODEL_PARAMETERS.stop,
  };
}

export function loadModelParameters(): ModelParameters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MODEL_PARAMETERS };
    return normalizeModelParameters(
      JSON.parse(raw) as Partial<ModelParameters>,
    );
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

function parseStopSequences(stop: string): string[] {
  return stop
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Shape expected by Ollama chat `options`. */
export function toOllamaOptions(
  params: ModelParameters,
): Record<string, number | string[]> {
  const normalized = normalizeModelParameters(params);
  const options: Record<string, number | string[]> = {
    temperature: normalized.temperature,
    top_p: normalized.topP,
    top_k: normalized.topK,
    num_ctx: normalized.numCtx,
    repeat_penalty: normalized.repeatPenalty,
    repeat_last_n: normalized.repeatLastN,
    presence_penalty: normalized.presencePenalty,
    frequency_penalty: normalized.frequencyPenalty,
    min_p: normalized.minP,
    typical_p: normalized.typicalP,
    mirostat: normalized.mirostat,
    mirostat_tau: normalized.mirostatTau,
    mirostat_eta: normalized.mirostatEta,
  };

  if (normalized.numPredict >= 0) {
    options.num_predict = normalized.numPredict;
  }
  if (normalized.seed >= 0) {
    options.seed = normalized.seed;
  }

  const stops = parseStopSequences(normalized.stop);
  if (stops.length > 0) {
    options.stop = stops;
  }

  return options;
}
