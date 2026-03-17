import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from("model_library")
      .select("*, model_assets(*)")
      .order("created_at", { ascending: false });

    if (error) return json(500, { success: false, error: error.message });
    return json(200, { success: true, data: data ?? [] });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();
    const assetUrls = Array.isArray(body.asset_urls) ? body.asset_urls.filter(Boolean) : [];

    const { data, error } = await supabase
      .from("model_library")
      .insert({
        model_code: body.model_code,
        display_name: body.display_name,
        category: body.category,
        status: body.status ?? "active",
        prompt_anchor: body.prompt_anchor ?? null,
        negative_prompt: body.negative_prompt ?? null,
        notes: body.notes ?? null,
      })
      .select("*")
      .single();

    if (error) return json(400, { success: false, error: error.message });

    if (assetUrls.length) {
      await supabase.from("model_assets").insert(
        assetUrls.map((url: string, index: number) => ({
          model_id: data.id,
          asset_url: url,
          is_primary: index === 0,
          sort_order: index,
        })),
      );
    }

    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
