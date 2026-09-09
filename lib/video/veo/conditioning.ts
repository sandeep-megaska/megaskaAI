import { angularGap, type GarmentViewRole } from "@/lib/garment/roles";

/**
 * How a Veo request is conditioned on imagery.
 *
 * THE CONSTRAINT THIS FILE EXISTS FOR
 * -----------------------------------
 * The Gemini API documents `config.referenceImages` as:
 *
 *   "The images to use as the references to generate the videos. If this field
 *    is provided, the text prompt field must also be provided. The image,
 *    video, or last_frame field are not supported."
 *
 * So reference images are mutually exclusive with a first frame (`image`) and
 * a last frame (`config.lastFrame`). The previous adapter attached all three at
 * once for Veo 3.1, which is an invalid request shape: the garment references a
 * seller supplied alongside a start frame could not take effect, leaving the
 * model to invent the unseen side of the garment. That is the single biggest
 * cause of wrong backs, straps and seams in generated turns.
 *
 * The modes below are a closed union, so an invalid combination cannot be
 * represented, let alone sent. Everything that builds a request goes through
 * `planConditioning`.
 */
export type ConditioningMode =
  /** First and last frame both supplied: Veo interpolates between two real images. */
  | "interpolate"
  /** First frame only: Veo animates forward from one real image. */
  | "first-frame"
  /** Up to three ASSET reference images, driven by the prompt. */
  | "references"
  /** Prompt only. */
  | "text";

export type ConditioningImage = {
  url: string;
  /** What this image shows, when it came from the garment library. */
  role?: GarmentViewRole;
  label?: string;
};

export type ConditioningInput = {
  startFrame?: ConditioningImage | null;
  endFrame?: ConditioningImage | null;
  /** Extra garment views. Only usable when no start/end frame is set. */
  references?: ConditioningImage[];
  /** Caller's preference; ignored when the inputs cannot support it. */
  preferred?: ConditioningMode;
};

export type ConditioningPlan = {
  mode: ConditioningMode;
  startFrame: ConditioningImage | null;
  endFrame: ConditioningImage | null;
  /** Always empty unless `mode` is "references". */
  references: ConditioningImage[];
  /** Images the caller supplied that this mode cannot carry. */
  dropped: Array<{ image: ConditioningImage; reason: string }>;
  /** Plain-language account of why this mode was chosen. */
  rationale: string;
};

/** Veo accepts at most three ASSET reference images. */
export const MAX_REFERENCE_IMAGES = 3;

function clean(image: ConditioningImage | null | undefined): ConditioningImage | null {
  const url = image?.url?.trim();
  return url ? { ...image, url } : null;
}

/**
 * Choose exactly one valid conditioning shape for the images available.
 *
 * Preference order, and why:
 *  1. `interpolate` — both endpoints are real photographs, so the garment is
 *     correct at the start AND the end of the clip. The model only has to
 *     invent the rotation between them. This is the strongest guarantee
 *     available and is why the app pushes sellers to supply a true back view.
 *  2. `references` — no true endpoint pair, but several real views of the
 *     garment. Weaker than interpolation (nothing is pinned frame-exactly) but
 *     far better than nothing.
 *  3. `first-frame` — one real image, animated forward.
 *  4. `text` — nothing is pinned; the garment is entirely invented.
 */
export function planConditioning(input: ConditioningInput): ConditioningPlan {
  const startFrame = clean(input.startFrame);
  const endFrame = clean(input.endFrame);

  const seen = new Set([startFrame?.url, endFrame?.url].filter(Boolean) as string[]);
  const references: ConditioningImage[] = [];
  for (const candidate of input.references ?? []) {
    const item = clean(candidate);
    if (!item || seen.has(item.url)) continue;
    seen.add(item.url);
    references.push(item);
  }

  const dropped: ConditioningPlan["dropped"] = [];

  // References beyond the provider cap never reach the request, so say so
  // rather than silently truncating.
  const overflow = references.slice(MAX_REFERENCE_IMAGES);
  const usableReferences = references.slice(0, MAX_REFERENCE_IMAGES);
  for (const image of overflow) {
    dropped.push({ image, reason: `Veo accepts at most ${MAX_REFERENCE_IMAGES} reference images.` });
  }

  // A caller can ask for "references" explicitly (for example to let the model
  // choreograph a turn freely), but only when there is something to reference.
  if (input.preferred === "references" && usableReferences.length) {
    for (const image of [startFrame, endFrame].filter(Boolean) as ConditioningImage[]) {
      dropped.push({
        image,
        reason: "Reference-image mode cannot carry a start or end frame; the provider rejects that combination.",
      });
    }
    return {
      mode: "references",
      startFrame: null,
      endFrame: null,
      references: usableReferences,
      dropped,
      rationale: `Composing from ${usableReferences.length} garment reference${usableReferences.length === 1 ? "" : "s"}. Nothing is pinned frame-exactly, so the opening pose is up to the model.`,
    };
  }

  if (startFrame && endFrame) {
    for (const image of usableReferences) {
      dropped.push({
        image,
        reason: "Start and end frames already pin the garment; the provider does not accept reference images alongside them.",
      });
    }
    return {
      mode: "interpolate",
      startFrame,
      endFrame,
      references: [],
      dropped,
      rationale:
        "Both endpoints are real images, so the garment is locked at the first and last frame and only the movement between them is generated.",
    };
  }

  if (usableReferences.length) {
    for (const image of [startFrame, endFrame].filter(Boolean) as ConditioningImage[]) {
      dropped.push({
        image,
        reason: "Reference images and frame conditioning cannot be combined; the references were kept.",
      });
    }
    return {
      mode: "references",
      startFrame: null,
      endFrame: null,
      references: usableReferences,
      dropped,
      rationale: `Composing from ${usableReferences.length} garment reference${usableReferences.length === 1 ? "" : "s"}. Add an end frame to pin where the clip finishes.`,
    };
  }

  if (startFrame) {
    if (endFrame) dropped.push({ image: endFrame, reason: "An end frame needs a start frame to interpolate from." });
    return {
      mode: "first-frame",
      startFrame,
      endFrame: null,
      references: [],
      dropped,
      rationale: "Animating forward from one real image. Everything the camera has not seen yet is generated.",
    };
  }

  if (endFrame) {
    // Veo has no "last frame only" mode; an end frame alone is just an image to
    // start from.
    return {
      mode: "first-frame",
      startFrame: endFrame,
      endFrame: null,
      references: [],
      dropped,
      rationale: "Only one frame was supplied, so it is used as the opening frame.",
    };
  }

  return {
    mode: "text",
    startFrame: null,
    endFrame: null,
    references: [],
    dropped,
    rationale: "No imagery supplied — the garment and the model are generated from the prompt alone.",
  };
}

