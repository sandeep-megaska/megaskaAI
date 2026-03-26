import { NextRequest, NextResponse } from "next/server";
import { applySkuTruthForClipIntent } from "@/lib/video/v2/skuTruth/apply";

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const clipIntentId = id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const body = (await request.json().catch(() => ({}))) as { sku_code?: string };
    const skuCode = body.sku_code?.trim();
    if (!skuCode) return json(400, { success: false, error: "sku_code is required." });

    const data = await applySkuTruthForClipIntent({ clipIntentId, skuCode });
    return json(200, { success: true, data });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
