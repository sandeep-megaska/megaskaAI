import { findBackendById, getDefaultBackendForType } from "@/lib/ai-backends";
import { isVeoModel } from "@/lib/ai/backendFamilies";
import { ProviderInvalidArgumentError, ProviderModelNotFoundError } from "@/lib/ai/providerErrors";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";
import { runVeoVideo } from "@/lib/video/adapters/runVeoVideo";
import { buildVideoVariants } from "@/lib/video/buildVideoVariants";
import {
  getVideoCapabilityByBackendId,
  resolveVideoCapability,
  type SafeMotionLevel,
  type VideoProvider,
} from "@/lib/video/providerCapabilities";
import { computeMaxReferences, selectReferenceSubset } from "@/lib/video/selectReferenceSubset";

export type RunVideoJobInput = {
  apiKey?: string;
  backendId?: string | null;
  prompt: string;
  durationSeconds: number;
  firstFrameUrl?: string | null;
  lastFrameUrl?: string | null;
  referenceImageUrls?: string[];
  identityAnchorUrl?: string | null;
  garmentAnchorUrl?: string | null;
  fitAnchorUrl?: string | null;
  inputMode?: "anchor-based" | "multi-reference";
  requestedMotionLevel?: SafeMotionLevel;
  requestedFidelityPriority?: string;
  aspectRatio?: StudioAspectRatio;
};

export type VideoAttemptResult =
  | "success"
  | "settings-rejected"
  | "model-not-found"
  | "empty-output"
  | "download-failed"
  | "fatal-error";

export type VideoAttemptDiagnostics = {
  backendId: string;
  attemptNumber: number;
  variantLabel: string;
  complexityTier: number;
  lastFrameAttached: boolean;
  referenceCount: number;
  actualMotionUsed: SafeMotionLevel;
  result: VideoAttemptResult;
  providerErrorStatus?: number;
  providerErrorCode?: string;
  providerErrorMessage?: string;
};

export type RunVideoJobResult = {
  bytes: Buffer;
  mimeType: string;
  backendId: string;
  backendLabel: string;
  provider: VideoProvider;
  backendModel: string;
  providerModelId: string;
  rawOutputUri: string | null;
  providerResponseMeta: Record<string, unknown>;
  diagnostics: {
    selectedProviderModelKey: string;
    selectedWorkflowType: "fidelity-baseline" | "multi-reference";
    requestedFidelityPriority: string;
    requestedMotionLevel: SafeMotionLevel;
    requestedAnchors: { firstFrameUrl: string | null; lastFrameUrl: string | null; referenceImageUrls: string[] };
    selectedReferenceSubset: string[];
    droppedAnchors: Array<{ url: string; reason: string }>;
    attempts: VideoAttemptDiagnostics[];
    successAttemptNumber: number;
    successVariantLabel: string;
    successComplexityTier: number;
    successUsedCompatibilityFallback: boolean;
    actualMotionUsed: SafeMotionLevel;
  };
};

function normalizeUrl(value?: string | null) {
  return value?.trim() || null;
}

function classifyAttemptError(error: unknown): VideoAttemptResult {
  if (error instanceof ProviderInvalidArgumentError) return "settings-rejected";
  if (error instanceof ProviderModelNotFoundError) return "model-not-found";

  const message = String((error as { message?: string })?.message ?? "").toLowerCase();
  if (message.includes("generated videos") || message.includes("empty")) return "empty-output";
  if (message.includes("download")) return "download-failed";
  return "fatal-error";
}

function mapMotionLevel(priority?: string): SafeMotionLevel {
  if (priority === "maximum-motion") return "dynamic";
  if (priority === "balanced") return "moderate";
  return "minimal";
}

function getModelFallbackBackendIds(backendId: string): string[] {
  if (backendId === "veo-3.1") return ["veo-3", "veo-2"];
  if (backendId === "veo-3.1-fast") return ["veo-3-fast", "veo-3", "veo-2"];
  if (backendId === "veo-3-fast") return ["veo-3", "veo-2"];
  if (backendId === "veo-3") return ["veo-2"];
  return [];
}

