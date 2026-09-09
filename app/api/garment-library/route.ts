import { NextRequest, NextResponse } from "next/server";
import { isGarmentViewRole } from "@/lib/garment/roles";
import { deleteGarmentView, registerGarmentView, resolveGarmentViews, summarizeCoverage } from "@/lib/garment/registry";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * The verified garment views for a SKU.
 *
 * This is the answer to "the model invented the back of my product": once a
 * seller approves a real back view here, every later clip can be conditioned on
 * it instead of guessing.
 */

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function GET(request: NextRequest) {
  try {
    const skuCode = request.nextUrl.searchParams.get("sku_code")?.trim();
    if (!skuCode) return json(400, { success: false, error: "A sku_code query parameter is required." });

    const supabase = getSupabaseAdminClient();
    const views = await resolveGarmentViews(supabase, skuCode);

    return json(200, {
      success: true,
      data: { sku_code: skuCode.toUpperCase(), views, coverage: summarizeCoverage(views) },
    });
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unable to load the garment library.",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      sku_code?: string;
      role?: string;
      generation_id?: string;
      source_kind?: string;
      label?: string;
      notes?: string;
    };

    if (!body.sku_code?.trim()) return json(400, { success: false, error: "sku_code is required." });
    if (!body.generation_id?.trim()) return json(400, { success: false, error: "generation_id is required." });
    if (!isGarmentViewRole(body.role)) {
      return json(400, { success: false, error: "A valid garment view role is required." });
    }

    const supabase = getSupabaseAdminClient();
    const entry = await registerGarmentView(supabase, {
      skuCode: body.sku_code,
      role: body.role,
      generationId: body.generation_id.trim(),
      sourceKind: body.source_kind === "manual_verified_override" ? "manual_verified_override" : "sku_verified_truth",
      label: body.label ?? null,
      notes: body.notes ?? null,
    });

    return json(201, { success: true, data: { entry } });
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unable to save this garment view.",
    });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const skuCode = request.nextUrl.searchParams.get("sku_code")?.trim();
    const role = request.nextUrl.searchParams.get("role")?.trim();
    if (!skuCode) return json(400, { success: false, error: "A sku_code query parameter is required." });
    if (!isGarmentViewRole(role)) return json(400, { success: false, error: "A valid role is required." });

    await deleteGarmentView(getSupabaseAdminClient(), skuCode, role);
    return json(200, { success: true });
  } catch (error) {
    return json(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unable to remove this garment view.",
    });
  }
}
