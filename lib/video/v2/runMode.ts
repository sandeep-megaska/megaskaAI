import { createHash } from "node:crypto";

export const VIDEO_RUN_MODES = ["validation", "production"] as const;
export type VideoRunMode = (typeof VIDEO_RUN_MODES)[number];

export function normalizeRunMode(value: unknown): VideoRunMode {
  return value === "production" ? "production" : "validation";
}

export function buildRunConfigSignature(input: {
  selectedPackId: string;
  modeSelected: string;
  providerSelected: string;
  modelSelected: string;
  aspectRatio: string;
  runMode: VideoRunMode;
  directorPrompt: string;
  productionMode?: string | null;
  phase1TemplateId?: string | null;
}) {
  const payload = {
    selected_pack_id: input.selectedPackId,
    mode_selected: input.modeSelected,
    provider_selected: input.providerSelected,
    model_selected: input.modelSelected,
    aspect_ratio: input.aspectRatio,
    run_mode: input.runMode,
    production_mode: input.productionMode ?? null,
    phase1_template_id: input.phase1TemplateId ?? null,
    prompt_hash: createHash("sha256").update(input.directorPrompt.trim().toLowerCase()).digest("hex"),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function shouldWarnHighRiskValidation(input: {
  runMode: VideoRunMode;
  productionMode?: string | null;
  templateMotionProfile?: string | null;
}) {
  if (input.runMode !== "validation") return false;
  if (input.productionMode !== "phase1_template") return true;
  const motion = String(input.templateMotionProfile ?? "").toLowerCase();
  return motion.includes("dynamic") || motion.includes("surreal");
}

export function findRecentFailedConfigMatch<T extends {
  status?: string | null;
  created_at?: string | null;
  run_meta?: Record<string, unknown> | null;
}>(
  runs: T[],
  signature: string,
  lookbackHours = 24,
) {
  const now = Date.now();
  return runs.find((run) => {
    if (run.status !== "failed") return false;
    const runSignature = run.run_meta?.config_signature;
    if (runSignature !== signature) return false;
    if (!run.created_at) return true;
    const ageMs = now - new Date(run.created_at).getTime();
    return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= lookbackHours * 60 * 60 * 1000;
  }) ?? null;
}
