import type { SupabaseClient } from "@supabase/supabase-js";
import {
  GARMENT_VIEW_ROLES,
  isGarmentViewRole,
  type GarmentViewEntry,
  type GarmentViewProvenance,
  type GarmentViewRole,
  type ResolvedGarmentView,
} from "@/lib/garment/roles";

const ENTRY_COLUMNS = "id,sku_code,role,generation_id,source_kind,is_verified,label,notes,created_at,updated_at";

export function normalizeSkuCode(skuCode: string) {
  return skuCode.trim().toUpperCase();
}

export async function listGarmentViews(supabase: SupabaseClient, skuCode: string): Promise<GarmentViewEntry[]> {
  const { data, error } = await supabase
    .from("sku_truth_registry")
    .select(ENTRY_COLUMNS)
    .eq("sku_code", normalizeSkuCode(skuCode))
    .eq("is_verified", true)
    .order("updated_at", { ascending: false })
    .returns<GarmentViewEntry[]>();

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Library entries joined to the image each one points at.
 *
 * The registry stores a generation id, but everything downstream — the frame
 * pickers, the conditioning planner, the Veo request — needs a URL. Resolving
 * here keeps that join in one place, and drops entries whose generation has
 * since been deleted rather than handing out a role with no image behind it.
 */
export async function resolveGarmentViews(supabase: SupabaseClient, skuCode: string): Promise<ResolvedGarmentView[]> {
  const entries = await listGarmentViews(supabase, skuCode);
  if (!entries.length) return [];

  const { data, error } = await supabase
    .from("generations")
    .select("id,prompt,asset_url,url")
    .in(
      "id",
      entries.map((entry) => entry.generation_id),
    )
    .returns<Array<{ id: string; prompt: string | null; asset_url: string | null; url: string | null }>>();

  if (error) throw new Error(error.message);

  const byId = new Map((data ?? []).map((row) => [row.id, row]));

  return entries.flatMap((entry) => {
    const row = byId.get(entry.generation_id);
    const url = row?.asset_url ?? row?.url ?? null;
    if (!url || !isGarmentViewRole(entry.role)) return [];
    return [{ ...entry, role: entry.role, url, prompt: row?.prompt ?? null }];
  });
}

export async function registerGarmentView(
  supabase: SupabaseClient,
  input: {
    skuCode: string;
    role: GarmentViewRole;
    generationId: string;
    sourceKind: GarmentViewProvenance;
    label?: string | null;
    notes?: string | null;
  },
): Promise<GarmentViewEntry> {
  const { data, error } = await supabase
    .from("sku_truth_registry")
    .upsert(
      {
        sku_code: normalizeSkuCode(input.skuCode),
        role: input.role,
        generation_id: input.generationId,
        source_kind: input.sourceKind,
        is_verified: true,
        label: input.label ?? null,
        notes: input.notes ?? null,
      },
      { onConflict: "sku_code,role" },
    )
    .select(ENTRY_COLUMNS)
    .single<GarmentViewEntry>();

  if (error || !data) throw new Error(error?.message ?? "Unable to save this garment view.");
  return data;
}

export async function deleteGarmentView(supabase: SupabaseClient, skuCode: string, role: GarmentViewRole) {
  const { error } = await supabase
    .from("sku_truth_registry")
    .delete()
    .eq("sku_code", normalizeSkuCode(skuCode))
    .eq("role", role);

  if (error) throw new Error(error.message);
}

/** Which roles a SKU has, and which are still missing. */
export function summarizeCoverage(views: Array<Pick<ResolvedGarmentView, "role">>) {
  const present = new Set(views.map((view) => view.role));
  return GARMENT_VIEW_ROLES.map((role) => ({ role, present: present.has(role) }));
}
