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
              <p>Type: <span className="text-zinc-100">{report.packType}</span></p>
              <p>Stability: <span className="text-zinc-100">{report.aggregateStabilityScore.toFixed(2)}</span></p>
              <p>Readiness: <span className={report.isReady ? "text-emerald-300" : "text-amber-300"}>{report.isReady ? "Ready" : "Needs anchors"}</span></p>
              <p>Risk: <span className="text-zinc-100">{report.riskLevel}</span></p>
              <p>Mode: <span className="text-zinc-100">{report.recommendedMode}</span></p>
              <p>Missing: <span className="text-amber-300">{report.missingRoles.length ? report.missingRoles.join(", ") : "none"}</span></p>
            </>
          ) : (
            <p className="text-zinc-500">Select a pack to load context.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <h3 className="text-sm font-semibold">Quick context actions</h3>
        <div className="mt-2 space-y-2 text-xs">
          <input className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" placeholder="Pack name" value={props.packName} onChange={(e) => props.setPackName(e.target.value)} />
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" value={props.packType} onChange={(e) => props.setPackType(e.target.value as (typeof ANCHOR_PACK_TYPES)[number])}>
            {ANCHOR_PACK_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" onClick={() => props.onCreatePack()} className="w-full rounded bg-emerald-500 px-2 py-1.5 text-emerald-950">Create pack</button>
          <FallbackAssetPicker images={props.images} selectedGenerationId={props.newItemGenerationId} onSelect={props.setNewItemGenerationId} />
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1" value={props.newItemRole} onChange={(e) => props.setNewItemRole(e.target.value as (typeof ANCHOR_ITEM_ROLES)[number])}>
            {ANCHOR_ITEM_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button disabled={!props.selectedPackId || !props.newItemGenerationId} type="button" onClick={() => props.onAssignAsset()} className="w-full rounded bg-sky-500 px-2 py-1.5 text-sky-950 disabled:opacity-40">Assign fallback asset</button>
          <Link href="#pack-builder" className="inline-block text-cyan-300 hover:underline">Open full pack builder</Link>
        </div>
      </section>
    </aside>
  );
}
