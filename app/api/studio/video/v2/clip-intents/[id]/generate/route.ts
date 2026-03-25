import { NextResponse } from "next/server";
import { compileClipIntent } from "@/lib/video/v2/compileClipIntent";
import { POST as executeRunPost } from "@/app/api/studio/video/v2/runs/route";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RunResponse = {
  success?: boolean;
  data?: {
    id?: string;
    status?: string;
  };
  error?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

export async function POST(_: Request, context: { params: { id: string } }) {
  try {
    const clipIntentId = context.params.id?.trim();
    if (!clipIntentId) return json(400, { success: false, error: "clip intent id is required." });

    const supabase = getSupabaseAdminClient();
    const { data: existingIntent, error: intentError } = await supabase
      .from("clip_intents")
      .select("id,compiled_run_request")
      .eq("id", clipIntentId)
      .maybeSingle<{ id: string; compiled_run_request: Record<string, unknown> | null }>();

    if (intentError) return json(400, { success: false, error: intentError.message });
    if (!existingIntent) return json(404, { success: false, error: "Clip intent not found." });

    let compiled = existingIntent.compiled_run_request;
    let compiledAnchorPackId: string | null = null;

    if (!compiled || typeof compiled !== "object") {
      const freshCompile = await compileClipIntent({ clipIntentId });
      compiled = freshCompile.runRequest;
      compiledAnchorPackId = freshCompile.compiledAnchorPackId;
    } else {
      compiledAnchorPackId = typeof compiled.selected_pack_id === "string" ? compiled.selected_pack_id : null;
    }

    const runRequest = new Request("http://localhost/api/studio/video/v2/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(compiled),
    });

    const runResponse = await executeRunPost(runRequest);
    const payload = (await runResponse.json()) as RunResponse;

    if (!runResponse.ok || !payload.success || !payload.data?.id) {
      return json(400, { success: false, error: payload.error ?? "Failed to create run." });
    }

    return json(201, {
      success: true,
      data: {
        run_id: payload.data.id,
        clip_intent_id: clipIntentId,
        compiled_anchor_pack_id: compiledAnchorPackId,
        status: payload.data.status ?? "queued",
      },
    });
  } catch (error) {
    return json(400, { success: false, error: error instanceof Error ? error.message : "Unexpected server error." });
  }
}
