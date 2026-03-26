import { parseIntentSignals } from "@/lib/video/v2/creativeFidelity/intentParser";
import type { V2Mode } from "@/lib/video/v2/types";

type RuntimeAnchorItem = {
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score?: number | null;
};

export type RuntimeFrameSelection = {
  startFrameGenerationId: string | null;
  endFrameGenerationId: string | null;
  startRole: string | null;
  endRole: string | null;
  usedVerifiedFrontBackPair: boolean;
  exactEndStateReason: string | null;
};

const VERIFIED_SOURCE_PRIORITY: Record<string, number> = {
  manual_verified_override: 100,
  sku_verified_truth: 95,
  user_uploaded: 85,
  reused_existing: 70,
  expanded_generated: 60,
  synthesized_support: 50,
  synthesized: 40,
};

function anchorRank(item: RuntimeAnchorItem) {
  const sourceScore = VERIFIED_SOURCE_PRIORITY[item.source_kind] ?? 20;
  const confidenceScore = Number(item.confidence_score ?? 0);
  return sourceScore + Math.max(0, Math.min(1, confidenceScore));
}

function pickBestForRole(items: RuntimeAnchorItem[], role: string) {
  const matches = items.filter((item) => item.role === role && item.generation_id);
  if (!matches.length) return null;
  matches.sort((a, b) => anchorRank(b) - anchorRank(a));
  return matches[0];
}

function isVerifiedTruthSource(sourceKind: string) {
  return sourceKind === "manual_verified_override" || sourceKind === "sku_verified_truth";
}

function pickBestVerifiedForRole(items: RuntimeAnchorItem[], role: string) {
  const verifiedMatches = items.filter((item) => item.role === role && item.generation_id && isVerifiedTruthSource(item.source_kind));
  if (!verifiedMatches.length) return null;
  verifiedMatches.sort((a, b) => anchorRank(b) - anchorRank(a));
  return verifiedMatches[0];
}

function detectEndRole(prompt: string) {
  const normalized = prompt.toLowerCase();
  if (/\b(back design|show(?:s)? the back|rear reveal|rear view|turn(?:s|ing)? to back|front\s*to\s*back|exact back view|from behind|back view)\b/.test(normalized)) {
    return "back";
  }
  if (/\b(three[- ]?quarter left|left side reveal|left profile|turn left)\b/.test(normalized)) return "three_quarter_left";
  if (/\b(three[- ]?quarter right|right side reveal|right profile|turn right)\b/.test(normalized)) return "three_quarter_right";
  if (/\b(side[- ]to[- ]side exact product reveal|exact side view|side view reveal)\b/.test(normalized)) {
    return "three_quarter_right";
  }
  return null;
}

export function detectExactEndStateRequired(motionPrompt: string) {
  const normalized = motionPrompt.toLowerCase();
  const parsed = parseIntentSignals(motionPrompt);
  const explicitExact = /\b(exact|precise|must match|no variation|strict fidelity)\b/.test(normalized);
  const explicitReveal = /\b(reveal|show|turn to|front(?:\s*|-)\s*to(?:\s*|-)\s*back|rear reveal|back design)\b/.test(normalized);
  const geometrySensitive = /\b(garment geometry|strap placement|silhouette|cut line|product reveal)\b/.test(normalized);
  const explicitBackReveal =
    /\b(show(?:s)?(?: the)? back design|turn(?:s|ing)? to back|rear reveal|front(?:\s*|-)\s*to(?:\s*|-)\s*back reveal)\b/.test(normalized);

  return parsed.hasBackReveal || parsed.hasWalkAwayMotion || explicitBackReveal || (explicitExact && explicitReveal) || geometrySensitive;
}

export function selectRuntimeFrames(input: { motionPrompt: string; items: RuntimeAnchorItem[]; exactEndStateRequired: boolean }): RuntimeFrameSelection {
  const withGeneration = input.items.filter((item) => Boolean(item.generation_id));
  const verifiedFront = pickBestVerifiedForRole(withGeneration, "front");
  const verifiedBack = pickBestVerifiedForRole(withGeneration, "back");

  if (input.exactEndStateRequired && verifiedFront && verifiedBack) {
    return {
      startFrameGenerationId: verifiedFront.generation_id ?? null,
      endFrameGenerationId: verifiedBack.generation_id ?? null,
      startRole: verifiedFront.role ?? "front",
      endRole: verifiedBack.role ?? "back",
      usedVerifiedFrontBackPair: true,
      exactEndStateReason: "verified_front_back_truth_pair",
    };
  }

  const start = verifiedFront ?? pickBestForRole(withGeneration, "front") ?? pickBestForRole(withGeneration, "fit_anchor");

  const endRole = detectEndRole(input.motionPrompt);
  const end = endRole ? pickBestForRole(withGeneration, endRole) : null;

  if (!input.exactEndStateRequired) {
    return {
      startFrameGenerationId: start?.generation_id ?? null,
      endFrameGenerationId: null,
      startRole: start?.role ?? null,
      endRole: null,
      usedVerifiedFrontBackPair: false,
      exactEndStateReason: null,
    };
  }

  return {
    startFrameGenerationId: start?.generation_id ?? null,
    endFrameGenerationId: end?.generation_id ?? null,
    startRole: start?.role ?? null,
    endRole,
    usedVerifiedFrontBackPair: false,
    exactEndStateReason: endRole ? "prompt_end_role_match" : "prompt_end_role_missing",
  };
}

export function resolveRuntimeMode(input: { requestedMode: V2Mode; exactEndStateRequired: boolean; startFrameGenerationId: string | null; endFrameGenerationId: string | null }): V2Mode {
  if (!input.exactEndStateRequired) return input.requestedMode;
  if (!input.startFrameGenerationId || !input.endFrameGenerationId) {
    throw new Error("Exact end-state clips require verified start/end frame anchors before generation.");
  }
  return "frames_to_video";
}

export function hardenPromptForExactState(input: { directorPrompt: string; exactEndStateRequired: boolean }) {
  if (!input.exactEndStateRequired) return input.directorPrompt;

  const hardening = [
    "Runtime fidelity enforcement: maintain the exact garment structure from the verified anchors.",
    "Do not alter the back design, strap placement, cut, silhouette, or garment geometry.",
    "Final state must match the provided verified end frame anchor.",
    "No reinterpretation, redesign, or variation of the garment is allowed.",
    "Preserve exact product fidelity across the transition.",
  ];

  return `${input.directorPrompt}\n${hardening.join("\n")}`;
}

export function validateRuntimeFidelity(input: { exactEndStateRequired: boolean; modeSelected: V2Mode; startFrameGenerationId: string | null; endFrameGenerationId: string | null }) {
  if (!input.exactEndStateRequired) return;
  if (input.modeSelected !== "frames_to_video") {
    throw new Error("Exact end-state runs must execute in frames_to_video mode.");
  }
  if (!input.startFrameGenerationId || !input.endFrameGenerationId) {
    throw new Error("Exact end-state runs are blocked: verified start/end frame anchors are required.");
  }
}

export function getVerifiedAnchorIds(items: RuntimeAnchorItem[]) {
  return items
    .filter((item) => Boolean(item.generation_id))
    .sort((a, b) => anchorRank(b) - anchorRank(a))
    .slice(0, 6)
    .map((item) => item.generation_id as string);
}