export type FidelityRisk = "low" | "medium" | "high";

export type FidelityAssessment = {
  risk: FidelityRisk;
  /** Degrees of rotation with no real view to fall back on. */
  uncoveredDegrees: number | null;
  findings: string[];
  /** The single most useful thing the seller could add next. */
  nextBestAction: string | null;
};

/**
 * Judge how much of the garment the model will have to invent.
 *
 * This is the number a seller actually cares about: not "did it render" but
 * "will the back of my product be real". Risk is driven by how far the camera
 * travels across surfaces no supplied image covers.
 */
export function assessFidelity(plan: ConditioningPlan, options?: { turnIntent?: boolean }): FidelityAssessment {
  const findings: string[] = [];
  const anchored = [plan.startFrame, plan.endFrame, ...plan.references].filter(Boolean) as ConditioningImage[];
  const roles = anchored.map((image) => image.role).filter(Boolean) as GarmentViewRole[];

  if (plan.mode === "text") {
    return {
      risk: "high",
      uncoveredDegrees: null,
      findings: ["No reference imagery, so the garment is invented in full."],
      nextBestAction: "Add a front view as the start frame.",
    };
  }

  // With two endpoints we can measure the arc the model must fill.
  let uncoveredDegrees: number | null = null;
  if (plan.mode === "interpolate" && plan.startFrame?.role && plan.endFrame?.role) {
    uncoveredDegrees = angularGap(plan.startFrame.role, plan.endFrame.role);
  }

  if (plan.mode === "first-frame") {
    findings.push("Only the opening frame is pinned; every later frame is generated.");
    if (options?.turnIntent) {
      findings.push("The prompt asks for a turn, so the far side of the garment will be invented.");
    }
    return {
      risk: options?.turnIntent ? "high" : "medium",
      uncoveredDegrees: null,
      findings,
      nextBestAction: "Add the true back view as the end frame so the turn lands on a real image.",
    };
  }

  if (plan.mode === "references") {
    const hasBack = roles.includes("back");
    findings.push("References guide the garment, but no frame is pinned exactly.");
    if (!hasBack && options?.turnIntent) {
      findings.push("No back view supplied, so the reverse of the garment is guesswork.");
    }
    return {
      risk: !hasBack && options?.turnIntent ? "high" : "medium",
      uncoveredDegrees: null,
      findings,
      nextBestAction: hasBack
        ? "Set the front view as the start frame and the back view as the end frame to pin both ends."
        : "Add a verified back view of this garment.",
    };
  }

  // interpolate
  if (uncoveredDegrees === null) {
    findings.push("Both endpoints are pinned to real images.");
    return {
      risk: "low",
      uncoveredDegrees: null,
      findings,
      nextBestAction: null,
    };
  }

  findings.push(`Both endpoints are real images, spanning about ${uncoveredDegrees}° of rotation.`);

  if (uncoveredDegrees >= 135) {
    findings.push(
      "That is close to a full half-turn in one clip, which is where garment detail drifts most. Splitting it at a 3/4 view keeps each half short.",
    );
    return {
      risk: "medium",
      uncoveredDegrees,
      findings,
      nextBestAction: "Split the turn into two clips through a 3/4 view.",
    };
  }

  return { risk: "low", uncoveredDegrees, findings, nextBestAction: null };
}
