import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("model_library")
      .select("*, model_assets(*)")
      .eq("id", id)
      .maybeSingle();

    if (error) return json(500, { success: false, error: error.message });

    if (!data) return json(404, { success: false, error: "Model not found." });

    const sortedAssets = [...(data.model_assets ?? [])].sort((a, b) => {
      if ((a.is_primary ? 1 : 0) !== (b.is_primary ? 1 : 0)) return a.is_primary ? -1 : 1;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });

    return json(200, { success: true, data: { ...data, model_assets: sortedAssets } });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const updates: Record<string, unknown> = {};
    const allowedFields = ["model_code", "display_name", "category", "status", "prompt_anchor", "negative_prompt", "notes"];

    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field] ?? null;
    }

    const { data, error } = await supabase.from("model_library").update(updates).eq("id", id).select("*").single();

    if (error) {
      console.error("[models/:id][PATCH] update error", error);
      return json(400, { success: false, error: error.message });
    }

    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("model_library").delete().eq("id", id);
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
