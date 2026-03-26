import type { AnchorPackItemRole, V2Mode } from "@/lib/video/v2/types";

export const PRODUCTION_MODES = ["phase1_template", "experimental_freeform"] as const;
export type ProductionMode = (typeof PRODUCTION_MODES)[number];

export const PHASE1_TEMPLATE_IDS = [
  "front_still_luxury",
  "front_premium_hold",
  "front_to_slight_three_quarter",
  "verified_back_hold",
  "front_to_back_controlled_reveal",
  "back_to_front_controlled_reveal",
  "detail_close_up_motion",
  "front_walk_in_place_illusion",
] as const;

export type Phase1TemplateId = (typeof PHASE1_TEMPLATE_IDS)[number];

type VerificationRequirement = {
  role: AnchorPackItemRole;
  label: string;
};

export type Phase1TemplateConfig = {
  template_id: Phase1TemplateId;
  label: string;
  description: string;
  motion_profile: string;
  camera_profile: string;
  duration_default: number;
  mode_preference: V2Mode;
  requires_exact_end_state: boolean;
  required_roles: AnchorPackItemRole[];
  verification_requirements: VerificationRequirement[];
  prompt_scaffold: string[];
  production_safe: true;
};

const TEMPLATES: readonly Phase1TemplateConfig[] = [
  {
    template_id: "front_still_luxury",
    label: "Front Still-Luxury",
    description: "Front-facing still-luxury hold with subtle breathing and micro sway only.",
    motion_profile: "subtle breathing + micro sway",
    camera_profile: "camera locked",
    duration_default: 5,
    mode_preference: "ingredients_to_video",
    requires_exact_end_state: false,
    required_roles: ["front", "fit_anchor"],
    verification_requirements: [],
    prompt_scaffold: [
      "Front-facing composition.",
      "Subtle breathing and micro sway only.",
      "Locked composition with no camera movement.",
      "Preserve exact garment fidelity, fit, seams, and print placement.",
    ],
    production_safe: true,
  },
  {
    template_id: "front_premium_hold",
    label: "Front Premium Hold",
    description: "Front-facing premium hold with one soft posture adjustment.",
    motion_profile: "soft posture adjustment",
    camera_profile: "camera locked / ultra-slow push",
    duration_default: 5,
    mode_preference: "ingredients_to_video",
    requires_exact_end_state: false,
    required_roles: ["front", "fit_anchor"],
    verification_requirements: [],
    prompt_scaffold: [
      "Front-facing premium hold.",
      "Allow one soft posture adjustment only.",
      "Camera locked or ultra-slow push without drift.",
      "Preserve exact garment fidelity and silhouette.",
    ],
    production_safe: true,
  },
  {
    template_id: "front_to_slight_three_quarter",
    label: "Front to Slight Three-Quarter",
    description: "Controlled slight turn from front to slight three-quarter, no full back reveal.",
    motion_profile: "slight controlled turn",
    camera_profile: "camera locked",
    duration_default: 5,
    mode_preference: "ingredients_to_video",
    requires_exact_end_state: false,
    required_roles: ["front", "fit_anchor", "three_quarter_left"],
    verification_requirements: [],
    prompt_scaffold: [
      "Start front-facing and turn slightly to three-quarter.",
      "Do not reveal full back view.",
      "Camera locked.",
      "Maintain exact garment fidelity during motion.",
    ],
    production_safe: true,
  },
  {
    template_id: "verified_back_hold",
    label: "Verified Back Hold",
    description: "Stable back-facing hold with subtle breathing.",
    motion_profile: "subtle breathing",
    camera_profile: "camera locked",
    duration_default: 5,
    mode_preference: "ingredients_to_video",
    requires_exact_end_state: false,
    required_roles: ["back", "fit_anchor"],
    verification_requirements: [{ role: "back", label: "Verified back truth" }],
    prompt_scaffold: [
      "Back-facing stable pose.",
      "Subtle breathing only.",
      "Camera locked.",
      "Preserve exact garment fidelity from back view.",
    ],
    production_safe: true,
  },
  {
    template_id: "front_to_back_controlled_reveal",
    label: "Front to Back Controlled Reveal",
    description: "Slow controlled front-to-back reveal with exact product continuity.",
    motion_profile: "slow controlled turn",
    camera_profile: "camera locked",
    duration_default: 5,
    mode_preference: "frames_to_video",
    requires_exact_end_state: true,
    required_roles: ["start_frame", "end_frame", "fit_anchor", "front", "back"],
    verification_requirements: [
      { role: "start_frame", label: "Verified front as start frame" },
      { role: "end_frame", label: "Verified back as end frame" },
    ],
    prompt_scaffold: [
      "Slow controlled transition from verified front start frame to verified back end frame.",
      "Preserve exact garment fidelity across transition.",
      "Final state must match verified back anchor.",
      "No redesign, no garment variation, no scene swap.",
    ],
    production_safe: true,
  },
  {
    template_id: "back_to_front_controlled_reveal",
    label: "Back to Front Controlled Reveal",
    description: "Slow controlled back-to-front reveal with exact product continuity.",
    motion_profile: "slow controlled reverse turn",
    camera_profile: "camera locked",
    duration_default: 5,
    mode_preference: "frames_to_video",
    requires_exact_end_state: true,
    required_roles: ["start_frame", "end_frame", "fit_anchor", "front", "back"],
    verification_requirements: [
      { role: "start_frame", label: "Verified back as start frame" },
      { role: "end_frame", label: "Verified front as end frame" },
    ],
    prompt_scaffold: [
      "Slow controlled transition from verified back start frame to verified front end frame.",
      "Preserve exact garment fidelity across transition.",
      "Final state must match verified front anchor.",
      "No redesign, no garment variation, no scene swap.",
    ],
    production_safe: true,
  },
  {
    template_id: "detail_close_up_motion",
    label: "Detail Close-Up Motion",
    description: "Close-up detail clip with tiny motion only.",
    motion_profile: "tiny motion",
    camera_profile: "locked / ultra-slow camera",
    duration_default: 4,
    mode_preference: "ingredients_to_video",
    requires_exact_end_state: false,
    required_roles: ["detail"],
    verification_requirements: [{ role: "detail", label: "Verified detail truth" }],
    prompt_scaffold: [
      "Close-up product detail framing.",
      "Tiny motion only.",
      "Preserve seams, print, fabric texture, and strap shape.",
      "No redesign or proportion changes.",
    ],
    production_safe: true,
  },
  {
    template_id: "front_walk_in_place_illusion",
    label: "Front Walk-in-Place Illusion",
    description: "Front-facing in-place weight shift without forward travel.",
    motion_profile: "in-place weight shift",
    camera_profile: "camera locked",
    duration_default: 5,
    mode_preference: "ingredients_to_video",
    requires_exact_end_state: false,
    required_roles: ["front", "fit_anchor"],
    verification_requirements: [],
    prompt_scaffold: [
      "Front-facing in-place walk illusion.",
      "Subtle weight shift only with no actual travel.",
      "Camera locked.",
      "Preserve exact garment fidelity and fit.",
    ],
    production_safe: true,
  },
] as const;

export const PHASE1_TEMPLATES = TEMPLATES;

export function isPhase1TemplateId(value: string | null | undefined): value is Phase1TemplateId {
  return Boolean(value && (PHASE1_TEMPLATE_IDS as readonly string[]).includes(value));
}

export function getPhase1TemplateById(templateId: string | null | undefined): Phase1TemplateConfig | null {
  if (!isPhase1TemplateId(templateId)) return null;
  return PHASE1_TEMPLATES.find((template) => template.template_id === templateId) ?? null;
}

export function buildTemplatePromptScaffold(template: Phase1TemplateConfig, sceneFlavor?: string | null) {
  const flavor = sceneFlavor?.trim();
  return [
    `Template: ${template.label}`,
    ...template.prompt_scaffold,
    flavor ? `Scene flavor: ${flavor}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getTemplateReadiness(template: Phase1TemplateConfig, availableRoles: AnchorPackItemRole[]) {
  const roleSet = new Set(availableRoles);
  const missingRoles = template.required_roles.filter((role) => !roleSet.has(role));
  return {
    ready: missingRoles.length === 0,
    missingRoles,
  };
}
