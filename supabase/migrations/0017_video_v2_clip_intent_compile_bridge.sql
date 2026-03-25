-- Megaska AI Studio V2 Slice C: clip intent compile bridge metadata.

alter table public.clip_intents
  add column if not exists clip_goal text null,
  add column if not exists scene_policy text null,
  add column if not exists motion_template text null,
  add column if not exists fidelity_priority text null,
  add column if not exists compiled_anchor_pack_id uuid null references public.anchor_packs(id) on delete set null,
  add column if not exists compiled_run_request jsonb null,
  add column if not exists last_compiled_at timestamptz null;

create index if not exists idx_clip_intents_compiled_anchor_pack_id
  on public.clip_intents(compiled_anchor_pack_id);

create index if not exists idx_clip_intents_last_compiled_at
  on public.clip_intents(last_compiled_at desc);
