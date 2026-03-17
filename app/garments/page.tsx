"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type GarmentAsset = {
  id: string;
  asset_type: string;
  file_path: string;
  public_url: string;
  sort_order: number;
  is_primary: boolean;
  view_label?: string | null;
  detail_zone?: string | null;
};

type ReferenceSummary = {
  hasFront?: boolean;
  hasBack?: boolean;
  hasNeckline?: boolean;
  hasSleeveOrStrap?: boolean;
  hasHem?: boolean;
  hasPrintOrFabric?: boolean;
  missing?: string[];
};

type Garment = {
  id: string;
  garment_code: string;
  sku?: string | null;
  display_name: string;
  category?: string | null;
  sub_category?: string | null;
  status: string;
  colorway?: string | null;
  print_type?: string | null;
  description?: string | null;
  notes?: string | null;
  fabric_notes?: string | null;
  silhouette_notes?: string | null;
  coverage_notes?: string | null;
  primary_front_asset_id?: string | null;
  primary_back_asset_id?: string | null;
  primary_detail_asset_id?: string | null;
  readiness_score?: number;
  readiness_status?: string;
  reference_summary?: ReferenceSummary;
  garment_assets?: GarmentAsset[];
};

const emptyForm = {
  garment_code: "",
  sku: "",
  display_name: "",
  category: "",
  sub_category: "",
  status: "draft",
  colorway: "",
  print_type: "",
  description: "",
  notes: "",
  fabric_notes: "",
  silhouette_notes: "",
  coverage_notes: "",
};

