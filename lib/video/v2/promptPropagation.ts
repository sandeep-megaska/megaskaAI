export function normalizePrompt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildCanonicalRunSnapshot(input: {
  requestPayloadSnapshot?: Record<string, unknown> | null;
  directorPrompt: string;
  fallbackPrompt?: string | null;
  modeSelected: string;
  providerSelected: string;
  modelSelected: string;
  anchorCount?: number;
}) {
  const canonicalPrompt = normalizePrompt(input.directorPrompt);
  if (!canonicalPrompt) {
    throw new Error("Cannot execute video run: compiled prompt is missing.");
  }

  return {
    ...(input.requestPayloadSnapshot ?? {}),
    director_prompt: canonicalPrompt,
    fallback_prompt: normalizePrompt(input.fallbackPrompt) ?? null,
    mode_selected: input.modeSelected,
    provider_selected: input.providerSelected,
    model_selected: input.modelSelected,
    anchor_count: typeof input.anchorCount === "number" ? input.anchorCount : undefined,
  } satisfies Record<string, unknown>;
}

export function resolvePersistedRunPrompt(input: {
  requestPayloadSnapshot?: Record<string, unknown> | null;
  runMeta?: Record<string, unknown> | null;
  planDirectorPrompt?: string | null;
}) {
  return (
    normalizePrompt(input.requestPayloadSnapshot?.director_prompt) ??
    normalizePrompt(input.runMeta?.prompt_used) ??
    normalizePrompt(input.planDirectorPrompt) ??
    null
  );
}
