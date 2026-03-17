"use client";

import { useEffect, useState } from "react";

type ModelItem = {
  id: string;
  model_code: string;
  display_name: string;
  category: string;
  status: string;
  prompt_anchor?: string;
  negative_prompt?: string;
  notes?: string;
  model_assets?: { asset_url: string }[];
};

const emptyForm = {
  model_code: "",
  display_name: "",
  category: "women",
  status: "active",
  prompt_anchor: "",
  negative_prompt: "",
  notes: "",
  asset_urls: "",
};

export default function ModelsPage() {
  const [items, setItems] = useState<ModelItem[]>([]);
  const [form, setForm] = useState(emptyForm);

  async function load() {
    const res = await fetch("/api/models");
    const json = await res.json();
    setItems(json.data ?? []);
  }

  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((json) => {
        setItems(json.data ?? []);
      });
  }, []);

  async function create() {
    await fetch("/api/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, asset_urls: form.asset_urls.split("\n").map((entry) => entry.trim()).filter(Boolean) }),
    });
    setForm(emptyForm);
    load();
  }

  async function update(item: ModelItem) {
    await fetch(`/api/models/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...item, asset_urls: (item.model_assets ?? []).map((asset) => asset.asset_url) }),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-semibold">Model Library</h1>
        <section className="grid gap-2 rounded-xl border border-white/10 p-4">
          <input placeholder="Model Code" value={form.model_code} onChange={(event) => setForm({ ...form, model_code: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <input placeholder="Display Name" value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <input placeholder="Category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Prompt Anchor" value={form.prompt_anchor} onChange={(event) => setForm({ ...form, prompt_anchor: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Negative Prompt" value={form.negative_prompt} onChange={(event) => setForm({ ...form, negative_prompt: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Asset URLs (one per line)" value={form.asset_urls} onChange={(event) => setForm({ ...form, asset_urls: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <button type="button" onClick={create} className="rounded bg-indigo-500 px-3 py-2 text-sm font-semibold">Create Model</button>
        </section>

        <section className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="space-y-2 rounded-xl border border-white/10 p-4">
              <input value={item.display_name} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, display_name: event.target.value } : entry))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
              <textarea value={item.prompt_anchor ?? ""} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, prompt_anchor: event.target.value } : entry))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
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
