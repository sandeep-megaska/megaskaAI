import { NextResponse } from "next/server";
import { generatePromptBuilderResult, type PromptBuilderInput, type PromptBuilderWorkflowMode } from "@/lib/prompt-builder";

export const runtime = "nodejs";

function asJson(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

function asTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asWorkflowMode(value: unknown): PromptBuilderWorkflowMode {
  if (value === "single_shot" || value === "two_shot") return value;
  return null;
}

function asGarmentAnchors(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const next: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw !== "string") continue;
    const cleaned = raw.trim();
    if (cleaned.length) next[key] = cleaned;
  }
  return next;
}

function asBoolean(value: unknown) {
  return value === true;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;

  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return asJson(400, { success: false, error: "Invalid JSON body." });
  }

  const projectType = payload.projectType;
  if (projectType !== "image" && projectType !== "video") {
    return asJson(400, { success: false, error: "projectType must be 'image' or 'video'." });
  }

  const userIdea = asTrimmedString(payload.userIdea);
  if (!userIdea) {
    return asJson(400, { success: false, error: "userIdea is required." });
  }

  const input: PromptBuilderInput = {
    projectType,
    workflowMode: asWorkflowMode(payload.workflowMode),
    userIdea,
    environment: asTrimmedString(payload.environment),
    motionPreset: asTrimmedString(payload.motionPreset) || null,
    garmentAnchors: asGarmentAnchors(payload.garmentAnchors),
    hasStartFrame: asBoolean(payload.hasStartFrame),
    hasEndFrame: asBoolean(payload.hasEndFrame),
    hasReferenceImages: asBoolean(payload.hasReferenceImages),
  };

  try {
    const data = await generatePromptBuilderResult(input);
    return asJson(200, { success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prompt builder failed.";
    console.error("[prompt-builder] failed", { message, projectType: input.projectType, workflowMode: input.workflowMode });
    return asJson(500, { success: false, error: message });
  }
}
