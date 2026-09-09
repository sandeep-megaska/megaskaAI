/**
 * Veo model IDs valid on the Gemini API path (generativelanguage.googleapis.com),
 * which is what this project talks to via `@google/genai` with GOOGLE_API_KEY /
 * GEMINI_API_KEY.
 *
 * Google publishes two different model-ID namespaces for Veo:
 *   - Gemini API  -> `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, ...
 *   - Vertex AI   -> `veo-3.1-generate-001`, `veo-3.1-fast-generate-001`, ...
 *
 * Using a Vertex-only ID (or a retired ID) on the Gemini API path returns
 * 404 NOT_FOUND, which surfaces as ProviderModelNotFoundError.
 *
 * Veo 2 (`veo-2.0-generate-001`) and Veo 3.0 (`veo-3.0-generate-001`,
 * `veo-3.0-fast-generate-001`) were shut down on the Gemini API on
 * 2026-06-30, so any request pinned to them now 404s.
 */

export const VEO_GEMINI_API_MODELS = {
  standard: "veo-3.1-generate-preview",
  fast: "veo-3.1-fast-generate-preview",
  lite: "veo-3.1-lite-generate-preview",
} as const;

/** Model IDs Google has retired from the Gemini API path. */
export const RETIRED_VEO_MODEL_IDS: Readonly<Record<string, string>> = {
  "veo-2.0-generate-001": "Retired from the Gemini API on 2026-06-30.",
  "veo-3.0-generate-001": "Retired from the Gemini API on 2026-06-30.",
  "veo-3.0-fast-generate-001": "Retired from the Gemini API on 2026-06-30.",
  "veo-3.0-generate-preview": "Retired from the Gemini API on 2026-06-30.",
  "veo-3.0-fast-generate-preview": "Retired from the Gemini API on 2026-06-30.",
};

/**
 * Ordered provider model IDs to try for a configured model. Google rotates the
 * `-preview` / `-001` suffix as a model moves to GA, so each entry lists every
 * spelling we know about; the adapter walks the list on 404 NOT_FOUND and uses
 * the first one the current API path actually serves.
 */
const MODEL_CANDIDATES: Readonly<Record<string, readonly string[]>> = {
  // Veo 3.1 (current)
  "veo-3.1-generate-preview": ["veo-3.1-generate-preview", "veo-3.1-generate-001"],
  "veo-3.1-generate-001": ["veo-3.1-generate-001", "veo-3.1-generate-preview"],
  "veo-3.1-fast-generate-preview": ["veo-3.1-fast-generate-preview", "veo-3.1-fast-generate-001"],
  "veo-3.1-fast-generate-001": ["veo-3.1-fast-generate-001", "veo-3.1-fast-generate-preview"],
  "veo-3.1-lite-generate-preview": ["veo-3.1-lite-generate-preview", "veo-3.1-lite-generate-001"],
  "veo-3.1-lite-generate-001": ["veo-3.1-lite-generate-001", "veo-3.1-lite-generate-preview"],

  // Retired IDs: keep old rows/requests working by routing them to the closest
  // still-served model instead of hard-failing with a 404.
  "veo-2.0-generate-001": ["veo-3.1-generate-preview", "veo-3.1-generate-001"],
  "veo-3.0-generate-001": ["veo-3.1-generate-preview", "veo-3.1-generate-001"],
  "veo-3.0-generate-preview": ["veo-3.1-generate-preview", "veo-3.1-generate-001"],
  "veo-3.0-fast-generate-001": ["veo-3.1-fast-generate-preview", "veo-3.1-fast-generate-001"],
  "veo-3.0-fast-generate-preview": ["veo-3.1-fast-generate-preview", "veo-3.1-fast-generate-001"],
};

export function isRetiredVeoModelId(model: string) {
  return Object.hasOwn(RETIRED_VEO_MODEL_IDS, model.trim().toLowerCase());
}

/**
 * Resolve the ordered list of provider model IDs to attempt for `model`.
 * Always non-empty; the first entry is the one the request starts with.
 */
export function resolveVeoModelCandidates(model: string): string[] {
  const normalized = model.trim().toLowerCase();
  const mapped = MODEL_CANDIDATES[normalized];
  if (mapped?.length) {
    return [...mapped];
  }

  // Unknown ID: try it as configured, then fall back to the current default so a
  // stale value in the database does not take the whole request down.
  return normalized && normalized !== VEO_GEMINI_API_MODELS.standard
    ? [normalized, VEO_GEMINI_API_MODELS.standard]
    : [VEO_GEMINI_API_MODELS.standard];
}
