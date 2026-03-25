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

export type GenerateClipIntentResult = {
  run_id: string;
  clip_intent_id: string;
  compiled_anchor_pack_id: string | null;
  status: string;
};

export async function generateClipIntent(input: { clipIntentId: string }): Promise<GenerateClipIntentResult> {
  const supabase = getSupabaseAdminClient();
  const { data: existingIntent, error: intentError } = await supabase
    .from("clip_intents")
    .select("id,compiled_run_request")
    .eq("id", input.clipIntentId)
    .maybeSingle<{ id: string; compiled_run_request: Record<string, unknown> | null }>();

  if (intentError) throw new Error(intentError.message);
  if (!existingIntent) throw new Error("Clip intent not found.");

  let compiled = existingIntent.compiled_run_request;
  let compiledAnchorPackId: string | null = null;

  if (!compiled || typeof compiled !== "object") {
    const freshCompile = await compileClipIntent({ clipIntentId: input.clipIntentId });
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
    throw new Error(payload.error ?? "Failed to create run.");
  }

  return {
    run_id: payload.data.id,
    clip_intent_id: input.clipIntentId,
    compiled_anchor_pack_id: compiledAnchorPackId,
    status: payload.data.status ?? "queued",
  };
}
