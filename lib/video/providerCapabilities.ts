import { type AIBackend } from "@/lib/ai-backends";
import { type StudioAspectRatio } from "@/lib/studio/aspectRatios";

export type VideoProvider = "gemini-api";
export type VideoCapabilityPurpose = "fidelity-baseline" | "balanced" | "experimental";
export type SafeMotionLevel = "minimal" | "moderate" | "dynamic";

export type VideoProviderCapability = {
  backendId: string;
  provider: VideoProvider;
  modelKey: string;
  label: string;
  providerModelId: string;
  recommendedPurpose: VideoCapabilityPurpose;
  supportsSourceImage: boolean;
  supportsLastFrame: boolean;
  supportsReferenceImages: boolean;
  maxReferenceImages: number;
  supportsMultiReferenceWorkflow: boolean;
  supportsAnchorWorkflow: boolean;
  allowedDurations: readonly number[];
  allowedAspectRatios: readonly StudioAspectRatio[];
  safeMotionLevel: SafeMotionLevel;
  shouldBeDefaultRecommended: boolean;
  shouldBeMarkedExperimental: boolean;
  notes: string;
  warning?: string;
  isLegacy?: boolean;
};

const COMMON_ASPECT_RATIOS: readonly StudioAspectRatio[] = ["16:9", "9:16"];

export const VIDEO_PROVIDER_CAPABILITIES: Record<string, VideoProviderCapability> = {
  "veo-2": {
    backendId: "veo-2",
    provider: "gemini-api",
    modelKey: "veo-2-legacy",
    label: "Megaska Fidelity Baseline (Veo 2 Legacy)",
    providerModelId: "veo-2.0-generate-001",
    recommendedPurpose: "fidelity-baseline",
    supportsSourceImage: true,
    supportsLastFrame: false,
    supportsReferenceImages: false,
    maxReferenceImages: 0,
    supportsMultiReferenceWorkflow: false,
    supportsAnchorWorkflow: true,
    allowedDurations: [5, 6, 7, 8],
    allowedAspectRatios: COMMON_ASPECT_RATIOS,
    safeMotionLevel: "minimal",
    shouldBeDefaultRecommended: false,
    shouldBeMarkedExperimental: false,
    notes: "Highest identity + garment preservation. Motion remains subtle and intentionally limited.",
    warning: "Use for production-safe fidelity output. Dynamic motion is intentionally constrained.",
    isLegacy: true,
  },
  "veo-3": {
    backendId: "veo-3",
    provider: "gemini-api",
    modelKey: "veo-3",
    label: "Veo 3",
    providerModelId: "veo-3.0-generate-001",
    recommendedPurpose: "experimental",
    supportsSourceImage: true,
    supportsLastFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 2,
    supportsMultiReferenceWorkflow: true,
    supportsAnchorWorkflow: true,
    allowedDurations: [8],
    allowedAspectRatios: COMMON_ASPECT_RATIOS,
    safeMotionLevel: "moderate",
    shouldBeDefaultRecommended: false,
    shouldBeMarkedExperimental: true,
    notes: "Higher motion potential with higher compatibility rejection and drift risk.",
    warning: "May require compatibility fallback for complex anchor/reference requests.",
  },
  "veo-3-fast": {
    backendId: "veo-3-fast",
    provider: "gemini-api",
    modelKey: "veo-3-fast",
    label: "Veo 3 Fast",
    providerModelId: "veo-3.0-fast-generate-001",
    recommendedPurpose: "experimental",
    supportsSourceImage: true,
    supportsLastFrame: false,
    supportsReferenceImages: true,
    maxReferenceImages: 2,
    supportsMultiReferenceWorkflow: true,
    supportsAnchorWorkflow: true,
    allowedDurations: [8],
    allowedAspectRatios: COMMON_ASPECT_RATIOS,
    safeMotionLevel: "moderate",
    shouldBeDefaultRecommended: false,
    shouldBeMarkedExperimental: true,
    notes: "Fast iteration path; stricter request shape tolerance than fidelity baseline.",
    warning: "Last-frame control is not supported and will be dropped.",
  },
  "veo-3.1": {
    backendId: "veo-3.1",
    provider: "gemini-api",
    modelKey: "veo-3.1",
    label: "Veo 3.1",
    providerModelId: "veo-3.1-generate-001",
    recommendedPurpose: "experimental",
    supportsSourceImage: true,
    supportsLastFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 3,
    supportsMultiReferenceWorkflow: true,
    supportsAnchorWorkflow: true,
    allowedDurations: [4, 6, 8],
    allowedAspectRatios: COMMON_ASPECT_RATIOS,
    safeMotionLevel: "dynamic",
    shouldBeDefaultRecommended: true,
    shouldBeMarkedExperimental: true,
    notes: "Motion expansion path with strongest complexity support in this project.",
    warning: "Complex anchor stacks can still be rejected; fallback may simplify request shape.",
  },
  "veo-3.1-fast": {
    backendId: "veo-3.1-fast",
    provider: "gemini-api",
    modelKey: "veo-3.1-fast",
    label: "Veo 3.1 Fast",
    providerModelId: "veo-3.1-fast-generate-001",
    recommendedPurpose: "experimental",
    supportsSourceImage: true,
    supportsLastFrame: true,
    supportsReferenceImages: true,
    maxReferenceImages: 2,
    supportsMultiReferenceWorkflow: true,
    supportsAnchorWorkflow: true,
    allowedDurations: [4, 6, 8],
    allowedAspectRatios: COMMON_ASPECT_RATIOS,
    safeMotionLevel: "moderate",
    shouldBeDefaultRecommended: false,
    shouldBeMarkedExperimental: true,
    notes: "Faster 3.1 path; practical stability is better with conservative motion + fewer refs.",
    warning: "May drift under high motion with many anchors.",
  },
};

export function resolveVideoCapability(backend: AIBackend): VideoProviderCapability {
  return (
    VIDEO_PROVIDER_CAPABILITIES[backend.id] ?? {
      backendId: backend.id,
      provider: "gemini-api",
      modelKey: backend.id,
      label: backend.name,
      providerModelId: backend.model,
      recommendedPurpose: "experimental",
      supportsSourceImage: true,
      supportsLastFrame: false,
      supportsReferenceImages: false,
      maxReferenceImages: 0,
      supportsMultiReferenceWorkflow: false,
      supportsAnchorWorkflow: true,
      allowedDurations: [8],
      allowedAspectRatios: COMMON_ASPECT_RATIOS,
      safeMotionLevel: "minimal",
      shouldBeDefaultRecommended: false,
      shouldBeMarkedExperimental: true,
      notes: "Unknown video capability profile. Router defaults to safest request shape.",
      warning: "Provider compatibility is unknown; request will be simplified.",
    }
  );
}

export function getDefaultRecommendedVideoBackendId() {
  const entry = Object.values(VIDEO_PROVIDER_CAPABILITIES).find((capability) => capability.shouldBeDefaultRecommended);
  return entry?.backendId ?? "veo-3.1";
}

export function getVideoCapabilityByBackendId(backendId?: string | null) {
  if (!backendId) return null;
  return VIDEO_PROVIDER_CAPABILITIES[backendId] ?? null;
}
