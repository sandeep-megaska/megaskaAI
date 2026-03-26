import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { listSkuTruthEntries, registerSkuTruthEntry } from "@/lib/video/v2/skuTruth/registry";
import { applySkuTruthForClipIntent } from "@/lib/video/v2/skuTruth/apply";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  try {
    const skuCode = request.nextUrl.searchParams.get("sku_code")?.trim();
    if (!skuCode) return json(400, { success: false, error: "sku_code query param is required." });

    const supabase = getSupabaseAdminClient();
    const data = await listSkuTruthEntries(supabase, skuCode);
    return json(200, { success: true, data });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sku_code?: string;
      role?: string;
      generation_id?: string;
      source_kind?: "sku_verified_truth" | "manual_verified_override";
      label?: string;
      notes?: string;
      clip_intent_id?: string;
      apply_now?: boolean;
    };

    if (!body.sku_code?.trim()) return json(400, { success: false, error: "sku_code is required." });
    if (!body.role?.trim()) return json(400, { success: false, error: "role is required." });
    if (!body.generation_id?.trim()) return json(400, { success: false, error: "generation_id is required." });

    const sourceKind = body.source_kind === "manual_verified_override" ? "manual_verified_override" : "sku_verified_truth";
    const supabase = getSupabaseAdminClient();

    const entry = await registerSkuTruthEntry(supabase, {
      skuCode: body.sku_code,
      role: body.role,
      generationId: body.generation_id,
      sourceKind,
      label: body.label,
      notes: body.notes,
      isVerified: true,
    });

    let applied = null;
    if (body.apply_now && body.clip_intent_id?.trim()) {
      applied = await applySkuTruthForClipIntent({
        clipIntentId: body.clip_intent_id.trim(),
        skuCode: body.sku_code,
      });
    }

    return json(201, { success: true, data: { entry, applied } });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
