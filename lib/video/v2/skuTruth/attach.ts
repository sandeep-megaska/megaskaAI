import type { SupabaseClient } from "@supabase/supabase-js";
import { listSkuTruthEntries } from "@/lib/video/v2/skuTruth/registry";
import type { WorkingPackTruthAttachment } from "@/lib/video/v2/skuTruth/types";

type WorkingPackItemRow = {
  id: string;
  role: string;
  generation_id: string | null;
  source_kind: string;
  sort_order: number;
};

const PROTECTED_EXISTING = new Set(["manual_verified_override", "sku_verified_truth", "user_uploaded"]);

export async function attachSkuTruthToWorkingPack(
  supabase: SupabaseClient,
  input: { workingPackId: string; skuCode: string },
): Promise<WorkingPackTruthAttachment[]> {
  const truthEntries = await listSkuTruthEntries(supabase, input.skuCode);
  if (!truthEntries.length) return [];

  const { data: rawItems, error: itemError } = await supabase
    .from("working_pack_items")
    .select("id,role,generation_id,source_kind,sort_order")
    .eq("working_pack_id", input.workingPackId)
    .returns<WorkingPackItemRow[]>();

  if (itemError) throw new Error(itemError.message);
  const items = rawItems ?? [];
  const byRole = new Map(items.map((item) => [item.role, item]));
  const maxSortOrder = items.reduce((max, item) => Math.max(max, Number(item.sort_order ?? 0)), 0);

  const attachments: WorkingPackTruthAttachment[] = [];
  for (const entry of truthEntries) {
    const existing = byRole.get(entry.role);
    if (existing?.generation_id && PROTECTED_EXISTING.has(existing.source_kind)) {
      attachments.push({
        role: entry.role,
        generation_id: existing.generation_id,
        source_kind: existing.source_kind as WorkingPackTruthAttachment["source_kind"],
        action: "skipped",
        reason: `Role already contains protected truth (${existing.source_kind}).`,
      });
      continue;
    }

    const payload = {
      working_pack_id: input.workingPackId,
      role: entry.role,
      generation_id: entry.generation_id,
      source_kind: entry.source_kind,
      synthetic_prompt: null,
      confidence_score: 1,
      sort_order: existing ? existing.sort_order : maxSortOrder + attachments.length + 1,
      item_meta: {
        source: entry.source_kind,
        provenance: entry.source_kind,
        sku_code: entry.sku_code,
        sku_truth_registry_id: entry.id,
        verified_truth: true,
        label: entry.label,
      },
    };

    if (existing) {
      const { error: updateError } = await supabase
        .from("working_pack_items")
        .update(payload)
        .eq("id", existing.id);

      if (updateError) throw new Error(updateError.message);
      attachments.push({ role: entry.role, generation_id: entry.generation_id, source_kind: entry.source_kind, action: "updated" });
      continue;
    }

    const { error: insertError } = await supabase
      .from("working_pack_items")
      .insert(payload);

    if (insertError) throw new Error(insertError.message);
    attachments.push({ role: entry.role, generation_id: entry.generation_id, source_kind: entry.source_kind, action: "inserted" });
  }

  return attachments;
}
