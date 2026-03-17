import { NextResponse } from "next/server";
import { AI_BACKENDS } from "@/lib/ai-backends";

export async function GET() {
  return NextResponse.json({ success: true, data: AI_BACKENDS });
}
