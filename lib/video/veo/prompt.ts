import { GARMENT_ROLE_LABELS, type GarmentViewRole } from "@/lib/garment/roles";
import type { ConditioningPlan } from "@/lib/video/veo/conditioning";

export const MOTION_PRESETS = [
  "product-turn",
  "slow-pivot",
  "camera-orbit",
  "settle-and-hold",
  "walk-toward",
  "freeform",
] as const;

export type MotionPreset = (typeof MOTION_PRESETS)[number];

export const MOTION_PRESET_LABELS: Record<MotionPreset, string> = {
  "product-turn": "Product turn",
  "slow-pivot": "Slow pivot",
  "camera-orbit": "Camera orbit",
  "settle-and-hold": "Settle and hold",
  "walk-toward": "Walk toward camera",
  freeform: "Freeform",
};

export const MOTION_PRESET_HINTS: Record<MotionPreset, string> = {
  "product-turn": "Model rotates steadily so every side of the garment is shown.",
  "slow-pivot": "A short, controlled pivot. The safest option for detailed garments.",
  "camera-orbit": "The model holds still and the camera travels around them.",
  "settle-and-hold": "Move into the final pose early, then hold it steady.",
  "walk-toward": "Model walks toward the camera; the garment stays front-on.",
  freeform: "Follow the prompt with no added camera direction.",
};

const MOTION_PRESET_DIRECTION: Record<MotionPreset, string> = {
  "product-turn":
    "The model rotates at a steady, even pace on a fixed spot. Feet stay planted, torso stays upright, the camera does not move.",
  "slow-pivot":
    "The model pivots slowly and only partway. Movement is small and controlled; no fast spins or bouncing.",
  "camera-orbit":
    "The model holds a still pose. The camera arcs smoothly around them at a constant distance and height.",
  "settle-and-hold":
    "The model moves into the final pose within the first half of the clip, then holds it still and steady.",
  "walk-toward":
    "The model walks toward the camera at an even pace, staying square to it. The garment remains front-facing.",
  freeform: "Follow the described action with natural, cinematic motion.",
};

/**
 * Garment details a seller can pin in words. Kept short and specific: long
 * descriptions dilute the rest of the prompt, and the reference imagery is
 * doing most of the work.
 */
export type GarmentAnchors = {
  backNeckline: string;
  strapStructure: string;
  backCoverage: string;
  seamLines: string;
  fabricFinish: string;
  colorContinuity: string;
};

export const GARMENT_ANCHOR_FIELDS: Array<{
  key: keyof GarmentAnchors;
  label: string;
  placeholder: string;
}> = [
  { key: "backNeckline", label: "Back neckline", placeholder: "Deep scoop, no closure" },
  { key: "strapStructure", label: "Straps", placeholder: "Thin crossed straps" },
  { key: "backCoverage", label: "Back coverage", placeholder: "High-cut, full seat coverage" },
  { key: "seamLines", label: "Seams", placeholder: "Single centre seam" },
  { key: "fabricFinish", label: "Fabric finish", placeholder: "Matte, slight stretch" },
  { key: "colorContinuity", label: "Colour / print", placeholder: "Solid emerald, no print" },
];

const ANCHOR_PHRASING: Record<keyof GarmentAnchors, string> = {
  backNeckline: "Back neckline",
  strapStructure: "Strap structure",
  backCoverage: "Back coverage",
  seamLines: "Seam lines",
  fabricFinish: "Fabric finish",
  colorContinuity: "Colour and print",
};

export function createEmptyGarmentAnchors(): GarmentAnchors {
  return {
    backNeckline: "",
    strapStructure: "",
    backCoverage: "",
    seamLines: "",
    fabricFinish: "",
    colorContinuity: "",
  };
}

/**
 * Does this prompt ask the subject to turn?
 *
 * A turn is what exposes surfaces no still image covers, so it drives both the
 * fidelity warnings and how hard the prompt leans on continuity language.
 */
