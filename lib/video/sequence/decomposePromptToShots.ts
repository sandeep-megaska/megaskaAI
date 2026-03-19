import { randomUUID } from "node:crypto";
import { classifyMotionRiskFromActionPrompt, type MotionRiskLevel } from "@/lib/video/promptBuilder";
import type { ShotType } from "@/lib/video/sequence/types";

export type DecomposedBeat = {
  beatId: string;
  sequenceIndex: number;
  title: string;
  actionPrompt: string;
  shotType: ShotType;
  motionRiskLevel: MotionRiskLevel;
  complexity: "low" | "medium" | "high";
};

export type DecompositionResult = {
  beats: DecomposedBeat[];
  diagnostics: {
    splitTokensFound: string[];
    truncated: boolean;
    originalLength: number;
  };
};

const SPLIT_PATTERNS = ["and then", "after that", "then", "while", " and "];
const EFFECT_KEYWORDS = ["powder", "splash", "breeze", "waves", "rain", "holi", "confetti", "color"];
const TRANSITION_KEYWORDS = ["slow", "slowing", "turn", "transition", "shift", "toward", "near"];
const ESTABLISHING_KEYWORDS = ["stand", "pose", "still", "hold", "establish", "intro", "opening"];

function cleanSegment(segment: string) {
  return segment
    .replace(/[,.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitPrompt(prompt: string) {
  let fragments = [prompt];
  const found: string[] = [];

  for (const token of SPLIT_PATTERNS) {
    const next: string[] = [];
    for (const fragment of fragments) {
      if (fragment.toLowerCase().includes(token)) {
        found.push(token);
        next.push(...fragment.split(new RegExp(`\\b${token.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`, "i")));
      } else {
        next.push(fragment);
      }
    }
    fragments = next;
  }

  return { fragments, found };
}

function classifyShotType(actionPrompt: string, index: number): ShotType {
  const normalized = actionPrompt.toLowerCase();
  if (index === 0 && ESTABLISHING_KEYWORDS.some((term) => normalized.includes(term))) return "establishing";
  if (EFFECT_KEYWORDS.some((term) => normalized.includes(term))) return "effect";
  if (TRANSITION_KEYWORDS.some((term) => normalized.includes(term))) return "transition";
  return index === 0 ? "establishing" : "motion";
}

function inferComplexity(actionPrompt: string): "low" | "medium" | "high" {
  const words = actionPrompt.split(/\s+/).filter(Boolean).length;
  if (words >= 12) return "high";
  if (words >= 7) return "medium";
  return "low";
}

function buildTitle(actionPrompt: string, shotType: ShotType) {
  const short = actionPrompt.split(" ").slice(0, 5).join(" ");
  return `${shotType[0].toUpperCase()}${shotType.slice(1)}: ${short}`;
}

export function decomposePromptToShots(prompt: string, opts?: { minShots?: number; maxShots?: number }): DecompositionResult {
  const minShots = opts?.minShots ?? 2;
  const maxShots = opts?.maxShots ?? 5;
  const trimmed = prompt.trim();

  if (!trimmed) {
    return {
      beats: [],
      diagnostics: { splitTokensFound: [], truncated: false, originalLength: 0 },
    };
  }

  const { fragments, found } = splitPrompt(trimmed);
  const normalizedFragments = fragments.map(cleanSegment).filter(Boolean);
  const bounded = normalizedFragments.slice(0, maxShots);
  const truncated = normalizedFragments.length > maxShots;

  const expanded = [...bounded];
  if (expanded.length === 1 && minShots > 1) {
    const words = expanded[0]?.split(/\s+/).filter(Boolean) ?? [];
    if (words.length > 8) {
      const mid = Math.ceil(words.length / 2);
      expanded.splice(0, 1, words.slice(0, mid).join(" "), words.slice(mid).join(" "));
    }
  }

  const beats = expanded.slice(0, maxShots).map((actionPrompt, index) => {
    const shotType = classifyShotType(actionPrompt, index);
    return {
      beatId: randomUUID(),
      sequenceIndex: index,
      title: buildTitle(actionPrompt, shotType),
      actionPrompt,
      shotType,
      motionRiskLevel: classifyMotionRiskFromActionPrompt(actionPrompt),
      complexity: inferComplexity(actionPrompt),
    } satisfies DecomposedBeat;
  });

  return {
    beats,
    diagnostics: {
      splitTokensFound: Array.from(new Set(found)),
      truncated,
      originalLength: trimmed.length,
    },
  };
}
