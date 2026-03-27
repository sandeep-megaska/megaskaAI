"use client";

import { useMemo, useState } from "react";
import { excerpt, getAssetCardLabel, getAssetUrl, shortId } from "@/app/studio/video/v2/components/helpers";

type GalleryImage = { id: string; prompt: string; asset_url?: string | null; url?: string | null };

export default function FallbackAssetPicker({ images, selectedGenerationId, onSelect }: { images: GalleryImage[]; selectedGenerationId: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => images.filter((image) => image.id.includes(search) || image.prompt.toLowerCase().includes(search.toLowerCase())),
    [images, search],
  );

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen((prev) => !prev)} className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-left text-sm hover:bg-zinc-900">
        {selectedGenerationId ? `Fallback asset: ${shortId(selectedGenerationId)}` : "Choose fallback asset"}
      </button>
      {open ? (
        <div className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-950/95 p-3 shadow-xl">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search id or prompt"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
          />
          <div className="grid max-h-72 grid-cols-1 gap-2 overflow-auto">
            {filtered.map((image) => {
              const imageUrl = getAssetUrl(image);
              const active = selectedGenerationId === image.id;
              return (
                <button
                  type="button"
                  key={image.id}
                  onClick={() => {
                    onSelect(image.id);
                    setOpen(false);
                  }}
                  className={`flex items-center gap-2 rounded-lg border p-2 text-left ${
                    active ? "border-sky-400 bg-sky-500/10" : "border-zinc-800 bg-zinc-900/40"
                  }`}
                >
                  <div className="h-12 w-12 overflow-hidden rounded bg-zinc-900">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt={shortId(image.id)} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-medium">{shortId(image.id)}</p>
                      <span className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">{getAssetCardLabel(image.prompt)}</span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-400">{excerpt(image.prompt, 72)}</p>
                  </div>
                </button>
              );
            })}
            {!filtered.length ? <p className="text-xs text-zinc-500">No matching assets.</p> : null}
          </div>
          <select className="w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs" value={selectedGenerationId} onChange={(event) => onSelect(event.target.value)}>
            <option value="">Technical fallback dropdown</option>
            {images.map((image) => (
              <option key={image.id} value={image.id}>
                {shortId(image.id)} · {excerpt(image.prompt, 48)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </div>
  );
}
