-- Megaska AI Studio V2: source profile + clip intent + working pack auto-build foundation.

create table if not exists public.clip_source_profiles (
  id uuid primary key default gen_random_uuid(),
  profile_name text not null,
  primary_generation_id uuid not null references public.generations(id) on delete restrict,
  additional_generation_ids jsonb not null default '[]'::jsonb,
  subject_notes text null,
  garment_notes text null,
  scene_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clip_source_profiles_primary_generation
  on public.clip_source_profiles(primary_generation_id);

create table if not exists public.clip_intents (
  id uuid primary key default gen_random_uuid(),
  source_profile_id uuid not null references public.clip_source_profiles(id) on delete cascade,
  intent_label text not null,
  motion_prompt text not null,
  aspect_ratio text not null default '9:16',
  duration_seconds int not null default 8,
  status text not null default 'draft' check (status in ('draft', 'ready', 'building', 'built', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clip_intents_source_profile_id
  on public.clip_intents(source_profile_id, created_at desc);

create table if not exists public.working_packs (
  id uuid primary key default gen_random_uuid(),
  source_profile_id uuid not null references public.clip_source_profiles(id) on delete cascade,
  clip_intent_id uuid not null references public.clip_intents(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'ready', 'needs_review', 'archived')),
  readiness_score numeric(5,4) not null default 0,
  warning_messages jsonb not null default '[]'::jsonb,
  pack_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_working_packs_intent
  on public.working_packs(clip_intent_id, created_at desc);

create table if not exists public.working_pack_items (
  id uuid primary key default gen_random_uuid(),
  working_pack_id uuid not null references public.working_packs(id) on delete cascade,
  role text not null check (role in ('front', 'fit_anchor', 'three_quarter_left', 'three_quarter_right', 'back', 'detail', 'context', 'start_frame', 'end_frame')),
  generation_id uuid null references public.generations(id) on delete set null,
  source_kind text not null default 'reused' check (source_kind in ('reused', 'synthesized', 'derived')),
  synthetic_prompt text null,
  confidence_score numeric(5,4) not null default 0,
  sort_order int not null default 0,
  item_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_working_pack_items_unique_role_per_pack
  on public.working_pack_items(working_pack_id, role);

create index if not exists idx_working_pack_items_pack_sort
  on public.working_pack_items(working_pack_id, sort_order asc);

create table if not exists public.pack_lineage (
  id uuid primary key default gen_random_uuid(),
  working_pack_id uuid not null references public.working_packs(id) on delete cascade,
  working_pack_item_id uuid null references public.working_pack_items(id) on delete set null,
  source_generation_id uuid null references public.generations(id) on delete set null,
  derived_generation_id uuid null references public.generations(id) on delete set null,
  lineage_type text not null check (lineage_type in ('reuse', 'synthesized', 'derived', 'seed')),
  lineage_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_pack_lineage_pack_id
  on public.pack_lineage(working_pack_id, created_at desc);
