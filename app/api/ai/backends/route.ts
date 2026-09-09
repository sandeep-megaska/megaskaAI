import { NextResponse } from "next/server";
import { getSelectableBackends } from "@/lib/ai-backends";

export async function GET() {
  // Retired provider models are excluded so the picker cannot select a model ID
  // the Gemini API no longer serves.
  return NextResponse.json({ success: true, data: getSelectableBackends() });
}
