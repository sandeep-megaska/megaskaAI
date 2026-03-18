import { isGeminiImageModel } from "@/lib/ai/backendFamilies";
import type { StudioAspectRatio } from "@/lib/studio/aspectRatios";

export type GeminiCostGenerationRecord = {
  id?: string;
  created_at?: string | null;
  aspect_ratio?: StudioAspectRatio | string | null;
  generation_kind?: string | null;
  media_type?: string | null;
  overlay_json?: Record<string, unknown> | null;
};

export type GeminiCostEstimateContext = {
  requestedBackendModel?: string;
  actualBackendModel?: string;
  fallbackApplied: boolean;
};

const GEMINI_IMAGE_BASE_PRICE_USD: Record<string, number> = {
  "gemini-3-pro-image-preview": 0.13,
  "gemini-3.1-flash-image-preview": 0.09,
  "gemini-2.5-flash-image": 0.06,
};

const DEFAULT_GEMINI_IMAGE_BASE_PRICE_USD = 0.08;

const ASPECT_RATIO_MULTIPLIER: Record<string, number> = {
  "1:1": 1,
  "3:4": 1.05,
  "4:3": 1.05,
  "9:16": 1.15,
  "16:9": 1.15,
};

export function toUsd(value: number) {
  return Math.round(value * 100) / 100;
}

export function getGenerationModelContext(record: GeminiCostGenerationRecord): GeminiCostEstimateContext {
  const requestedBackendModel =
    typeof record.overlay_json?.requestedBackendModel === "string"
      ? record.overlay_json.requestedBackendModel
      : typeof record.overlay_json?.ai_model === "string"
        ? record.overlay_json.ai_model
        : undefined;

  const actualBackendModel =
    typeof record.overlay_json?.actualBackendModel === "string"
      ? record.overlay_json.actualBackendModel
      : typeof record.overlay_json?.backendModel === "string"
        ? record.overlay_json.backendModel
        : undefined;

  return {
    requestedBackendModel,
    actualBackendModel,
    fallbackApplied: Boolean(requestedBackendModel && actualBackendModel && requestedBackendModel !== actualBackendModel),
  };
}

export function estimateGeminiGenerationCostUsd(record: GeminiCostGenerationRecord) {
  const modelContext = getGenerationModelContext(record);
  const model = modelContext.actualBackendModel ?? modelContext.requestedBackendModel;

  if (!model || !isGeminiImageModel(model)) {
    return null;
  }

  const basePrice = GEMINI_IMAGE_BASE_PRICE_USD[model] ?? DEFAULT_GEMINI_IMAGE_BASE_PRICE_USD;
  const aspectRatio = typeof record.aspect_ratio === "string" ? record.aspect_ratio : "1:1";
  const ratioMultiplier = ASPECT_RATIO_MULTIPLIER[aspectRatio] ?? 1;

  return {
    estimatedCostUsd: toUsd(basePrice * ratioMultiplier),
    requestedBackendModel: modelContext.requestedBackendModel,
    actualBackendModel: modelContext.actualBackendModel,
    fallbackApplied: modelContext.fallbackApplied,
  };
}

export type GeminiCostSummary = {
  estimatedLastGenUsd: number | null;
  estimatedTodayUsd: number;
  estimatedThisMonthUsd: number;
  lastGeneratedAt: string | null;
  requestedBackendModel?: string;
  actualBackendModel?: string;
  fallbackApplied?: boolean;
};

export function summarizeGeminiEstimatedCosts(records: GeminiCostGenerationRecord[], now = new Date()): GeminiCostSummary {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));

  let estimatedThisMonthUsd = 0;
  let estimatedTodayUsd = 0;
  let estimatedLastGenUsd: number | null = null;
  let lastGeneratedAt: string | null = null;
  let lastModelContext: Omit<GeminiCostSummary, "estimatedLastGenUsd" | "estimatedTodayUsd" | "estimatedThisMonthUsd" | "lastGeneratedAt"> = {};

  const sortedRecords = [...records].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  for (const record of sortedRecords) {
    const estimated = estimateGeminiGenerationCostUsd(record);
    if (!estimated) continue;

    const createdAt = record.created_at ? new Date(record.created_at) : null;
    const timestamp = createdAt?.getTime();

    if (estimatedLastGenUsd === null) {
      estimatedLastGenUsd = estimated.estimatedCostUsd;
      lastGeneratedAt = record.created_at ?? null;
      lastModelContext = {
        requestedBackendModel: estimated.requestedBackendModel,
        actualBackendModel: estimated.actualBackendModel,
        fallbackApplied: estimated.fallbackApplied,
      };
    }

    if (timestamp === undefined || timestamp === null || Number.isNaN(timestamp) || !createdAt) continue;

    if (createdAt >= monthStart) {
      estimatedThisMonthUsd += estimated.estimatedCostUsd;
    }

    if (createdAt >= dayStart) {
      estimatedTodayUsd += estimated.estimatedCostUsd;
    }
  }

  return {
    estimatedLastGenUsd,
    estimatedTodayUsd: toUsd(estimatedTodayUsd),
    estimatedThisMonthUsd: toUsd(estimatedThisMonthUsd),
    lastGeneratedAt,
    ...lastModelContext,
  };
}
