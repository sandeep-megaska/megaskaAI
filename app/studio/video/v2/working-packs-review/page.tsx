"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildSkuTruthCandidates, type SkuTruthCandidateImage } from "@/lib/video/v2/skuTruth/ui";

type ClipIntent = {
  id: string;
  intent_label: string;
  source_profile_id: string;
  status: string;
  created_at: string;
  sku_code?: string | null;
  compiled_anchor_pack_id?: string | null;
  compiled_run_request?: Record<string, unknown> | null;
  last_compiled_at?: string | null;
};
type WorkingPack = {
  id: string;
  clip_intent_id: string;
  status: string;
  readiness_score: number;
  warning_messages: string[];
  working_pack_items?: Array<{
    id: string;
    role: string;
    source_kind: string;
    generation_id: string | null;
    confidence_score: number;
    generation?: {
      id?: string | null;
      asset_url?: string | null;
      url?: string | null;
      thumbnail_url?: string | null;
    } | null;
  }>;
  pack_lineage?: Array<{ id: string; lineage_type: string; source_generation_id: string | null; derived_generation_id: string | null }>;
};

type CompileResponse = {
  clip_intent_id: string;
  compiled_anchor_pack_id: string;
  warnings: string[];
  run_request_preview: Record<string, unknown>;
};

type FidelityPlanResponse = {
  decision: "proceed" | "warn" | "block";
  missing_roles: string[];
  critical_missing_roles: string[];
  reasons: string[];
};

type ExpansionResult = {
  decision: "expanded" | "partial" | "blocked" | "not_needed";
  roles_created: string[];
  roles_failed: string[];
  reasons: string[];
};

type ReuseResult = {
  roles_reused: string[];
  roles_unresolved: string[];
  reasons: string[];
};

type SkuTruthEntry = {
  id: string;
  sku_code: string;
  role: string;
  generation_id: string;
  source_kind: string;
  is_verified: boolean;
  label: string | null;
  notes: string | null;
};
type SkuTruthCoverage = { role: string; present: boolean };

type OrchestrationStep = {
  id: string;
  type: "planner_review" | "search_existing_truth" | "expand_missing_anchors" | "recheck_fidelity" | "ready_to_compile" | "compile" | "generate";
  label: string;
  status: "pending" | "ready" | "running" | "completed" | "blocked" | "failed" | "skipped";
  reason?: string | null;
  recommended: boolean;
  autoRunnable: boolean;
  details?: Record<string, unknown> | null;
};

type AssistedExecutionStepResult = {
  step_type: "search_existing_truth" | "expand_missing_anchors" | "recheck_fidelity" | "compile" | "generate";
  attempted: boolean;
  success: boolean;
  status: "completed" | "failed" | "blocked" | "skipped";
  reason?: string | null;
  details?: Record<string, unknown> | null;
};

type AssistedExecutionResult = {
  action: "run_recommended_step" | "run_step" | "refresh_orchestration";
  initial_step_type?: AssistedExecutionStepResult["step_type"] | null;
  executed_steps: AssistedExecutionStepResult[];
  orchestration_plan: OrchestrationPlanResponse;
  summary: string;
  recommendations: string[];
};

type OrchestrationPlanResponse = {
  status: "ready" | "needs_reuse" | "needs_expansion" | "needs_partial_expansion" | "blocked" | "in_progress" | "failed";
  summary: string;
  reasons: string[];
  recommendations: string[];
  steps: OrchestrationStep[];
  compileReady: boolean;
  generateReady: boolean;
};

function provenanceLabel(sourceKind: string) {
  if (sourceKind === "sku_verified_truth") return "Verified SKU Truth";
  if (sourceKind === "manual_verified_override") return "Manual Override";
  if (sourceKind === "expanded_generated") return "Generated";
  if (sourceKind === "reused" || sourceKind === "reused_existing") return "Reused";
  if (sourceKind === "synthesized" || sourceKind === "synthesized_support") return "Synthesized";
  if (sourceKind === "user_uploaded") return "User Uploaded";
  return sourceKind;
}

