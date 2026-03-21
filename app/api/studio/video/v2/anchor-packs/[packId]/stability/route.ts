import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { computePackStability, isPackReady } from "@/lib/video/v2/anchorPacks";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(_request: Request, { params }: { params: Promise<{ packId: string }> }) {
  try {
    const { packId } = await params;
    const supabase = getSupabaseAdminClient();

    const { data: pack } = await supabase.from("anchor_packs").select("id,pack_type").eq("id", packId).maybeSingle();
    if (!pack) return json(404, { success: false, error: "Anchor pack not found." });

    const { data: items } = await supabase.from("anchor_pack_items").select("*").eq("anchor_pack_id", packId);
    const aggregateStability = computePackStability({ packType: pack.pack_type, items: items ?? [] });
    const ready = isPackReady({ pack_type: pack.pack_type, items: items ?? [], aggregateStability });

    const { data, error } = await supabase
      .from("anchor_packs")
      .update({ aggregate_stability_score: aggregateStability, is_ready: ready, status: ready ? "ready" : "draft" })
      .eq("id", packId)
      .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
