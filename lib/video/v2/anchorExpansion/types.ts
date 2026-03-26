import type { CreativeFidelityPlan } from "@/lib/video/v2/creativeFidelity/types";

export type ExpansionDecision = "expanded" | "partial" | "blocked" | "not_needed";
export type ExpansionConfidence = "low" | "medium" | "high";

export type ExpansionProvenance =
  | "manual_verified_override"
  | "sku_verified_truth"
  | "user_uploaded"
  | "reused_existing"
  | "expanded_generated"
  | "synthesized_support";

export type ExpansionEligibility = {
  role: string;
  eligible_for_expansion: boolean;
  eligibility_reason: string;
  confidence_level: ExpansionConfidence;
  blockers: string[];
};

export type ExpansionRoleResult = {
  role: string;
  eligible: boolean;
  attempted: boolean;
  success: boolean;
  provenance: ExpansionProvenance | null;
  confidence: ExpansionConfidence | null;
  reason: string;
  generation_id?: string | null;
  asset_id?: string | null;
};

export type AnchorExpansionResult = {
  decision: ExpansionDecision;
  roles_requested: string[];
  roles_attempted: string[];
  roles_created: string[];
  roles_failed: string[];
  results: ExpansionRoleResult[];
  reasons: string[];
  recommendations: string[];
};

export type WorkingPackExpansionItem = {
  id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  confidence_score: number;
  item_meta?: Record<string, unknown> | null;
};

export type AnchorExpansionContext = {
  clipIntentId: string;
  workingPackId: string;
  sourceProfileId: string;
  motionPrompt: string;
  planner: CreativeFidelityPlan;
  items: WorkingPackExpansionItem[];
  sourceProfile: {
    profile_name: string;
    primary_generation_id: string;
    additional_generation_ids: string[];
    subject_notes?: string | null;
    garment_notes?: string | null;
    scene_notes?: string | null;
  };
  referenceUrls: string[];
};

export type ExpansionGenerationOutput = {
  bytes: Buffer;
  mimeType: string;
  backendId: string;
  backendModel: string;
};

export type ExpandedAnchorPersistence = {
  generationId: string;
  assetId: string;
};