export function detectsTurnIntent(prompt: string, preset: MotionPreset): boolean {
  if (preset === "product-turn" || preset === "camera-orbit" || preset === "slow-pivot") return true;
  return /\b(turn|turns|turning|rotate|rotates|rotating|spin|spins|pivot|pivots|back view|rear view|walk away|walks away|over.the.shoulder)\b/i.test(
    prompt,
  );
}

/**
 * Negative prompt.
 *
 * Veo takes `config.negativePrompt` as a plain list of things to avoid. These
 * are the failure modes that make an e-commerce clip unusable: the garment
 * changing shape mid-turn, extra hardware appearing on the back, the print
 * shifting. Stated as nouns, not as "don't ..." instructions, which is what the
 * parameter expects.
 */
export function buildNegativePrompt(extra?: string): string {
  const base = [
    "garment changing shape, colour or pattern between frames",
    "straps, ties, zips, buttons or cut-outs appearing or disappearing",
    "logo or print drifting, warping or re-rendering",
    "extra limbs, distorted hands, warped face",
    "cuts, jump cuts, scene changes, camera teleporting",
    "text overlays, watermarks, captions",
    "background changing or shifting",
  ];
  const trimmed = extra?.trim();
  return [...base, ...(trimmed ? [trimmed] : [])].join(", ");
}

function describeRole(role: GarmentViewRole | undefined, fallback: string): string {
  return role ? GARMENT_ROLE_LABELS[role].toLowerCase() : fallback;
}

export type CompilePromptInput = {
  /** What the seller typed. */
  creativePrompt: string;
  preset: MotionPreset;
  plan: ConditioningPlan;
  anchors: GarmentAnchors;
  /** Optional product wording, e.g. "emerald ribbed one-piece swimsuit". */
  garmentDescription?: string;
};

/**
 * Assemble the text prompt.
 *
 * Ordering matters: Veo weights the opening of the prompt most heavily, so the
 * seller's own creative direction leads. Continuity constraints follow as a
 * short, concrete block — long boilerplate crowds out the actual instruction
 * and measurably weakens adherence.
 *
 * The wording adapts to the conditioning mode because the modes give the model
 * genuinely different information. Telling it to "match the final frame" when
 * no final frame was sent is noise at best.
 */
export function compileVideoPrompt(input: CompilePromptInput): string {
  const { creativePrompt, preset, plan, anchors, garmentDescription } = input;
  const blocks: string[] = [];

  const creative = creativePrompt.trim();
  if (creative) blocks.push(creative);

  blocks.push(MOTION_PRESET_DIRECTION[preset]);

  if (garmentDescription?.trim()) {
    blocks.push(`The subject is wearing ${garmentDescription.trim()}.`);
  }

  switch (plan.mode) {
    case "interpolate": {
      const from = describeRole(plan.startFrame?.role, "the opening pose");
      const to = describeRole(plan.endFrame?.role, "the closing pose");
      blocks.push(
        `Begin exactly on the supplied first frame (${from}) and finish exactly on the supplied final frame (${to}). ` +
          "Both frames show the same real garment: carry its construction, colour and print through every frame in between without redesigning any part that rotates into view.",
      );
      break;
    }
    case "references":
      blocks.push(
        "The reference images show the same real garment from different angles. Reproduce that exact garment — its cut, seams, straps, colour and print — and do not invent detail that contradicts them.",
      );
      break;
    case "first-frame":
      blocks.push(
        "Begin exactly on the supplied first frame and keep the garment identical to it throughout: same cut, same seams, same colour, same print.",
      );
      break;
    case "text":
      break;
  }

  const anchorLines = GARMENT_ANCHOR_FIELDS.map(({ key }) => {
    const value = anchors[key]?.trim();
    return value ? `${ANCHOR_PHRASING[key]}: ${value}` : null;
  }).filter(Boolean);

  if (anchorLines.length) {
    blocks.push(`Hold these garment details constant — ${anchorLines.join("; ")}.`);
  }

  blocks.push("One continuous take, no cuts. Keep lighting, background and framing stable.");

  return blocks.join("\n\n");
}
