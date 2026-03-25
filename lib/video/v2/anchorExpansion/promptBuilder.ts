import type { AnchorExpansionContext } from "@/lib/video/v2/anchorExpansion/types";

function roleInstruction(role: string) {
  if (role === "back") {
    return "Generate a clean rear-facing anchor image of the same model wearing the exact same garment. Preserve back construction, straps, closures, seams, silhouette, and coverage. Neutral studio setup, centered framing, no motion blur, no stylization.";
  }
  if (role === "three_quarter_left") {
    return "Generate a left three-quarter anchor image of the same model and exact garment. Keep pose controlled, body rotated about 45 degrees to the viewer's left. Preserve garment fit and structure exactly. Neutral studio framing.";
  }
  if (role === "three_quarter_right") {
    return "Generate a right three-quarter anchor image of the same model and exact garment. Keep pose controlled, body rotated about 45 degrees to the viewer's right. Preserve garment fit and structure exactly. Neutral studio framing.";
  }
  if (role === "three_quarter_side") {
    return "Generate a controlled three-quarter side anchor image of the same model and exact garment with strict fidelity to garment geometry and fit. Neutral studio framing, no cinematic effects.";
  }
  if (role === "detail") {
    return "Generate a garment detail anchor image showing fabric/texture/stitching zones relevant to the requested motion while preserving exact garment truth and materials. Close-up framing with sharp clarity and neutral lighting.";
  }
  if (role === "start_frame") {
    return "Generate a stable start-frame anchor image for frame-constrained video generation. Match model identity and exact garment truth. Neutral framing, no blur, no expressive pose.";
  }
  if (role === "end_frame") {
    return "Generate a stable end-frame anchor image for frame-constrained video generation. Match model identity and exact garment truth. Neutral framing, no blur, no expressive pose.";
  }
  return "Generate a deterministic truth-building anchor image preserving model identity and exact garment geometry.";
}

export function buildExpansionPrompt(context: AnchorExpansionContext, role: string) {
  const profileNotes = [context.sourceProfile.subject_notes, context.sourceProfile.garment_notes, context.sourceProfile.scene_notes]
    .filter(Boolean)
    .join("\n");

  return [
    "Anchor Expansion Task (fidelity-first).",
    `Target role: ${role}.`,
    roleInstruction(role),
    "Hard constraints: preserve model identity, garment cut, coverage, and construction. Do not invent unseen design elements. Prefer conservative truth over creativity.",
    `Original motion intent: ${context.motionPrompt}`,
    profileNotes ? `Source profile notes:\n${profileNotes}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}
