import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    const includeAll = new URL(request.url).searchParams.get("include_all") === "1";

    const baseQuery = supabase
      .from("model_library")
      .select("id,model_code,display_name,category,status,prompt_anchor,negative_prompt,notes,created_at,model_assets(id,asset_url,is_primary,sort_order)")
      .order("created_at", { ascending: false });

    const query = includeAll ? baseQuery : baseQuery.eq("status", "active");
    const { data, error } = await query;

    if (error) {
      console.error("[models][GET] query error", error);
      return json(500, { success: false, error: error.message });
    }

    const models = (data ?? []).map((item) => {
      const assets = (item.model_assets ?? []) as { id: string }[];
      return {
        ...item,
        asset_count: assets.length,
      };
    });

    models.sort((a, b) => {
      if (a.status === b.status) return 0;
      if (a.status === "active") return -1;
      if (b.status === "active") return 1;
      return 0;
    });

    return json(200, { success: true, data: models });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = getSupabaseAdminClient();

    if (!body.model_code || !body.display_name || !body.category) {
      return json(400, { success: false, error: "model_code, display_name, and category are required." });
    }

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

    if (error) {
      console.error("[models][POST] insert error", error);
      return json(400, { success: false, error: error.message });
    }

    return json(201, { success: true, data });
  } catch (error) {
    return json(500, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
