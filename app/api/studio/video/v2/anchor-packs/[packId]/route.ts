import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ANCHOR_PACK_STATUSES } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ packId: string }> }) {
  try {
    const { packId } = await params;
    const body = (await request.json()) as {
      pack_name?: string;
      status?: string;
      notes?: string | null;
      is_ready?: boolean;
    };

    const updates: Record<string, unknown> = {};
    if (typeof body.pack_name === "string") updates.pack_name = body.pack_name.trim();
    if (body.status && ANCHOR_PACK_STATUSES.includes(body.status as (typeof ANCHOR_PACK_STATUSES)[number])) {
      updates.status = body.status;
    }
    if ("notes" in body) updates.notes = body.notes?.trim() || null;
    if (typeof body.is_ready === "boolean") updates.is_ready = body.is_ready;

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("anchor_packs")
      .update(updates)
      .eq("id", packId)
      .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
