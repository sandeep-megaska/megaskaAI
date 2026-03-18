import { findBackendById } from "@/lib/ai-backends";
import { isGeminiImageModel } from "@/lib/ai/backendFamilies";
import { buildShotPlan } from "@/lib/lookbook/buildShotPlan";
import { buildLookbookPrompt } from "@/lib/lookbook/buildLookbookPrompt";
import { runGeminiLookbookShot } from "@/lib/lookbook/adapters/runGeminiLookbookShot";
import type {
  LookbookConstraintProfile,
  LookbookJobVariant,
  LookbookReferenceImage,
  LookbookShotResult,
  LookbookShotSpec,
  LookbookThemeKey,
  LookbookWorkflowMode,
} from "@/lib/lookbook/types";

export type RunLookbookInput = {
  backendId?: string | null;
  references: LookbookReferenceImage[];
  shotSpecs?: LookbookShotSpec[];
  jobVariant?: LookbookJobVariant;
  themeKey?: LookbookThemeKey | null;
  outputStyle?: "catalog" | "studio" | "lifestyle";
};

export type RunLookbookResult = {
  workflowMode: LookbookWorkflowMode;
  backendId: string;
  backendModel: string;
  shots: LookbookShotResult[];
};

export const LOOKBOOK_CONSTRAINT_PROFILE: LookbookConstraintProfile = {
  noReconstruction: true,
  preserveModelIdentity: true,
  preserveGarmentStructure: true,
  preservePrintPlacement: true,
  preserveColorway: true,
  preserveSilhouette: true,
  preserveTrimAndSeamLayout: true,
  forbidRedesign: true,
  forbidReinterpretation: true,
  forbidGarmentReplacement: true,
  forbidStyleDrift: true,
};

export async function runLookbookJob(input: RunLookbookInput): Promise<RunLookbookResult> {
  const backend = findBackendById(input.backendId) ?? findBackendById("nano-banana-pro");
  if (!backend) {
    throw new Error("No Gemini backend is configured for consistent lookbook.");
  }

  if (!isGeminiImageModel(backend.model)) {
    throw new Error("Consistent Lookbook requires a Gemini image backend.");
  }

  const jobVariant = input.jobVariant ?? "catalog";
  const shots = buildShotPlan({ shotSpecs: input.shotSpecs, variant: jobVariant });
  const outputStyle = input.outputStyle ?? (jobVariant === "lifestyle" ? "lifestyle" : "catalog");

  const results: LookbookShotResult[] = [];
  for (const shot of shots) {
    const compiled = buildLookbookPrompt({
      workflowMode: "consistent-lookbook",
      backendModel: backend.model,
      outputStyle,
      jobVariant,
      themeKey: input.themeKey ?? null,
      references: input.references,
      shot,
      constraints: LOOKBOOK_CONSTRAINT_PROFILE,
      prompt: "",
      promptHash: "",
    });

    const shotResult = await runGeminiLookbookShot({
      workflowMode: "consistent-lookbook",
      backendModel: backend.model,
      outputStyle,
      jobVariant,
      themeKey: input.themeKey ?? null,
      references: input.references,
      shot,
      constraints: LOOKBOOK_CONSTRAINT_PROFILE,
      prompt: compiled.prompt,
      promptHash: compiled.promptHash,
      debugTrace: {
        backendModel: backend.model,
        shotKey: shot.shotKey,
        jobVariant,
        themeKey: input.themeKey ?? null,
        promptHash: compiled.promptHash,
        referenceKinds: Array.from(new Set(input.references.map((reference) => reference.kind))),
        noReconstruction: LOOKBOOK_CONSTRAINT_PROFILE.noReconstruction,
        preservationFlags: {
          preserveModelIdentity: LOOKBOOK_CONSTRAINT_PROFILE.preserveModelIdentity,
          preserveGarmentStructure: LOOKBOOK_CONSTRAINT_PROFILE.preserveGarmentStructure,
          preservePrintPlacement: LOOKBOOK_CONSTRAINT_PROFILE.preservePrintPlacement,
          preserveColorway: LOOKBOOK_CONSTRAINT_PROFILE.preserveColorway,
          preserveSilhouette: LOOKBOOK_CONSTRAINT_PROFILE.preserveSilhouette,
          preserveTrimAndSeamLayout: LOOKBOOK_CONSTRAINT_PROFILE.preserveTrimAndSeamLayout,
        },
        promptBlocks: compiled.blocks,
      },
    });

    results.push(shotResult);
  }

  return {
    workflowMode: "consistent-lookbook",
    backendId: backend.id,
    backendModel: backend.model,
    shots: results,
  };
}
