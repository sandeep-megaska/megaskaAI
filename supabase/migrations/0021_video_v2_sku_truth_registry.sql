-- Megaska AI Studio V2: SKU truth registry + verified anchor override layer.

alter table if exists public.clip_intents
  add column if not exists sku_code text null;

create index if not exists idx_clip_intents_sku_code
  on public.clip_intents(sku_code);

create table if not exists public.sku_truth_registry (
  id uuid primary key default gen_random_uuid(),
  sku_code text not null,
  role text not null check (role in (
    'front',
    'back',
    'left_profile',
    'right_profile',
    'three_quarter_left',
    'three_quarter_right',
    'detail',
    'fit_anchor',
    'context'
  )),
  generation_id uuid not null references public.generations(id) on delete restrict,
  source_kind text not null check (source_kind in ('sku_verified_truth', 'manual_verified_override')),
  is_verified boolean not null default true,
  label text null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku_code, role)
);

create index if not exists idx_sku_truth_registry_sku_code
  on public.sku_truth_registry(sku_code, updated_at desc);

alter table if exists public.working_pack_items
  drop constraint if exists working_pack_items_source_kind_check;

alter table if exists public.working_pack_items
  add constraint working_pack_items_source_kind_check
  check (source_kind in (
    'reused',
    'synthesized',
    'derived',
    'expanded_generated',
    'sku_verified_truth',
    'manual_verified_override',
    'user_uploaded'
  ));
