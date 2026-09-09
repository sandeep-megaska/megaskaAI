import { VEO_GEMINI_API_MODELS } from "@/lib/ai/veoModels";

export type AIBackendType = "image" | "video";

export type AIBackend = {
  id: string;
  name: string;
  type: AIBackendType;
  model: string;
  isExperimental?: boolean;
  isLegacy?: boolean;
  /**
   * Provider has retired this model on the Gemini API path. Kept so historical
   * rows still resolve to a backend, but hidden from pickers and never chosen
   * as a default. Requests land on the replacement model via
   * `resolveVeoModelCandidates`.
   */
  isRetired?: boolean;
  retiredNote?: string;
  /** Backend id that serves requests made against a retired backend. */
  replacedByBackendId?: string;
};

export const AI_BACKENDS: AIBackend[] = [
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    type: "image",
    model: "gemini-3-pro-image-preview",
  },
  {
    id: "laozhang_gemini",
    name: "LaoZhang Gemini",
    type: "image",
    model: "gemini-3-pro-image-preview",
  },
  {
    id: "nano-banana-2",
    name: "Nano Banana 2",
    type: "image",
    model: "gemini-3.1-flash-image-preview",
  },
  {
    id: "nano-banana",
    name: "Nano Banana",
    type: "image",
    model: "gemini-2.5-flash-image",
  },
  {
    id: "imagen-4",
    name: "Imagen 4",
    type: "image",
    model: "imagen-4.0-generate-001",
  },
  {
    id: "imagen-4-ultra",
    name: "Imagen 4 Ultra",
    type: "image",
    model: "imagen-4.0-ultra-generate-001",
  },
  {
    id: "imagen-4-fast",
    name: "Imagen 4 Fast",
    type: "image",
    model: "imagen-4.0-fast-generate-001",
  },
  {
    id: "veo-2",
    name: "Megaska Fidelity Baseline (Veo 2 Legacy)",
    type: "video",
    model: "veo-2.0-generate-001",
    isLegacy: true,
    isRetired: true,
    retiredNote: "Veo 2 was shut down on the Gemini API on 2026-06-30. Requests are served by Veo 3.1.",
    replacedByBackendId: "veo-3.1",
  },
  {
    id: "veo-3",
    name: "Veo 3 (Experimental Motion)",
    type: "video",
    model: "veo-3.0-generate-001",
    isExperimental: true,
    isRetired: true,
    retiredNote: "Veo 3.0 was shut down on the Gemini API on 2026-06-30. Requests are served by Veo 3.1.",
    replacedByBackendId: "veo-3.1",
  },
  {
    id: "veo-3-fast",
    name: "Veo 3 Fast (Experimental)",
    type: "video",
    model: "veo-3.0-fast-generate-001",
    isExperimental: true,
    isRetired: true,
    retiredNote: "Veo 3.0 Fast was shut down on the Gemini API on 2026-06-30. Requests are served by Veo 3.1 Fast.",
    replacedByBackendId: "veo-3.1-fast",
  },
  {
    id: "veo-3.1",
    name: "Veo 3.1 (Experimental Motion)",
    type: "video",
    model: VEO_GEMINI_API_MODELS.standard,
    isExperimental: true,
  },
  {
    id: "veo-3.1-fast",
    name: "Veo 3.1 Fast (Experimental Motion)",
    type: "video",
    model: VEO_GEMINI_API_MODELS.fast,
    isExperimental: true,
  },
];

/** Backends that should be offered in pickers — retired models are excluded. */
export function getSelectableBackends(type?: AIBackendType) {
  return AI_BACKENDS.filter((backend) => !backend.isRetired && (!type || backend.type === type));
}

export function findBackendById(id?: string | null) {
  if (!id) return null;
  return AI_BACKENDS.find((backend) => backend.id === id) ?? null;
}

export function getDefaultBackendForType(type: AIBackendType) {
  if (type === "video") {
    // Veo 2 and Veo 3.0 are retired on the Gemini API path, so 3.1 is the
    // fidelity baseline now.
    return findBackendById("veo-3.1") ?? findBackendById("veo-3.1-fast")!;
  }

  return findBackendById("imagen-4")!;
}

/**
 * Map a retired backend onto the model that now serves it. Historical rows and
 * saved selections keep working instead of failing with a provider 404.
 */
export function resolveActiveBackend(backend: AIBackend): AIBackend {
  if (!backend.isRetired) return backend;

  const replacement = backend.replacedByBackendId ? findBackendById(backend.replacedByBackendId) : null;
  if (replacement && !replacement.isRetired && replacement.type === backend.type) {
    return replacement;
  }

  return getDefaultBackendForType(backend.type);
}