export default function WorkingPackReviewPage() {
  const [intents, setIntents] = useState<ClipIntent[]>([]);
  const [selectedIntentId, setSelectedIntentId] = useState("");
  const [packs, setPacks] = useState<WorkingPack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [compiledState, setCompiledState] = useState<CompileResponse | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);
  const [isReusing, setIsReusing] = useState(false);
  const [fidelityState, setFidelityState] = useState<FidelityPlanResponse | null>(null);
  const [expansionState, setExpansionState] = useState<ExpansionResult | null>(null);
  const [reuseState, setReuseState] = useState<ReuseResult | null>(null);
  const [orchestrationState, setOrchestrationState] = useState<OrchestrationPlanResponse | null>(null);
  const [assistedState, setAssistedState] = useState<AssistedExecutionResult | null>(null);
  const [assistedError, setAssistedError] = useState<string | null>(null);
  const [assistedRunningStep, setAssistedRunningStep] = useState<string | null>(null);
  const [skuCode, setSkuCode] = useState("");
  const [skuTruthEntries, setSkuTruthEntries] = useState<SkuTruthEntry[]>([]);
  const [skuTruthCoverage, setSkuTruthCoverage] = useState<SkuTruthCoverage[]>([]);
  const [overrideRole, setOverrideRole] = useState("");
  const [selectedCandidateGenerationId, setSelectedCandidateGenerationId] = useState("");
  const [selectedRoleSuggested, setSelectedRoleSuggested] = useState<string | null>(null);
  const [didManuallySetRole, setDidManuallySetRole] = useState(false);

  async function loadIntents() {
    const res = await fetch("/api/studio/video/v2/clip-intents", { cache: "no-store" });
    const payload = (await res.json()) as { data?: ClipIntent[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load clip intents.");
    const next = payload.data ?? [];
    setIntents(next);
    if (!selectedIntentId && next[0]?.id) setSelectedIntentId(next[0].id);
  }

  async function loadPacks() {
    const res = await fetch("/api/studio/video/v2/working-packs", { cache: "no-store" });
    const payload = (await res.json()) as { data?: WorkingPack[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load working packs.");
    setPacks(payload.data ?? []);
  }

  useEffect(() => {
    Promise.all([loadIntents(), loadPacks()]).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to initialize working pack review.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedIntentId) return;
    setReuseState(null);
    setExpansionState(null);
    setAssistedState(null);
    setAssistedError(null);
    refreshFidelityPlan().catch((planError) => {
      setError(planError instanceof Error ? planError.message : "Failed to refresh fidelity plan.");
    });
    refreshOrchestrationPlan().catch((orchestrationError) => {
      setError(orchestrationError instanceof Error ? orchestrationError.message : "Failed to refresh orchestration plan.");
    });
    const selectedIntent = intents.find((intent) => intent.id === selectedIntentId);
    const nextSku = String((selectedIntent as { sku_code?: string | null } | undefined)?.sku_code ?? "");
    setSkuCode(nextSku);
    if (nextSku) {
      loadSkuTruth(nextSku).catch((skuError) => {
        setError(skuError instanceof Error ? skuError.message : "Failed to load SKU truth.");
      });
    } else {
      setSkuTruthEntries([]);
      setSkuTruthCoverage([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIntentId]);

  const activePack = useMemo(
    () => packs.find((pack) => pack.clip_intent_id === selectedIntentId) ?? null,
    [packs, selectedIntentId],
  );
  const skuTruthCandidates = useMemo(
    () => buildSkuTruthCandidates(activePack?.working_pack_items ?? []),
    [activePack],
  );
  const selectedCandidate = useMemo(
    () => skuTruthCandidates.find((candidate) => candidate.generationId === selectedCandidateGenerationId) ?? null,
    [selectedCandidateGenerationId, skuTruthCandidates],
  );
  const groupedSkuTruthEntries = useMemo(() => {
    const grouped = new Map<string, SkuTruthEntry[]>();
    for (const entry of skuTruthEntries) {
      const bucket = grouped.get(entry.role) ?? [];
      bucket.push(entry);
      grouped.set(entry.role, bucket);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [skuTruthEntries]);

  const compileBlockedReasons = useMemo(() => {
    const reasons: string[] = [];
    if (!activePack) {
      reasons.push("No working pack found for this clip intent.");
      return reasons;
    }
    if (activePack.status !== "ready") reasons.push("Working pack must be ready/approved before compile.");
    if (Number(activePack.readiness_score ?? 0) < 0.55) reasons.push("Readiness score must be >= 0.55.");

    const roles = new Set((activePack.working_pack_items ?? []).map((item) => item.role));
    if (!roles.has("fit_anchor")) reasons.push("Required role missing: fit_anchor.");
    if (!roles.has("front")) reasons.push("Required role missing: front.");
    return reasons;
  }, [activePack]);

  useEffect(() => {
    setSelectedCandidateGenerationId("");
    setSelectedRoleSuggested(null);
    setDidManuallySetRole(false);
    setOverrideRole("");
  }, [selectedIntentId]);


  async function loadSkuTruth(nextSkuCode?: string) {
    const target = (nextSkuCode ?? skuCode).trim();
    if (!target) {
      setSkuTruthEntries([]);
      setSkuTruthCoverage([]);
      return;
    }
    const res = await fetch(`/api/studio/video/v2/sku-truth?sku_code=${encodeURIComponent(target)}`, { cache: "no-store" });
    const payload = (await res.json()) as { data?: SkuTruthEntry[]; coverage?: SkuTruthCoverage[]; error?: string };
    if (!res.ok) throw new Error(payload.error ?? "Failed to load SKU truth.");
    setSkuTruthEntries(payload.data ?? []);
    setSkuTruthCoverage(payload.coverage ?? []);
  }

  async function applySkuTruth() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    if (!skuCode.trim()) return setError("Enter SKU / dress code first.");

    setError(null);
    const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/apply-sku-truth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sku_code: skuCode.trim() }),
    });
    const payload = (await res.json()) as { data?: { attached_roles?: Array<{ role: string; action: string }> }; error?: string };
    if (!res.ok) return setError(payload.error ?? "Failed to apply SKU truth.");

    setNote(`Applied SKU truth. Roles: ${payload.data?.attached_roles?.map((entry) => `${entry.role} (${entry.action})`).join(", ") || "none"}.`);
    await Promise.all([loadSkuTruth(), loadPacks(), refreshFidelityPlan(), refreshOrchestrationPlan()]);
  }

  function handleSelectCandidate(candidate: SkuTruthCandidateImage) {
    setSelectedCandidateGenerationId(candidate.generationId);
    setSelectedRoleSuggested(candidate.suggestedRole);
    setDidManuallySetRole(false);
    if (candidate.suggestedRole) {
      setOverrideRole(candidate.suggestedRole);
      return;
    }
    setOverrideRole("");
  }

  async function registerSkuTruth(sourceKind: "sku_verified_truth" | "manual_verified_override") {
    if (!skuCode.trim()) return setError("Enter SKU / dress code first.");
    if (!selectedCandidateGenerationId.trim()) return setError("Select an image from candidates.");
    if (!overrideRole.trim()) return setError("Select a role before registering.");

    setError(null);
    const res = await fetch("/api/studio/video/v2/sku-truth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku_code: skuCode.trim(),
        role: overrideRole,
        generation_id: selectedCandidateGenerationId.trim(),
        source_kind: sourceKind,
        clip_intent_id: selectedIntentId || undefined,
        apply_now: Boolean(selectedIntentId),
      }),
    });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) return setError(payload.error ?? "Failed to register SKU truth.");

    setNote(`${sourceKind === "manual_verified_override" ? "Manual override" : "Verified SKU truth"} registered for ${overrideRole}.`);
    await Promise.all([loadSkuTruth(), loadPacks(), refreshFidelityPlan(), refreshOrchestrationPlan()]);
  }

  async function autoBuild() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);

    const res = await fetch("/api/studio/video/v2/working-packs/auto-build", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clip_intent_id: selectedIntentId }),
    });

    const payload = (await res.json()) as { data?: { readiness?: { score: number; warnings: string[] } }; error?: string };
    if (!res.ok) return setError(payload.error ?? "Auto-build failed.");

    const score = payload.data?.readiness?.score ?? 0;
    const warnings = payload.data?.readiness?.warnings ?? [];
    setNote(`Working pack built. Readiness score: ${score.toFixed(2)}${warnings.length ? ` · warnings: ${warnings.join(" | ")}` : ""}`);
    await Promise.all([loadPacks(), refreshOrchestrationPlan()]);
  }

  async function compileIntent() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);
    setIsCompiling(true);

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/compile`, { method: "POST" });
      const payload = (await res.json()) as { data?: CompileResponse; error?: string };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Compile failed.");
      setCompiledState(payload.data);
      setNote(`Compiled anchor pack ${payload.data.compiled_anchor_pack_id.slice(0, 8)} is ready.`);
      await Promise.all([loadIntents(), loadPacks(), refreshOrchestrationPlan()]);
    } catch (compileError) {
      setError(compileError instanceof Error ? compileError.message : "Compile failed.");
    } finally {
      setIsCompiling(false);
    }
  }

  async function refreshFidelityPlan() {
    if (!selectedIntentId) return;
    const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/fidelity-plan`, { method: "POST" });
    const payload = (await res.json()) as { data?: FidelityPlanResponse; error?: string };
    if (!res.ok || !payload.data) throw new Error(payload.error ?? "Failed to refresh fidelity plan.");
    setFidelityState(payload.data);
  }

  async function refreshOrchestrationPlan() {
    if (!selectedIntentId) return;
    const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/orchestrate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reuse_snapshot: reuseState
          ? {
            attempted: true,
            rolesReused: reuseState.roles_reused,
            rolesUnresolved: reuseState.roles_unresolved,
            reasons: reuseState.reasons,
          }
          : { attempted: false, rolesReused: [], rolesUnresolved: [], reasons: [] },
        expansion_snapshot: expansionState
          ? {
            attempted: true,
            decision: expansionState.decision,
            rolesCreated: expansionState.roles_created,
            rolesFailed: expansionState.roles_failed,
            reasons: expansionState.reasons,
          }
          : { attempted: false, decision: "not_needed", rolesCreated: [], rolesFailed: [], reasons: [] },
      }),
    });
    const payload = (await res.json()) as { data?: OrchestrationPlanResponse; error?: string };
    if (!res.ok || !payload.data) throw new Error(payload.error ?? "Failed to build orchestration plan.");
    setOrchestrationState(payload.data);
  }

  async function expandAnchors() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);
    setIsExpanding(true);

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/expand-anchors`, { method: "POST" });
      const payload = (await res.json()) as { data?: ExpansionResult; error?: string };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Anchor expansion failed.");
      setExpansionState(payload.data);
      setNote(
        payload.data.decision === "not_needed"
          ? "No expansion needed."
          : `Anchor expansion ${payload.data.decision}. Created: ${payload.data.roles_created.join(", ") || "none"}.`,
      );
      await Promise.all([loadPacks(), refreshFidelityPlan(), refreshOrchestrationPlan()]);
    } catch (expandError) {
      setError(expandError instanceof Error ? expandError.message : "Anchor expansion failed.");
    } finally {
      setIsExpanding(false);
    }
  }

  async function reuseAnchors() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);
    setIsReusing(true);

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/reuse-anchors`, { method: "POST" });
      const payload = (await res.json()) as { data?: ReuseResult; error?: string };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Anchor reuse failed.");
      setReuseState(payload.data);
      setNote(`Reuse search complete. Reused: ${payload.data.roles_reused.join(", ") || "none"} · unresolved: ${payload.data.roles_unresolved.join(", ") || "none"}.`);
      await Promise.all([loadPacks(), refreshFidelityPlan(), refreshOrchestrationPlan()]);
    } catch (reuseError) {
      setError(reuseError instanceof Error ? reuseError.message : "Anchor reuse failed.");
    } finally {
      setIsReusing(false);
    }
  }

  async function runAssistedExecution(action: "run_recommended_step" | "run_step" | "refresh_orchestration", stepType?: AssistedExecutionStepResult["step_type"]) {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setAssistedError(null);
    setAssistedRunningStep(stepType ?? "recommended");

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/run-next-step`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          step_type: stepType,
          snapshots: {
            reuse_snapshot: reuseState
              ? {
                attempted: true,
                rolesReused: reuseState.roles_reused,
                rolesUnresolved: reuseState.roles_unresolved,
                reasons: reuseState.reasons,
              }
              : undefined,
            expansion_snapshot: expansionState
              ? {
                attempted: true,
                decision: expansionState.decision,
                rolesCreated: expansionState.roles_created,
                rolesFailed: expansionState.roles_failed,
                reasons: expansionState.reasons,
              }
              : undefined,
          },
        }),
      });

      const payload = (await res.json()) as { data?: AssistedExecutionResult; error?: string };
      if (!res.ok || !payload.data) throw new Error(payload.error ?? "Assisted execution failed.");

      setAssistedState(payload.data);
      setOrchestrationState(payload.data.orchestration_plan);

      const reuseStep = payload.data.executed_steps.find((step) => step.step_type === "search_existing_truth");
      if (reuseStep?.details) {
        setReuseState({
          roles_reused: Array.isArray(reuseStep.details.roles_reused) ? (reuseStep.details.roles_reused as string[]) : [],
          roles_unresolved: Array.isArray(reuseStep.details.roles_unresolved) ? (reuseStep.details.roles_unresolved as string[]) : [],
          reasons: reuseStep.reason ? [reuseStep.reason] : [],
        });
      }

      const expansionStep = payload.data.executed_steps.find((step) => step.step_type === "expand_missing_anchors");
      if (expansionStep?.details) {
        setExpansionState({
          decision: (expansionStep.details.decision as ExpansionResult["decision"]) ?? "blocked",
          roles_created: Array.isArray(expansionStep.details.roles_created) ? (expansionStep.details.roles_created as string[]) : [],
          roles_failed: Array.isArray(expansionStep.details.roles_failed) ? (expansionStep.details.roles_failed as string[]) : [],
          reasons: expansionStep.reason ? [expansionStep.reason] : [],
        });
      }

      const firstStep = payload.data.executed_steps[0];
      if (firstStep) {
        setNote(`${firstStep.step_type} ${firstStep.status}. ${firstStep.reason ?? payload.data.summary}`);
      } else {
        setNote(payload.data.summary);
      }

      await Promise.all([loadIntents(), loadPacks(), refreshFidelityPlan()]);
    } catch (assistedExecutionError) {
      setAssistedError(assistedExecutionError instanceof Error ? assistedExecutionError.message : "Assisted execution failed.");
    } finally {
      setAssistedRunningStep(null);
    }
  }

  async function generateClip() {
    if (!selectedIntentId) return setError("Select a clip intent first.");
    setError(null);
    setNote(null);
    setIsGenerating(true);

    try {
      const res = await fetch(`/api/studio/video/v2/clip-intents/${selectedIntentId}/generate`, { method: "POST" });
      const payload = (await res.json()) as { data?: { run_id: string; status: string; compiled_anchor_pack_id: string | null }; error?: string };
      if (!res.ok || !payload.data?.run_id) throw new Error(payload.error ?? "Generate failed.");
      setLastRunId(payload.data.run_id);
      setNote(`Generation started via V2 runs pipeline. Run ${payload.data.run_id.slice(0, 8)} · status ${payload.data.status}.`);
      await Promise.all([loadIntents(), refreshOrchestrationPlan()]);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Generate failed.");
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Working Pack Review (Slice C)</h1>
            <p className="text-sm text-zinc-400">Auto-build, compile to ephemeral anchor packs, then generate through existing V2 runs.</p>
          </div>
          <Link href="/studio/video/v2/create-clip" className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-900">Back to Create Clip</Link>
        </div>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <h2 className="font-medium">Auto-build from clip intent</h2>
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" value={selectedIntentId} onChange={(event) => setSelectedIntentId(event.target.value)}>
            <option value="">-- select clip intent --</option>
            {intents.map((intent) => (
              <option key={intent.id} value={intent.id}>{intent.intent_label} ({intent.id.slice(0, 8)})</option>
            ))}
          </select>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={autoBuild} className="rounded bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950">Auto-build Working Pack</button>
            <button type="button" onClick={refreshFidelityPlan} className="rounded bg-zinc-300 px-3 py-2 text-sm font-medium text-zinc-950">Refresh Fidelity Plan</button>
            <button type="button" onClick={refreshOrchestrationPlan} className="rounded bg-lime-300 px-3 py-2 text-sm font-medium text-zinc-950">Recheck Readiness</button>
            <button type="button" onClick={() => runAssistedExecution("run_recommended_step")} disabled={Boolean(assistedRunningStep)} className="rounded bg-fuchsia-300 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{assistedRunningStep ? "Running Assisted Step..." : "Run Recommended Step"}</button>
            <button type="button" onClick={reuseAnchors} disabled={isReusing} className="rounded bg-sky-300 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{isReusing ? "Searching Truth..." : "Search Existing Truth"}</button>
            <button type="button" onClick={expandAnchors} disabled={isExpanding} className="rounded bg-amber-300 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{isExpanding ? "Expanding..." : "Generate Missing Anchors"}</button>
            <button type="button" onClick={compileIntent} disabled={isCompiling || compileBlockedReasons.length > 0 || orchestrationState?.compileReady === false} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{isCompiling ? "Compiling..." : "Compile"}</button>
            <button type="button" onClick={generateClip} disabled={isGenerating || compileBlockedReasons.length > 0 || orchestrationState?.generateReady === false} className="rounded bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40">{isGenerating ? "Generating..." : "Generate Clip"}</button>
          </div>
          {compileBlockedReasons.length ? (
            <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
              <p className="font-medium">Readiness gate blocked</p>
              <ul className="mt-1 list-disc pl-4">
                {compileBlockedReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {fidelityState ? (
            <div className="rounded border border-zinc-700/70 bg-zinc-950/40 p-3 text-xs text-zinc-300">
              <p>Planner decision: <span className="font-medium text-zinc-100">{fidelityState.decision}</span></p>
              <p>Missing roles: {fidelityState.missing_roles.join(", ") || "none"}</p>
              {fidelityState.critical_missing_roles.length ? <p className="text-amber-300">Critical missing: {fidelityState.critical_missing_roles.join(", ")}</p> : null}
            </div>
          ) : null}
          {expansionState ? (
            <div className="rounded border border-cyan-700/50 bg-cyan-950/20 p-3 text-xs text-cyan-100">
              <p>Expansion decision: {expansionState.decision}</p>
              <p>Roles created: {expansionState.roles_created.join(", ") || "none"}</p>
              <p>Roles failed: {expansionState.roles_failed.join(", ") || "none"}</p>
              {expansionState.reasons.length ? <p className="text-cyan-200">Reason: {expansionState.reasons.join(" | ")}</p> : null}
            </div>
          ) : null}
          {reuseState ? (
            <div className="rounded border border-sky-700/50 bg-sky-950/20 p-3 text-xs text-sky-100">
              <p>Roles reused: {reuseState.roles_reused.join(", ") || "none"}</p>
              <p>Roles unresolved: {reuseState.roles_unresolved.join(", ") || "none"}</p>
              {reuseState.reasons.length ? <p className="text-sky-200">Reason: {reuseState.reasons.join(" | ")}</p> : null}
            </div>
          ) : null}
          {orchestrationState ? (
            <div className="rounded border border-lime-700/50 bg-lime-950/20 p-3 text-xs text-lime-100 space-y-2">
              <p className="text-sm font-medium">Slice G orchestration: <span className="uppercase">{orchestrationState.status}</span></p>
              <p>{orchestrationState.summary}</p>
              {orchestrationState.recommendations.length ? <p className="text-lime-200">Next: {orchestrationState.recommendations.join(" | ")}</p> : null}
              <div className="space-y-1">
                {orchestrationState.steps.map((step) => (
                  <div key={step.id} className="rounded border border-zinc-700/70 bg-zinc-950/50 p-2">
                    <p>
                      {step.label} · <span className={step.status === "ready" ? "text-emerald-300" : step.status === "blocked" || step.status === "failed" ? "text-rose-300" : "text-zinc-300"}>{step.status}</span>
                      {step.recommended ? " · recommended" : ""}
                    </p>
                    {step.reason ? <p className="text-zinc-400">{step.reason}</p> : null}
                    {step.status === "ready" && ["search_existing_truth", "expand_missing_anchors", "recheck_fidelity", "compile", "generate"].includes(step.type) ? (
                      <button
                        type="button"
                        onClick={() => runAssistedExecution("run_step", step.type as AssistedExecutionStepResult["step_type"])}
                        disabled={Boolean(assistedRunningStep)}
                        className="mt-2 rounded bg-fuchsia-300 px-2 py-1 text-xs font-medium text-zinc-950 disabled:opacity-40"
                      >
                        {assistedRunningStep === step.type ? `Running ${step.type}...` : `Run ${step.type}`}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {assistedState ? (
            <div className="rounded border border-fuchsia-700/50 bg-fuchsia-950/20 p-3 text-xs text-fuchsia-100 space-y-2">
              <p className="text-sm font-medium">Assisted execution result</p>
              <p>{assistedState.summary}</p>
              {assistedState.recommendations.length ? <p className="text-fuchsia-200">Next: {assistedState.recommendations.join(" | ")}</p> : null}
              {assistedState.executed_steps.map((step) => (
                <p key={`${step.step_type}-${step.status}`}>{step.step_type}: {step.status}{step.reason ? ` · ${step.reason}` : ""}</p>
              ))}
            </div>
          ) : null}
        </section>


        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <h2 className="font-medium">SKU Truth Registry + Visual Assignment</h2>
          <p className="text-xs text-zinc-400">Select the correct image visually, assign a role, then register as verified truth or manual override.</p>
          <div className="grid gap-2 md:grid-cols-3">
            <input className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm" placeholder="SKU code (example: MGSW05)" value={skuCode} onChange={(event) => setSkuCode(event.target.value.toUpperCase())} />
            <button type="button" onClick={() => loadSkuTruth().catch((e) => setError(e instanceof Error ? e.message : "Failed to load SKU truth."))} className="rounded border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800">Load SKU Truth Set</button>
            <button type="button" onClick={applySkuTruth} className="rounded bg-cyan-400 px-3 py-2 text-sm font-medium text-zinc-950">Apply Truth Set to Working Pack</button>
          </div>

          {skuTruthCoverage.length ? (
            <div className="rounded border border-zinc-700/70 bg-zinc-950/40 p-3 text-xs text-zinc-300">
              <p className="mb-2 text-zinc-100">Truth coverage for {skuCode || "SKU"}</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {skuTruthCoverage.map((entry) => (
                  <div key={entry.role} className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 p-2">
                    <span>{entry.role}</span>
                    <span className={entry.present ? "text-emerald-300" : "text-zinc-500"}>{entry.present ? "present" : "missing"}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-4 items-start">
            <select
              className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={overrideRole}
              onChange={(event) => {
                setOverrideRole(event.target.value);
                setDidManuallySetRole(true);
              }}
            >
              <option value="">-- select role --</option>
              {["front", "back", "left_profile", "right_profile", "three_quarter_left", "three_quarter_right", "detail", "fit_anchor", "context"].map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
            <div className="md:col-span-2 rounded border border-zinc-700 bg-zinc-950/60 p-2 text-xs text-zinc-300">
              {selectedCandidate ? (
                <div className="flex items-start gap-3">
                  {selectedCandidate.thumbnailUrl ? <img src={selectedCandidate.thumbnailUrl} alt={`Selected candidate ${selectedCandidate.generationId}`} className="h-16 w-16 rounded object-cover" /> : <div className="h-16 w-16 rounded bg-zinc-800" />}
                  <div>
                    <p className="text-zinc-100">Selected generation: {selectedCandidate.generationId.slice(0, 16)}</p>
                    <p className="text-zinc-400">Source: {provenanceLabel(selectedCandidate.sourceKind)}</p>
                    {selectedRoleSuggested ? <p className="text-emerald-300">Suggested role: {selectedRoleSuggested}{didManuallySetRole ? " (manually overridden)" : ""}</p> : <p className="text-zinc-500">No safe role suggestion. Please choose role manually.</p>}
                  </div>
                </div>
              ) : <p className="text-zinc-500">No image selected yet. Pick a candidate image below.</p>}
            </div>
            <div className="flex flex-col gap-2">
              <button type="button" onClick={() => registerSkuTruth("sku_verified_truth")} className="rounded bg-emerald-400 px-3 py-2 text-sm font-medium text-zinc-950">Register as Verified Truth</button>
              <button type="button" onClick={() => registerSkuTruth("manual_verified_override")} className="rounded bg-violet-400 px-3 py-2 text-sm font-medium text-zinc-950">Register Manual Override</button>
            </div>
          </div>

          {groupedSkuTruthEntries.length ? (
            <div className="rounded border border-zinc-700/70 bg-zinc-950/40 p-3 text-xs text-zinc-300">
              <p className="mb-2 text-zinc-100">Available verified truth roles for {skuCode || "SKU"}:</p>
              <div className="space-y-2">
                {groupedSkuTruthEntries.map(([role, entries]) => (
                  <div key={role} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                    <p className="mb-1 font-medium text-zinc-100">{role}</p>
                    <div className="space-y-1">
                      {entries.map((entry) => (
                        <div key={entry.id} className="rounded border border-zinc-800/80 bg-zinc-900/60 p-2">
                          <p>{provenanceLabel(entry.source_kind)}</p>
                          <p className="text-zinc-400">gen {entry.generation_id.slice(0, 8)}{entry.label ? ` · ${entry.label}` : ""}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-xs text-zinc-500">No verified truth registered for this SKU yet.</p>}

          <div className="rounded border border-zinc-700/70 bg-zinc-950/40 p-3 text-xs text-zinc-300">
            <p className="mb-2 text-zinc-100">Candidate images from the current working pack context</p>
            {skuTruthCandidates.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {skuTruthCandidates.map((candidate) => {
                  const selected = selectedCandidateGenerationId === candidate.generationId;
                  return (
                    <button
                      key={candidate.generationId}
                      type="button"
                      onClick={() => handleSelectCandidate(candidate)}
                      className={`rounded border p-2 text-left ${selected ? "border-cyan-400 bg-cyan-950/30" : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"}`}
                    >
                      {candidate.thumbnailUrl ? <img src={candidate.thumbnailUrl} alt={`Candidate ${candidate.generationId}`} className="mb-2 h-28 w-full rounded object-cover" /> : <div className="mb-2 h-28 w-full rounded bg-zinc-800" />}
                      <p className="truncate text-zinc-100">gen {candidate.generationId}</p>
                      <p className="text-zinc-400">{provenanceLabel(candidate.sourceKind)}</p>
                      {candidate.suggestedRole ? <p className="text-emerald-300">Hint: {candidate.suggestedRole}</p> : <p className="text-zinc-500">No role hint</p>}
                    </button>
                  );
                })}
              </div>
            ) : <p className="text-zinc-500">No candidate images available in this working pack context yet.</p>}
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-medium">Compiled state</h2>
          <p className="mt-2 text-sm text-zinc-300">Compiled anchor pack: {compiledState?.compiled_anchor_pack_id?.slice(0, 8) ?? intents.find((intent) => intent.id === selectedIntentId)?.compiled_anchor_pack_id?.slice(0, 8) ?? "none"}</p>
          <p className="text-sm text-zinc-300">Run id: {lastRunId ? lastRunId.slice(0, 8) : "none"}</p>
          {compiledState?.warnings?.length ? <p className="mt-1 text-sm text-amber-300">Compile warnings: {compiledState.warnings.join(" | ")}</p> : null}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <h2 className="font-medium">Working packs</h2>
          <div className="mt-3 space-y-3">
            {packs.map((pack) => (
              <article key={pack.id} className="rounded border border-zinc-700 p-3 text-sm">
                <p className="font-medium">Pack {pack.id.slice(0, 8)} · intent {pack.clip_intent_id.slice(0, 8)} · status {pack.status}</p>
                <p className="text-zinc-400">Readiness {Number(pack.readiness_score ?? 0).toFixed(2)}</p>
                {pack.warning_messages?.length ? <p className="text-amber-300">Warnings: {pack.warning_messages.join(" | ")}</p> : null}
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {(pack.working_pack_items ?? []).map((item) => (
                    <div key={item.id} className="rounded border border-zinc-800 bg-zinc-950 p-2 text-xs">
                      <p>{item.role} · {provenanceLabel(item.source_kind)} · conf {Number(item.confidence_score ?? 0).toFixed(2)}</p>
                      <p className="text-zinc-400">gen {item.generation_id ? item.generation_id.slice(0, 8) : "synthesized"}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-zinc-500">Lineage events: {(pack.pack_lineage ?? []).length}</p>
              </article>
            ))}
            {!packs.length ? <p className="text-sm text-zinc-500">No working packs yet.</p> : null}
          </div>
        </section>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}
        {assistedError ? <p className="text-sm text-rose-300">{assistedError}</p> : null}
        {note ? <p className="text-sm text-emerald-300">{note}</p> : null}
      </div>
    </main>
  );
}
