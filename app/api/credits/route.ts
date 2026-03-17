import { NextResponse } from "next/server";
import { getCreditSummary } from "@/lib/credits";

export async function GET() {
  return NextResponse.json({ success: true, data: getCreditSummary() });
}
