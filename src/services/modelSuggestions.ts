import type { HardwareInfo } from "./hardware";

export type FitLevel = "excellent" | "good" | "tight";

export interface ModelSuggestion {
  /** Full Ollama model name, e.g. llama3.2:3b */
  name: string;
  baseName: string;
  /** Parameter tag shown to the user (1b, 3b, 7b, …) */
  parameterSize: string;
  /** Approximate download / on-disk size */
  fileSizeLabel: string;
  /** Approximate size in bytes for scoring */
  fileSizeBytes: number;
  fit: FitLevel;
  fitLabel: string;
  reason: string;
  description: string;
}

interface CatalogEntry {
  name: string;
  baseName: string;
  parameterSize: string;
  /** Approximate Q4_K_M-class download size in GB */
  fileSizeGb: number;
  /** Soft minimum total system RAM to attempt a run */
  minRamGb: number;
  /** Comfortable total RAM for usable speed */
  preferredRamGb: number;
  description: string;
  benefitsFromGpu: boolean;
}

/**
 * Curated Ollama library picks with approximate parameter + disk sizes.
 * Sizes are typical default (quantized) pulls from ollama.com.
 */
const CATALOG: CatalogEntry[] = [
  {
    name: "llama3.2:1b",
    baseName: "llama3.2",
    parameterSize: "1B",
    fileSizeGb: 1.3,
    minRamGb: 4,
    preferredRamGb: 6,
    description: "Very small Llama 3.2 — fast on modest machines.",
    benefitsFromGpu: false,
  },
  {
    name: "llama3.2:3b",
    baseName: "llama3.2",
    parameterSize: "3B",
    fileSizeGb: 2.0,
    minRamGb: 6,
    preferredRamGb: 8,
    description: "Balanced small model for everyday chat.",
    benefitsFromGpu: false,
  },
  {
    name: "phi3:mini",
    baseName: "phi3",
    parameterSize: "3.8B",
    fileSizeGb: 2.3,
    minRamGb: 6,
    preferredRamGb: 10,
    description: "Compact Microsoft Phi-3 Mini with strong reasoning for its size.",
    benefitsFromGpu: false,
  },
  {
    name: "mistral:7b",
    baseName: "mistral",
    parameterSize: "7B",
    fileSizeGb: 4.1,
    minRamGb: 10,
    preferredRamGb: 16,
    description: "Popular 7B general-purpose model.",
    benefitsFromGpu: true,
  },
  {
    name: "llama3.1:8b",
    baseName: "llama3.1",
    parameterSize: "8B",
    fileSizeGb: 4.7,
    minRamGb: 12,
    preferredRamGb: 16,
    description: "Strong all-rounder when you have mid-range RAM or a GPU.",
    benefitsFromGpu: true,
  },
  {
    name: "gemma2:9b",
    baseName: "gemma2",
    parameterSize: "9B",
    fileSizeGb: 5.4,
    minRamGb: 14,
    preferredRamGb: 20,
    description: "Google Gemma 2 — capable chat model for stronger machines.",
    benefitsFromGpu: true,
  },
  {
    name: "qwen2.5:14b",
    baseName: "qwen2.5",
    parameterSize: "14B",
    fileSizeGb: 9.0,
    minRamGb: 20,
    preferredRamGb: 32,
    description: "Larger Qwen 2.5 — best with plenty of RAM or a discrete GPU.",
    benefitsFromGpu: true,
  },
];

const GB = 1024 * 1024 * 1024;

function bytesToGb(bytes: number): number {
  return bytes / GB;
}

function formatFileSizeGb(gb: number): string {
  const rounded = gb >= 10 ? gb.toFixed(0) : gb.toFixed(1);
  return `~${rounded} GB`;
}

/**
 * Heuristic: treat NVIDIA / AMD discrete / Intel Arc as dedicated GPUs.
 * Integrated chips (Intel UHD/Iris, AMD Radeon Graphics) do not count.
 */
export function hasDiscreteGpu(gpus: string[]): boolean {
  if (gpus.length === 0) return false;

  return gpus.some((raw) => {
    const gpu = raw.toLowerCase();
    if (
      /uhd|iris|radeon graphics|graphics \(?radeon\)?|apple m\d/i.test(gpu) &&
      !/rtx|gtx|rx\s?\d|arc\s?[a-z]?\d/i.test(gpu)
    ) {
      return false;
    }
    return /nvidia|geforce|rtx|gtx|quadro|tesla|radeon\s*rx|radeon\s*pro|amd\s*rx|intel\s*arc|arc\s*[a-z]?\d/i.test(
      gpu,
    );
  });
}

