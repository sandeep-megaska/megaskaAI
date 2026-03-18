export type StudioWorkflowMode = "master-candidates" | "more-views";

const GARMENT_PRESERVATION_BLOCK = [
  "Preserve the exact same garment identity.",
  "- preserve exact garment structure",
  "- preserve silhouette",
  "- preserve neckline",
  "- preserve hem shape",
  "- preserve seam/panel layout",
  "- preserve trim placement",
  "- preserve print and print placement",
  "- preserve colorway",
  "Do not redesign, reinterpret, simplify, restyle, or replace the garment.",
].join("\n");

export function buildMasterCandidatePrompt(input: { userPrompt: string; hasModelReferences: boolean }) {
  const prompt = input.userPrompt.trim();

  return [
    "Create a premium swimwear apparel studio image candidate.",
    "Target front view or front 3/4 view composition with high-end fashion lighting.",
    GARMENT_PRESERVATION_BLOCK,
    input.hasModelReferences
      ? "Preserve the same person identity, face characteristics, body proportions, and overall look from model references."
      : "If no model reference is provided, keep the styling photoreal and editorial.",
    "Output a polished apparel e-commerce quality still image.",
    prompt ? `User direction: ${prompt}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildMoreViewsPrompt(input: { userPrompt: string }) {
  const prompt = input.userPrompt.trim();

  return [
    "Use the provided master image as the primary reference.",
    "Preserve the same person identity exactly.",
    "Preserve the exact same garment:",
    "- same silhouette",
    "- same neckline",
    "- same hem shape",
    "- same seams and panels",
    "- same trim placement",
    "- same print and print placement",
    "- same colorway",
    "Do not redesign, restyle, reinterpret, or replace the garment.",
    "Only change:",
    "- viewing angle",
    "- pose",
    "- framing",
    "- background if requested",
    "The output must represent the same look from a different perspective or in a new setting.",
    prompt ? `User direction: ${prompt}` : "User direction: back view",
  ].join("\n\n");
}
