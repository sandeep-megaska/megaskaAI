export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, message: "generate route is live" });
}

export async function POST() {
  return Response.json({ success: true, message: "POST route works" });
}