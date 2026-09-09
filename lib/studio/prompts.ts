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

/**
 * Everything in the master image that is not the garment.
 *
 * The earlier version of this prompt pinned the garment and the person in
 * exhaustive detail, said nothing at all about the surroundings, and then
 * offered "or in a new setting" as a licence to reinvent them. So a shot built
 * around a specific prop — a red vehicle, a particular doorway, a signature
 * backdrop — would come back with that prop recoloured or replaced even though
 * the garment was reproduced perfectly. For a seller the prop is part of the
 * shot, so it has to be pinned just as explicitly as the product.
 */
const SCENE_PRESERVATION_BLOCK = [
  "Preserve the entire scene from the master image exactly as it appears.",
  "- same location, background and horizon",
  "- same props and objects, including their exact colour, model, trim and position",
  "- same vehicles: identical make, model, body colour, wheels and markings",
  "- same time of day, weather and sky",
  "- same lighting direction, quality and colour temperature",
  "- same overall colour grade",
  "Do not add, remove, recolour, restyle or substitute any object in the scene.",
  "Treat every colour in the frame as fixed.",
].join("\n");

const GARMENT_CONTINUITY_BLOCK = [
  "- same silhouette",
  "- same neckline",
  "- same hem shape",
  "- same seams and panels",
  "- same trim placement",
  "- same print and print placement",
  "- same colorway",
].join("\n");

export function buildMoreViewsPrompt(input: {
  userPrompt: string;
  /**
   * When false the seller has explicitly asked for a new setting, so the scene
   * may change. The person and the garment still may not.
   */
  preserveScene?: boolean;
}) {
  const prompt = input.userPrompt.trim();
  const preserveScene = input.preserveScene ?? true;

  return [
    "Use the provided master image as the primary reference. It is the source of truth for this shot.",
    "Preserve the same person identity exactly: face, hair, skin tone and body proportions.",
    "Preserve the exact same garment:",
    GARMENT_CONTINUITY_BLOCK,
    "Do not redesign, restyle, reinterpret, or replace the garment.",
    preserveScene
      ? SCENE_PRESERVATION_BLOCK
      : "The setting may change as directed below. Everything about the person and the garment must still match the master image exactly.",
    preserveScene
      ? "Change only the camera: viewing angle, framing and the subject's pose. This is the same moment photographed from a different position, not a new photograph."
      : "Change the setting as directed, along with viewing angle, framing and pose.",
    prompt ? `User direction: ${prompt}` : "User direction: back view",
  ].join("\n\n");
}
