import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ANCHOR_PACK_TYPES, type AnchorPackType } from "@/lib/video/v2/types";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("anchor_packs")
      .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
      .order("updated_at", { ascending: false });

    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pack_name?: string; pack_type?: AnchorPackType; notes?: string };
    if (!body.pack_name?.trim()) return json(400, { success: false, error: "pack_name is required." });
    if (!body.pack_type || !ANCHOR_PACK_TYPES.includes(body.pack_type)) {
      return json(400, { success: false, error: "pack_type is invalid." });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("anchor_packs")
      .insert({
        pack_name: body.pack_name.trim(),
        pack_type: body.pack_type,
        notes: body.notes?.trim() || null,
      })
      .select("*,anchor_pack_items(*,generation:generations(id,prompt,asset_url,url,generation_kind))")
      .single();

    if (error) return json(400, { success: false, error: error.message });
    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
