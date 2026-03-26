import type { SupabaseClient } from "@supabase/supabase-js";
import { SKU_TRUTH_ROLES, type SkuTruthProvenance, type SkuTruthRegistryEntry } from "@/lib/video/v2/skuTruth/types";

type RegistryRow = {
  id: string;
  sku_code: string;
  role: string;
  generation_id: string;
  source_kind: SkuTruthProvenance;
  is_verified: boolean;
  label: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSkuTruthEntries(supabase: SupabaseClient, skuCode: string) {
  const normalized = skuCode.trim().toUpperCase();
  const { data, error } = await supabase
    .from("sku_truth_registry")
    .select("id,sku_code,role,generation_id,source_kind,is_verified,label,notes,created_at,updated_at")
    .eq("sku_code", normalized)
    .eq("is_verified", true)
    .order("source_kind", { ascending: true })
    .order("updated_at", { ascending: false })
    .returns<RegistryRow[]>();

  if (error) throw new Error(error.message);
  return (data ?? []) as SkuTruthRegistryEntry[];
}

export async function registerSkuTruthEntry(
  supabase: SupabaseClient,
  input: {
    skuCode: string;
    role: string;
    generationId: string;
    sourceKind: SkuTruthProvenance;
    isVerified?: boolean;
    label?: string | null;
    notes?: string | null;
  },
): Promise<SkuTruthRegistryEntry> {
  const { data, error } = await supabase
    .from("sku_truth_registry")
    .upsert(
      {
        sku_code: input.skuCode.trim().toUpperCase(),
        role: input.role,
        generation_id: input.generationId,
        source_kind: input.sourceKind,
        is_verified: input.isVerified ?? true,
        label: input.label ?? null,
        notes: input.notes ?? null,
      },
      { onConflict: "sku_code,role" },
    )
    .select("id,sku_code,role,generation_id,source_kind,is_verified,label,notes,created_at,updated_at")
    .single<RegistryRow>();

  if (error || !data) throw new Error(error?.message ?? "Unable to register SKU truth entry.");
  return data;
}

export function summarizeSkuTruthCoverage(entries: Pick<SkuTruthRegistryEntry, "role">[]) {
  const present = new Set(entries.map((entry) => entry.role));
  return SKU_TRUTH_ROLES.map((role) => ({
    role,
    present: present.has(role),
  }));
}