function fitForEntry(
  entry: CatalogEntry,
  totalRamGb: number,
  availableRamGb: number,
  discreteGpu: boolean,
): { fit: FitLevel; score: number; reason: string } | null {
  // Need headroom beyond the model weights for OS + context.
  const effectiveBudget = Math.max(availableRamGb, totalRamGb * 0.55);
  if (totalRamGb < entry.minRamGb && effectiveBudget < entry.minRamGb * 0.85) {
    return null;
  }

  let score = 0;
  let fit: FitLevel = "tight";
  let reason = "";

  if (
    totalRamGb >= entry.preferredRamGb &&
    effectiveBudget >= entry.fileSizeGb + 2
  ) {
    fit = "excellent";
    score = 90;
    reason = discreteGpu
      ? "Fits comfortably in RAM; a discrete GPU should keep responses snappy."
      : "Fits comfortably in system memory for local inference.";
  } else if (
    totalRamGb >= entry.minRamGb + (entry.preferredRamGb - entry.minRamGb) * 0.45
  ) {
    fit = "good";
    score = 70;
    reason = discreteGpu
      ? "Should run well, especially with GPU offload."
      : "Should run on this machine; expect moderate speed on CPU.";
  } else {
    fit = "tight";
    score = 45;
    reason =
      "Runnable but tight on memory — close other apps and keep context short.";
  }

  if (discreteGpu && entry.benefitsFromGpu) {
    score += 12;
    if (fit === "tight") {
      fit = "good";
      score = Math.max(score, 65);
      reason =
        "Memory is limited, but a discrete GPU should help this size stay usable.";
    }
  } else if (!discreteGpu && entry.fileSizeGb >= 8 && totalRamGb < 28) {
    score -= 15;
  }

  // Prefer recommendations that leave free RAM after download.
  if (availableRamGb >= entry.fileSizeGb + 3) score += 6;
  if (availableRamGb < entry.fileSizeGb) score -= 10;

  // Slight preference for models near the machine's sweet spot (not tiny on beefy PCs).
  const sweetSpot = discreteGpu
    ? Math.min(14, Math.max(3, totalRamGb * 0.35))
    : Math.min(8, Math.max(1, totalRamGb * 0.25));
  score -= Math.abs(entry.fileSizeGb - sweetSpot) * 1.5;

  return { fit, score, reason };
}

function fitLabel(fit: FitLevel): string {
  switch (fit) {
    case "excellent":
      return "Excellent fit";
    case "good":
      return "Good fit";
    case "tight":
      return "Tight fit";
  }
}

/**
 * Recommend a few Ollama models ranked for the detected hardware.
 */
export function suggestModelsForHardware(
  hardware: HardwareInfo,
  limit = 3,
): ModelSuggestion[] {
  const totalRamGb = bytesToGb(hardware.totalMemoryBytes);
  const availableRamGb = bytesToGb(hardware.availableMemoryBytes);
  const discreteGpu = hasDiscreteGpu(hardware.gpus);

  const ranked: Array<ModelSuggestion & { score: number }> = [];

  for (const entry of CATALOG) {
    const result = fitForEntry(
      entry,
      totalRamGb,
      availableRamGb,
      discreteGpu,
    );
    if (!result) continue;

    ranked.push({
      name: entry.name,
      baseName: entry.baseName,
      parameterSize: entry.parameterSize,
      fileSizeLabel: formatFileSizeGb(entry.fileSizeGb),
      fileSizeBytes: Math.round(entry.fileSizeGb * GB),
      fit: result.fit,
      fitLabel: fitLabel(result.fit),
      reason: result.reason,
      description: entry.description,
      score: result.score,
    });
  }

  ranked.sort((a, b) => b.score - a.score);

  // Keep variety: avoid recommending three variants of the same base when possible.
  const picked: Array<ModelSuggestion & { score: number }> = [];
  const usedBases = new Set<string>();

  for (const candidate of ranked) {
    if (picked.length >= limit) break;
    if (usedBases.has(candidate.baseName) && picked.length + 1 < limit) {
      continue;
    }
    usedBases.add(candidate.baseName);
    picked.push(candidate);
  }

  // If we skipped too aggressively, fill remaining slots.
  if (picked.length < limit) {
    for (const candidate of ranked) {
      if (picked.length >= limit) break;
      if (picked.some((item) => item.name === candidate.name)) continue;
      picked.push(candidate);
    }
  }

  // Always offer at least the smallest catalog entry if nothing scored.
  if (picked.length === 0) {
    const fallback = CATALOG[0];
    return [
      {
        name: fallback.name,
        baseName: fallback.baseName,
        parameterSize: fallback.parameterSize,
        fileSizeLabel: formatFileSizeGb(fallback.fileSizeGb),
        fileSizeBytes: Math.round(fallback.fileSizeGb * GB),
        fit: "tight",
        fitLabel: fitLabel("tight"),
        reason:
          "Hardware looks constrained — start with the smallest model and upgrade later.",
        description: fallback.description,
      },
    ];
  }

  return picked.map(({ score: _score, ...suggestion }) => suggestion);
}

export function summarizeHardwareForSuggestions(
  hardware: HardwareInfo,
): string {
  const total = bytesToGb(hardware.totalMemoryBytes);
  const free = bytesToGb(hardware.availableMemoryBytes);
  const ram =
    total >= 10 ? `${total.toFixed(0)} GB RAM` : `${total.toFixed(1)} GB RAM`;
  const freeLabel =
    free >= 10 ? `${free.toFixed(0)} GB free` : `${free.toFixed(1)} GB free`;
  const gpu = hasDiscreteGpu(hardware.gpus)
    ? "discrete GPU detected"
    : hardware.gpus.length > 0
      ? "integrated graphics"
      : "no GPU detected";
  return `${ram} (${freeLabel}), ${gpu}`;
}
