create extension if not exists pgcrypto;

-- Video audit outcome: reuse the existing `generations` table for final media persistence,
-- and add only orchestration metadata columns needed for upcoming Video Project Phase 1.
alter table public.generations
  add column if not exists source_generation_id uuid references public.generations(id) on delete set null,
  add column if not exists thumbnail_url text,
  add column if not exists video_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_generations_source_generation_id
  on public.generations(source_generation_id);

create index if not exists idx_generations_generation_kind_created_at
  on public.generations(generation_kind, created_at desc);
