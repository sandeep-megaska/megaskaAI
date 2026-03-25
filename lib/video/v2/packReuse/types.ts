import type { AnchorExpansionContext, ExpansionProvenance, WorkingPackExpansionItem } from "@/lib/video/v2/anchorExpansion/types";

export type ReuseConfidence = "low" | "medium" | "high";
export type ReuseDecision = "reuse" | "skip" | "fallback_to_expand";

export type ReuseCandidateRecord = {
  role: string;
  generation_id: string;
  source_kind: string;
  confidence_score: number;
  item_id: string;
  working_pack_id: string;
  source_profile_id: string;
  clip_intent_id: string;
  created_at: string | null;
  source_generation_id: string | null;
  provenance: ExpansionProvenance;
  quality_score: number;
};

export type ReuseCandidate = {
  asset_id: string;
  generation_id?: string | null;
  role: string;
  provenance: ExpansionProvenance;
  reuse_confidence: ReuseConfidence;
  score: number;
  reasons: string[];
  eligible: boolean;
  source_item_id: string;
};

export type RoleReuseDecision = {
  role: string;
  candidates: ReuseCandidate[];
  chosen_candidate?: ReuseCandidate | null;
  decision: ReuseDecision;
  reason: string;
};

export type PackReuseResult = {
  roles_requested: string[];
  roles_reused: string[];
  roles_unresolved: string[];
  decisions: RoleReuseDecision[];
  reasons: string[];
  recommendations: string[];
};

export type PackReuseContext = AnchorExpansionContext;

export type PersistReuseInput = {
  context: PackReuseContext;
  role: string;
  candidate: ReuseCandidate;
};

export type PersistReuseResult = {
  working_pack_item_id: string;
};

export type ReuseExecutionDeps = {
  findCandidates: (context: PackReuseContext, role: string) => Promise<ReuseCandidateRecord[]>;
  persistReuse: (input: PersistReuseInput) => Promise<PersistReuseResult>;
  listExistingItems: (context: PackReuseContext) => WorkingPackExpansionItem[];
};
