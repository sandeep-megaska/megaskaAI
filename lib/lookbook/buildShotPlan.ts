import type { LookbookShotSpec } from "@/lib/lookbook/types";

const DEFAULT_SHOT_PLAN: LookbookShotSpec[] = [
  {
    shotKey: "front_full",
    title: "Front Full",
    instruction: "Front full-body catalog frame, neutral stance, camera at torso height, clean separation from backdrop.",
    aspectRatio: "1:1",
    styleHint: "catalog",
  },
  {
    shotKey: "back_full",
    title: "Back Full",
    instruction: "Back full-body catalog frame with true back orientation to verify rear garment construction and print placement.",
    aspectRatio: "1:1",
    styleHint: "catalog",
  },
  {
    shotKey: "side_right",
    title: "Side Right",
    instruction: "Right-side profile to show drape, seam flow, and side silhouette without changing garment structure.",
    aspectRatio: "1:1",
    styleHint: "catalog",
  },
  {
    shotKey: "three_quarter_angle",
    title: "3/4 Angle",
    instruction: "Three-quarter angle shot with consistent studio lighting and geometry aligned to catalog standards.",
    aspectRatio: "1:1",
    styleHint: "studio",
  },
  {
    shotKey: "detail_upper",
    title: "Detail Upper",
    instruction: "Upper-body detail crop focusing on neckline, chest print placement, trim, and seam fidelity.",
    aspectRatio: "1:1",
    styleHint: "catalog",
  },
  {
    shotKey: "lifestyle_studio",
    title: "Lifestyle Studio",
    instruction: "Lifestyle studio framing with minimal scene styling while retaining strict garment identity and color fidelity.",
    aspectRatio: "1:1",
    styleHint: "lifestyle",
  },
];

export function buildShotPlan(input?: { shotSpecs?: LookbookShotSpec[] | null }): LookbookShotSpec[] {
  const supplied = (input?.shotSpecs ?? []).filter((shot) => shot?.shotKey && shot?.instruction);
  if (supplied.length) return supplied;
  return DEFAULT_SHOT_PLAN;
}
