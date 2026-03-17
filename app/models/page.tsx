"use client";

import { useEffect, useState } from "react";

type ModelAsset = { id: string; asset_url: string; is_primary?: boolean };
type ModelItem = {
  id: string;
  model_code: string;
  display_name: string;
  category: string;
  status: string;
  prompt_anchor?: string | null;
  negative_prompt?: string | null;
  notes?: string | null;
  asset_count?: number;
  model_assets?: ModelAsset[];
};

const emptyForm = {
  model_code: "",
  display_name: "",
  category: "women",
  status: "active",
  prompt_anchor: "",
  negative_prompt: "",
  notes: "",
};

export default function ModelsPage() {
  const [items, setItems] = useState<ModelItem[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/models?include_all=1");
    const json = await res.json();
    setItems(json.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    async function boot() {
      setLoading(true);
      const res = await fetch("/api/models?include_all=1");
      const json = await res.json();
      if (!active) return;
      setItems(json.data ?? []);
      setLoading(false);
    }

    boot();
    return () => {
      active = false;
    };
  }, []);

  async function create() {
    await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm(emptyForm);
    load();
  }

  async function update(item: ModelItem) {
    await fetch(`/api/models/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    load();
  }

  async function uploadAsset(modelId: string, files: FileList | null) {
    if (!files?.length) return;
    const formData = new FormData();
    for (const file of Array.from(files)) {
      formData.append("files", file);
    }
    await fetch(`/api/models/${modelId}/assets`, { method: "POST", body: formData });
    load();
  }

  return (
    <main className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-semibold">Model Library</h1>

        <section className="grid gap-2 rounded-xl border border-white/10 p-4">
          <h2 className="text-sm font-semibold text-zinc-300">Create Model</h2>
          <input placeholder="Model Code (e.g. MW-01)" value={form.model_code} onChange={(event) => setForm({ ...form, model_code: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <input placeholder="Display Name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <input placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm"><option value="active">active</option><option value="inactive">inactive</option></select>
          <textarea placeholder="Prompt Anchor" value={form.prompt_anchor} onChange={(event) => setForm({ ...form, prompt_anchor: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Negative Prompt" value={form.negative_prompt} onChange={(event) => setForm({ ...form, negative_prompt: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <button type="button" onClick={create} className="rounded bg-indigo-500 px-3 py-2 text-sm font-semibold">Create Model</button>
        </section>

        {loading && <p className="text-sm text-zinc-400">Loading models...</p>}

        <section className="grid gap-3">
          {items.map((item) => (
            <article key={item.id} className="space-y-3 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <p>{item.model_code} — {item.display_name}</p>
                <p>{item.asset_count ?? item.model_assets?.length ?? 0} reference image(s)</p>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <input value={item.display_name} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, display_name: event.target.value } : entry)))} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
                <input value={item.category} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, category: event.target.value } : entry)))} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
                <input value={item.model_code} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, model_code: event.target.value } : entry)))} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
                <select value={item.status} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status: event.target.value } : entry)))} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm"><option value="active">active</option><option value="inactive">inactive</option></select>
              </div>

              <textarea value={item.prompt_anchor ?? ""} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, prompt_anchor: event.target.value } : entry)))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" placeholder="Prompt anchor" />
              <textarea value={item.negative_prompt ?? ""} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, negative_prompt: event.target.value } : entry)))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" placeholder="Negative prompt" />
              <textarea value={item.notes ?? ""} onChange={(event) => setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, notes: event.target.value } : entry)))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" placeholder="Notes" />

              <div>
                <p className="mb-2 text-xs text-zinc-400">Reference Images (Primary reference + additional references)</p>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {(item.model_assets ?? []).map((asset, index) => (
                    <div key={asset.id} className="space-y-1">
                      <img src={asset.asset_url} alt={item.display_name} className="h-24 w-full rounded border border-white/10 object-cover" />
                      <p className="text-[10px] text-zinc-400">{asset.is_primary ? "Primary reference" : `Additional reference ${index}`}</p>
                    </div>
                  ))}
                </div>
                <input type="file" accept="image/*" multiple onChange={(event) => uploadAsset(item.id, event.target.files)} className="mt-2 w-full rounded border border-white/10 bg-zinc-950 p-2 text-xs" />
              </div>

              <div className="flex gap-2">
                <button type="button" onClick={() => update(item)} className="rounded border border-white/20 px-3 py-2 text-xs">Save</button>
                <button type="button" onClick={() => remove(item.id)} className="rounded border border-rose-500/30 px-3 py-2 text-xs text-rose-300">Delete</button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}
