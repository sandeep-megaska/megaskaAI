-- Megaska AI Studio V2 Slice D: creative fidelity planner records.

create table if not exists public.clip_fidelity_plans (
  id uuid primary key default gen_random_uuid(),
  clip_intent_id uuid not null references public.clip_intents(id) on delete cascade,
  fidelity_tier text not null check (fidelity_tier in ('low', 'medium', 'high')),
  motion_complexity text not null check (motion_complexity in ('minimal', 'moderate', 'dynamic')),
  view_dependency text not null check (view_dependency in ('low', 'medium', 'high')),
  garment_risk text not null check (garment_risk in ('low', 'medium', 'high')),
  scene_risk text not null check (scene_risk in ('low', 'medium', 'high')),
  required_roles jsonb not null default '[]'::jsonb,
  missing_roles jsonb not null default '[]'::jsonb,
  allowed_synthesis_roles jsonb not null default '[]'::jsonb,
  decision text not null check (decision in ('proceed', 'warn', 'block')),
  decision_reason text null,
  recommended_mode text null check (recommended_mode in ('ingredients_to_video', 'frames_to_video')),
  created_at timestamptz not null default now()
);

create index if not exists idx_clip_fidelity_plans_clip_intent_id
  on public.clip_fidelity_plans(clip_intent_id, created_at desc);