export default function GarmentsPage() {
  const [items, setItems] = useState<Garment[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedId, setSelectedId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [assetType, setAssetType] = useState("front");
  const [assetViewLabel, setAssetViewLabel] = useState("");
  const [assetDetailZone, setAssetDetailZone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  async function load() {
    const params = new URLSearchParams();
    params.set("status", statusFilter);
    params.set("category", categoryFilter);
    const res = await fetch(`/api/garments?${params.toString()}`);
    const json = await res.json();
    if (res.ok) {
      setItems(json.data ?? []);
      if (!selectedId && json.data?.[0]?.id) setSelectedId(json.data[0].id);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [statusFilter, categoryFilter]);

  async function createGarment() {
    setCreating(true);
    setError(null);
    const res = await fetch("/api/garments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Unable to create garment.");
    if (res.ok && json.data) {
      setForm(emptyForm);
      setItems((current) => [json.data, ...current]);
      setSelectedId(json.data.id);
    }
    setCreating(false);
  }

  async function saveGarment(item: Garment) {
    const res = await fetch(`/api/garments/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Unable to update garment.");
      return;
    }
    setItems((current) => current.map((entry) => (entry.id === item.id ? json.data : entry)));
  }

  async function uploadAssets(files: FileList | null) {
    if (!selected || !files?.length) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    for (const file of Array.from(files)) formData.append("files", file);
    formData.set("asset_type", assetType);
    if (assetViewLabel) formData.set("view_label", assetViewLabel);
    if (assetDetailZone) formData.set("detail_zone", assetDetailZone);

    const res = await fetch(`/api/garments/${selected.id}/assets`, { method: "POST", body: formData });
    const json = await res.json();
    if (!res.ok) setError(json.error ?? "Unable to upload garment assets.");
    if (res.ok) await load();
    setUploading(false);
  }

  async function setPrimaryAsset(garment: Garment, role: "front" | "back" | "detail", assetId: string) {
    const payload: Record<string, string | null> = {};
    if (role === "front") payload.primary_front_asset_id = assetId;
    if (role === "back") payload.primary_back_asset_id = assetId;
    if (role === "detail") payload.primary_detail_asset_id = assetId;

    const res = await fetch(`/api/garments/${garment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (res.ok) setItems((current) => current.map((entry) => (entry.id === garment.id ? json.data : entry)));
  }

  async function updateAsset(assetId: string, patch: Record<string, unknown>) {
    if (!selected) return;
    await fetch(`/api/garments/${selected.id}/assets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: assetId, ...patch }),
    });
    await load();
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Garment Library</h1>
          <p className="text-sm text-zinc-400">Brand-specific product catalog and reference pack management.</p>
        </header>
        {error && <div className="rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="space-y-2 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-sm font-semibold">Create garment</h2>
            <input value={form.garment_code} onChange={(event) => setForm((current) => ({ ...current, garment_code: event.target.value }))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="garment_code" />
            <input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="display_name" />
            <button type="button" disabled={creating} onClick={createGarment} className="rounded bg-indigo-500 px-3 py-2 text-xs font-semibold text-white">{creating ? "Creating..." : "Create"}</button>
          </article>

          <article className="space-y-2 rounded-lg border border-white/10 bg-zinc-900/40 p-4 lg:col-span-2">
            <div className="flex flex-wrap gap-2">
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded border border-white/10 bg-zinc-950 px-2 py-1 text-xs"><option value="all">Status: all</option><option value="draft">draft</option><option value="approved">approved</option><option value="archived">archived</option></select>
              <input value={categoryFilter === "all" ? "" : categoryFilter} onChange={(event) => setCategoryFilter(event.target.value.trim() ? event.target.value : "all")} placeholder="Category filter" className="rounded border border-white/10 bg-zinc-950 px-2 py-1 text-xs" />
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {items.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`rounded border p-3 text-left text-xs ${selectedId === item.id ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 bg-zinc-950/60"}`}>
                  <p className="font-semibold">{item.display_name}</p>
                  <p className="text-zinc-400">{item.garment_code} · {item.status}</p>
                  <p className="text-zinc-500">{item.category || "uncategorized"}</p>
                  <p className="mt-1 text-zinc-300">Readiness: {item.readiness_status ?? "reference_incomplete"} ({item.readiness_score ?? 0})</p>
                  {!!item.reference_summary?.missing?.length && <p className="text-amber-300">Missing: {item.reference_summary.missing.join(", ")}</p>}
                </button>
              ))}
            </div>
          </article>
        </section>

        {selected && (
          <section className="space-y-3 rounded-lg border border-white/10 bg-zinc-900/40 p-4">
            <h2 className="text-lg font-semibold">{selected.display_name}</h2>
            <div className="rounded border border-white/10 bg-zinc-950/40 p-3 text-xs">
              <p className="font-medium">Readiness status: {selected.readiness_status ?? "reference_incomplete"}</p>
              <p className="text-zinc-300">Readiness score: {selected.readiness_score ?? 0}</p>
              <p className="text-zinc-400">Front: {String(selected.reference_summary?.hasFront ?? false)} · Back: {String(selected.reference_summary?.hasBack ?? false)} · Neckline: {String(selected.reference_summary?.hasNeckline ?? false)}</p>
              <p className="text-zinc-400">Sleeve/strap: {String(selected.reference_summary?.hasSleeveOrStrap ?? false)} · Hem: {String(selected.reference_summary?.hasHem ?? false)} · Print/fabric: {String(selected.reference_summary?.hasPrintOrFabric ?? false)}</p>
              <p className="text-amber-300">Missing critical references: {selected.reference_summary?.missing?.join(", ") || "none"}</p>
              <button type="button" onClick={() => saveGarment(selected)} className="mt-2 rounded border border-white/20 px-2 py-1">Recompute readiness</button>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <input value={selected.status} onChange={(event) => setItems((current) => current.map((entry) => entry.id === selected.id ? { ...entry, status: event.target.value } : entry))} className="rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="status" />
              <input value={selected.category ?? ""} onChange={(event) => setItems((current) => current.map((entry) => entry.id === selected.id ? { ...entry, category: event.target.value } : entry))} className="rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="category" />
              <input value={selected.sub_category ?? ""} onChange={(event) => setItems((current) => current.map((entry) => entry.id === selected.id ? { ...entry, sub_category: event.target.value } : entry))} className="rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="sub_category" />
            </div>
            <button type="button" onClick={() => saveGarment(selected)} className="rounded border border-white/20 px-3 py-2 text-xs">Save metadata</button>

            <div className="space-y-2 rounded border border-white/10 bg-zinc-950/40 p-3">
              <p className="text-xs font-medium">Upload assets</p>
              <div className="grid gap-2 md:grid-cols-3">
                <select value={assetType} onChange={(event) => setAssetType(event.target.value)} className="rounded border border-white/10 bg-zinc-950 p-2 text-xs"><option value="front">front</option><option value="back">back</option><option value="detail">detail</option><option value="reference">reference</option></select>
                <input value={assetViewLabel} onChange={(event) => setAssetViewLabel(event.target.value)} className="rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="view_label (optional)" />
                <input value={assetDetailZone} onChange={(event) => setAssetDetailZone(event.target.value)} className="rounded border border-white/10 bg-zinc-950 p-2 text-xs" placeholder="detail_zone (optional)" />
              </div>
              <input type="file" accept="image/*" multiple disabled={uploading} onChange={(event: ChangeEvent<HTMLInputElement>) => uploadAssets(event.target.files)} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {(selected.garment_assets ?? []).map((asset) => (
                <div key={asset.id} className="space-y-1 rounded border border-white/10 bg-zinc-950/60 p-2 text-xs">
                  <img src={asset.public_url} alt={asset.asset_type} className="h-24 w-full rounded object-cover" />
                  <input value={asset.asset_type} onChange={(event) => updateAsset(asset.id, { asset_type: event.target.value })} className="w-full rounded border border-white/10 bg-zinc-900 px-1 py-1" />
                  <input value={asset.view_label ?? ""} onChange={(event) => updateAsset(asset.id, { view_label: event.target.value })} placeholder="view_label" className="w-full rounded border border-white/10 bg-zinc-900 px-1 py-1" />
                  <input value={asset.detail_zone ?? ""} onChange={(event) => updateAsset(asset.id, { detail_zone: event.target.value })} placeholder="detail_zone" className="w-full rounded border border-white/10 bg-zinc-900 px-1 py-1" />
                  <div className="grid grid-cols-3 gap-1">
                    <button type="button" onClick={() => setPrimaryAsset(selected, "front", asset.id)} className={`rounded border px-1 py-1 ${selected.primary_front_asset_id === asset.id ? "border-emerald-400 text-emerald-200" : "border-white/20"}`}>Front</button>
                    <button type="button" onClick={() => setPrimaryAsset(selected, "back", asset.id)} className={`rounded border px-1 py-1 ${selected.primary_back_asset_id === asset.id ? "border-emerald-400 text-emerald-200" : "border-white/20"}`}>Back</button>
                    <button type="button" onClick={() => setPrimaryAsset(selected, "detail", asset.id)} className={`rounded border px-1 py-1 ${selected.primary_detail_asset_id === asset.id ? "border-emerald-400 text-emerald-200" : "border-white/20"}`}>Detail</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
