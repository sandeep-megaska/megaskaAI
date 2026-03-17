import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.from("model_library").select("*, model_assets(*)").eq("id", id).maybeSingle();
    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    const { data, error } = await supabase
      .from("model_library")
      .update({
        model_code: body.model_code,
        display_name: body.display_name,
        category: body.category,
        status: body.status,
        prompt_anchor: body.prompt_anchor,
        negative_prompt: body.negative_prompt,
        notes: body.notes,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });

    if (Array.isArray(body.asset_urls)) {
      await supabase.from("model_assets").delete().eq("model_id", id);
      const assetUrls = body.asset_urls.filter(Boolean);
      if (assetUrls.length) {
        await supabase.from("model_assets").insert(
          assetUrls.map((url: string, index: number) => ({
            model_id: id,
            asset_url: url,
            is_primary: index === 0,
            sort_order: index,
          })),
        );
      }
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