export async function runVideoJob(input: RunVideoJobInput): Promise<RunVideoJobResult> {
  const requestedBackend = findBackendById(input.backendId);
  if (input.backendId && !requestedBackend) {
    throw new Error("Unknown ai_backend_id.");
  }

  const defaultBackendId = getVideoCapabilityByBackendId("veo-3.1")?.backendId ?? "veo-3.1";
  const backend = requestedBackend ?? findBackendById(defaultBackendId) ?? getDefaultBackendForType("video");

  if (backend.type !== "video") {
    throw new Error(`Backend '${backend.id}' supports ${backend.type} only.`);
  }

  if (!isVeoModel(backend.model)) {
    throw new Error(`Unsupported video backend family for model '${backend.model}'.`);
  }

  const firstFrameUrl = normalizeUrl(input.firstFrameUrl);
  const lastFrameUrl = normalizeUrl(input.lastFrameUrl);
  const normalizedReferenceImageUrls = (input.referenceImageUrls ?? []).map((url) => url.trim()).filter(Boolean);

  if (!firstFrameUrl) {
    throw new Error("A source image is required for Video Project generation.");
  }

  const requestedMotionLevel = input.requestedMotionLevel ?? mapMotionLevel(input.requestedFidelityPriority);
  const attempts: VideoAttemptDiagnostics[] = [];
  let lastError: unknown = new Error("No variant attempts were generated.");
  const backendCandidates = Array.from(new Set([backend.id, ...getModelFallbackBackendIds(backend.id)]));
  const attemptedBackendIds: string[] = [];

  for (const candidateBackendId of backendCandidates) {
    const candidateBackend = findBackendById(candidateBackendId);
    if (!candidateBackend || candidateBackend.type !== "video" || !isVeoModel(candidateBackend.model)) {
      continue;
    }
    attemptedBackendIds.push(candidateBackend.id);

    const capability = resolveVideoCapability(candidateBackend);
    if (!capability.allowedDurations.includes(input.durationSeconds)) {
      continue;
    }
    if (input.aspectRatio && !capability.allowedAspectRatios.includes(input.aspectRatio)) {
      continue;
    }

    const maxRefs = computeMaxReferences(capability);
    const referenceSelection = selectReferenceSubset({
      workflow:
        capability.recommendedPurpose === "fidelity-baseline"
          ? "fidelity-baseline"
          : input.inputMode === "multi-reference"
            ? "multi-reference"
            : "fidelity-baseline",
      fitAnchorUrl: input.fitAnchorUrl,
      identityAnchorUrl: input.identityAnchorUrl,
      garmentAnchorUrl: input.garmentAnchorUrl,
      allReferenceUrls: normalizedReferenceImageUrls,
      maxReferenceImages: maxRefs,
    });

    const variants = buildVideoVariants({
      capability,
      firstFrameUrl,
      lastFrameUrl,
      referenceImageUrls: referenceSelection.selectedUrls,
      requestedMotionLevel,
    });

    let backendFailedWithModelNotFound = false;

    for (const [index, variant] of variants.entries()) {
      try {
        const output = await runVeoVideo({
          apiKey: input.apiKey,
          model: capability.providerModelId,
          prompt: input.prompt,
          firstFrameUrl: variant.firstFrameUrl,
          lastFrameUrl: variant.lastFrameUrl,
          referenceImageUrls: variant.referenceImageUrls,
          aspectRatio: input.aspectRatio,
          durationSeconds: input.durationSeconds,
        });

        attempts.push({
          backendId: candidateBackend.id,
          attemptNumber: index + 1,
          variantLabel: variant.label,
          complexityTier: variant.complexityTier,
          lastFrameAttached: Boolean(variant.lastFrameUrl),
          referenceCount: variant.referenceImageUrls.length,
          actualMotionUsed: variant.actualMotionLevel,
          result: "success",
        });

        return {
          bytes: output.bytes,
          mimeType: output.mimeType,
          backendId: candidateBackend.id,
          backendLabel: capability.label,
          provider: capability.provider,
          backendModel: output.model,
          providerModelId: output.model,
          rawOutputUri: output.rawOutputUri,
          providerResponseMeta: output.providerResponseMeta,
          diagnostics: {
            selectedProviderModelKey: capability.modelKey,
            selectedWorkflowType:
              capability.recommendedPurpose === "fidelity-baseline"
                ? "fidelity-baseline"
                : input.inputMode === "multi-reference"
                  ? "multi-reference"
                  : "fidelity-baseline",
            requestedFidelityPriority: input.requestedFidelityPriority ?? "balanced",
            requestedMotionLevel,
            requestedAnchors: {
              firstFrameUrl,
              lastFrameUrl,
              referenceImageUrls: normalizedReferenceImageUrls,
            },
            selectedReferenceSubset: variant.referenceImageUrls,
            droppedAnchors: referenceSelection.dropped,
            attempts,
            successAttemptNumber: index + 1,
            successVariantLabel: variant.label,
            successComplexityTier: variant.complexityTier,
            successUsedCompatibilityFallback: index > 0 || candidateBackend.id !== backend.id,
            actualMotionUsed: variant.actualMotionLevel,
          },
        };
      } catch (error) {
        lastError = error;
        const attemptResult = classifyAttemptError(error);
        const providerError = error as { meta?: { status?: number; code?: string }; message?: string };

        attempts.push({
          backendId: candidateBackend.id,
          attemptNumber: index + 1,
          variantLabel: variant.label,
          complexityTier: variant.complexityTier,
          lastFrameAttached: Boolean(variant.lastFrameUrl),
          referenceCount: variant.referenceImageUrls.length,
          actualMotionUsed: variant.actualMotionLevel,
          result: attemptResult,
          providerErrorStatus: providerError.meta?.status,
          providerErrorCode: providerError.meta?.code,
          providerErrorMessage: providerError.message,
        });

        if (attemptResult === "model-not-found") {
          backendFailedWithModelNotFound = true;
          break;
        }

        if (attemptResult !== "settings-rejected") {
          throw error;
        }
      }
    }

    if (!backendFailedWithModelNotFound) {
      break;
    }
  }

  console.error("[video-job] all fallback variants failed", {
    backendId: backend.id,
    attemptedBackendIds,
    attempts,
  });

  throw lastError;
}
