"use client";

import Link from "next/link";
import FallbackAssetPicker from "@/app/studio/video/v2/components/FallbackAssetPicker";
import { buildPackReadinessReport } from "@/lib/video/v2/anchorPacks";
import { ANCHOR_ITEM_ROLES, ANCHOR_PACK_TYPES, type AnchorPack } from "@/lib/video/v2/types";

type GalleryImage = { id: string; prompt: string; asset_url?: string | null; url?: string | null };

export default function ProductionContextPanel(props: {
  packs: AnchorPack[];
  selectedPack: AnchorPack | null;
  selectedPackId: string;
  setSelectedPackId: (id: string) => void;
  packName: string;
  setPackName: (name: string) => void;
  packType: (typeof ANCHOR_PACK_TYPES)[number];
  setPackType: (type: (typeof ANCHOR_PACK_TYPES)[number]) => void;
  onCreatePack: () => Promise<void>;
  images: GalleryImage[];
  newItemGenerationId: string;
  setNewItemGenerationId: (id: string) => void;
  newItemRole: (typeof ANCHOR_ITEM_ROLES)[number];
  setNewItemRole: (role: (typeof ANCHOR_ITEM_ROLES)[number]) => void;
  onAssignAsset: () => Promise<void>;
}) {
  const report = props.selectedPack
    ? buildPackReadinessReport({
        packType: props.selectedPack.pack_type,
        items: props.selectedPack.anchor_pack_items ?? [],
        aggregateStabilityScore: Number(props.selectedPack.aggregate_stability_score ?? 0),
        priorValidatedClipExists: false,
      })
    : null;

  return (
    <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 shadow-lg shadow-black/20">
        <h2 className="text-sm font-semibold text-zinc-100">Production Context</h2>
        <div className="mt-3 space-y-2 text-xs text-zinc-300">
          <label className="space-y-1 block">
            <span className="text-zinc-400">Selected pack</span>
            <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" value={props.selectedPackId} onChange={(e) => props.setSelectedPackId(e.target.value)}>
              <option value="">-- Select --</option>
              {props.packs.map((pack) => (
                <option key={pack.id} value={pack.id}>{pack.pack_name}</option>
              ))}
            </select>
          </label>
          {report ? (
            <>
              <p>Pack name: <span className="text-zinc-100">{props.selectedPack?.pack_name}</span></p>
              <p>Type: <span className="text-zinc-100">{report.packType}</span></p>
              <p>Status: <span className={report.isReady ? "text-emerald-300" : "text-amber-300"}>{report.isReady ? "Ready for planning and run" : "Not ready yet"}</span></p>
              <p>Stability score: <span className="text-zinc-100">{report.aggregateStabilityScore.toFixed(2)}</span></p>
              <p>Risk: <span className="text-zinc-100">{report.riskLevel}</span></p>
              <p>Recommended mode: <span className="text-zinc-100">{report.recommendedMode}</span></p>
              <p>Required anchors: <span className={report.missingRoles.length ? "text-amber-300" : "text-emerald-300"}>{report.missingRoles.length ? `Incomplete (${report.missingRoles.join(", ")} missing)` : "Complete"}</span></p>
              <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2">
                <p className="mb-1 font-medium text-zinc-200">Role coverage checklist</p>
                {report.presentRoles.length ? (
                  <div className="flex flex-wrap gap-1">
                    {report.presentRoles.map((role) => <span key={role} className="rounded border border-emerald-600/40 bg-emerald-950/30 px-1.5 py-0.5 text-[11px] text-emerald-200">{role} ✓</span>)}
                    {report.missingRoles.map((role) => <span key={role} className="rounded border border-amber-600/40 bg-amber-950/30 px-1.5 py-0.5 text-[11px] text-amber-200">{role} ✗</span>)}
                  </div>
                ) : (
                  <p className="text-zinc-500">No roles assigned yet.</p>
                )}
              </div>
              {!report.isReady ? (
                <div className="rounded border border-amber-600/30 bg-amber-950/20 p-2 text-amber-200">
                  <p className="font-medium">This pack is not ready for video generation yet.</p>
                  {report.missingRoles.map((role) => <p key={role}>• Missing required anchor: {role}</p>)}
                  {report.missingRoles.length ? <p className="mt-1">Add the missing required anchors to make this pack runnable.</p> : null}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-zinc-500">Select a pack to load context.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold">Quick context actions</h3>
        <div className="mt-2 space-y-2 text-xs">
          <div className="rounded border border-cyan-700/30 bg-cyan-950/20 p-2 text-[11px] text-cyan-100">
            <p className="font-medium">How to prepare a pack</p>
            <p>1) Create/select a pack.</p>
            <p>2) Assign required roles.</p>
            <p>3) Wait for status: Ready.</p>
            <p>4) Generate plan.</p>
            <p>5) Run video.</p>
          </div>
          <label className="block space-y-1">
            <span className="text-zinc-400">Pack name / shot name</span>
            <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" placeholder="e.g. MGSW05-pool-intro" value={props.packName} onChange={(e) => props.setPackName(e.target.value)} />
            <span className="text-[11px] text-zinc-500">Use a meaningful name such as MGSW05-pool-intro or MGSW05-water-final.</span>
          </label>
          <label className="block space-y-1">
            <span className="text-zinc-400">Pack type</span>
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" value={props.packType} onChange={(e) => props.setPackType(e.target.value as (typeof ANCHOR_PACK_TYPES)[number])}>
            {ANCHOR_PACK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
            <span className="text-[11px] text-zinc-500">identity = person references, garment = garment details, scene = environment context, hybrid = combined advanced setup.</span>
          </label>
          <button type="button" onClick={() => props.onCreatePack()} className="w-full rounded bg-emerald-500 px-2 py-1.5 text-emerald-950">Create pack</button>
          <FallbackAssetPicker images={props.images} selectedGenerationId={props.newItemGenerationId} onSelect={props.setNewItemGenerationId} />
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" value={props.newItemRole} onChange={(e) => props.setNewItemRole(e.target.value as (typeof ANCHOR_ITEM_ROLES)[number])}>
            {ANCHOR_ITEM_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button disabled={!props.selectedPackId || !props.newItemGenerationId} type="button" onClick={() => props.onAssignAsset()} className="w-full rounded bg-sky-500 px-2 py-1.5 text-sky-950 disabled:opacity-40">Assign fallback asset</button>
          <div className="rounded border border-zinc-800 bg-zinc-950/40 p-2 text-[11px] text-zinc-400">
            <p className="font-medium text-zinc-300">Required role guide</p>
            <p>Identity pack: required front, three_quarter_left, three_quarter_right.</p>
            <p>Garment pack: required front, back, detail.</p>
            <p>Scene pack: required front + three_quarter_left + three_quarter_right + context, with at least 2 scene-compatible anchors.</p>
            <p>Hybrid pack: required front, fit_anchor, start_frame.</p>
          </div>
          <Link
            href="#pack-builder"
            onClick={() => {
              setTimeout(() => {
                document.getElementById("pack-items-heading")?.focus();
                document.getElementById("pack-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }, 0);
            }}
            className="inline-block text-cyan-300 hover:underline"
          >
            Jump to pack items
          </Link>
        </div>
      </section>
    </aside>
  );
}
