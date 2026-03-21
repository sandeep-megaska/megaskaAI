create extension if not exists pgcrypto;

-- Megaska AI Studio V2 schema slice 1: anchor packs + generation planning + run/validation persistence.

create table if not exists public.anchor_packs (
  id uuid primary key default gen_random_uuid(),
  pack_name text not null,
  pack_type text not null check (pack_type in ('identity', 'garment', 'scene', 'hybrid')),
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  notes text,
  aggregate_stability_score numeric(5,4) not null default 0,
  is_ready boolean not null default false,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.anchor_pack_items (
  id uuid primary key default gen_random_uuid(),
  anchor_pack_id uuid not null references public.anchor_packs(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  role text not null check (
    role in (
      'front',
      'three_quarter_left',
      'three_quarter_right',
      'back',
      'detail',
      'context',
      'face_closeup',
      'fit_anchor',
      'start_frame',
      'end_frame'
    )
  ),
  sort_order int not null default 0,
  camera_signature text,
  lighting_signature text,
  pose_signature text,
  garment_signature text,
  scene_signature text,
  stability_score numeric(5,4) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anchor_pack_id, generation_id, role)
);

create table if not exists public.video_generation_plans (
  id uuid primary key default gen_random_uuid(),
  motion_request text not null,
  mode_selected text not null check (mode_selected in ('ingredients_to_video', 'frames_to_video', 'scene_extension')),
  why_mode_selected text not null,
  recommended_pack_ids uuid[] not null default '{}',
  required_reference_roles text[] not null default '{}',
  duration_seconds int not null,
  aspect_ratio text not null,
  motion_complexity text not null check (motion_complexity in ('low', 'medium', 'high')),
  anchor_risk_level text not null check (anchor_risk_level in ('low', 'medium', 'high')),
  director_prompt text not null,
  fallback_prompt text,
  negative_constraints text[] not null default '{}',
  provider_order text[] not null default '{}',
  planner_model text,
  planner_version text not null default 'gemini-3.1-pro-preview',
  debug_trace jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_generation_runs (
  id uuid primary key default gen_random_uuid(),
  generation_plan_id uuid not null references public.video_generation_plans(id) on delete cascade,
  output_generation_id uuid references public.generations(id) on delete set null,
  mode_selected text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  provider_used text,
  provider_model text,
  run_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_validation_results (
  id uuid primary key default gen_random_uuid(),
  video_generation_run_id uuid not null references public.video_generation_runs(id) on delete cascade,
  face_similarity_score numeric(5,4),
  garment_similarity_score numeric(5,4),
  scene_similarity_score numeric(5,4),
  pose_continuity_score numeric(5,4),
  overall_score numeric(5,4) not null,
  decision text not null check (decision in ('pass', 'retry', 'reject', 'manual_review')),
  failure_reasons text[] not null default '{}',
  validation_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_anchor_packs_pack_type on public.anchor_packs(pack_type);
create index if not exists idx_anchor_packs_status on public.anchor_packs(status);
create index if not exists idx_anchor_pack_items_pack_id_sort on public.anchor_pack_items(anchor_pack_id, sort_order);
create index if not exists idx_anchor_pack_items_generation_id on public.anchor_pack_items(generation_id);
create index if not exists idx_video_generation_plans_created_at on public.video_generation_plans(created_at desc);
create index if not exists idx_video_generation_runs_plan_id on public.video_generation_runs(generation_plan_id);
create index if not exists idx_video_validation_results_run_id on public.video_validation_results(video_generation_run_id);

-- Reuse trigger function created in prior migrations.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_anchor_packs_updated_at') then
    create trigger trg_anchor_packs_updated_at
      before update on public.anchor_packs
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_anchor_pack_items_updated_at') then
    create trigger trg_anchor_pack_items_updated_at
      before update on public.anchor_pack_items
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_video_generation_plans_updated_at') then
    create trigger trg_video_generation_plans_updated_at
      before update on public.video_generation_plans
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_video_generation_runs_updated_at') then
    create trigger trg_video_generation_runs_updated_at
      before update on public.video_generation_runs
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
