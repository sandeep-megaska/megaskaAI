"use client";

import { useEffect, useState } from "react";

type Preset = {
  id: string;
  name: string;
  prompt_template?: string;
  aspect_ratio?: string;
  overlay_defaults?: { headline?: string; subtext?: string; cta?: string; position?: string };
};

const emptyPreset = {
  name: "",
  prompt_template: "",
  aspect_ratio: "1:1",
  overlay_defaults: '{"position":"bottom"}',
};

export default function PresetsPage() {
  const [items, setItems] = useState<Preset[]>([]);
  const [form, setForm] = useState(emptyPreset);

  async function load() {
    const res = await fetch("/api/presets");
    const json = await res.json();
    setItems(json.data ?? []);
  }

  useEffect(() => {
    fetch("/api/presets")
      .then((res) => res.json())
      .then((json) => {
        setItems(json.data ?? []);
      });
  }, []);

  async function create() {
    await fetch("/api/presets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        overlay_defaults: JSON.parse(form.overlay_defaults || "{}"),
      }),
    });
    setForm(emptyPreset);
    load();
  }

  async function update(item: Preset) {
    await fetch(`/api/presets/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item),
    });
    load();
  }

  async function remove(id: string) {
    await fetch(`/api/presets/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <main className="min-h-screen bg-[#09090b] p-6 text-zinc-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-3xl font-semibold">Brand Presets</h1>
        <section className="grid gap-2 rounded-xl border border-white/10 p-4">
          <input placeholder="Preset Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Prompt Template" value={form.prompt_template} onChange={(event) => setForm({ ...form, prompt_template: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <input placeholder="Aspect Ratio" value={form.aspect_ratio} onChange={(event) => setForm({ ...form, aspect_ratio: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <textarea placeholder="Overlay Defaults JSON" value={form.overlay_defaults} onChange={(event) => setForm({ ...form, overlay_defaults: event.target.value })} className="rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
          <button type="button" onClick={create} className="rounded bg-indigo-500 px-3 py-2 text-sm font-semibold">Create Preset</button>
        </section>

        <section className="space-y-3">
          {items.map((item) => (
            <article key={item.id} className="space-y-2 rounded-xl border border-white/10 p-4">
              <input value={item.name} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, name: event.target.value } : entry))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
              <textarea value={item.prompt_template ?? ""} onChange={(event) => setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, prompt_template: event.target.value } : entry))} className="w-full rounded border border-white/10 bg-zinc-950 p-2 text-sm" />
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
