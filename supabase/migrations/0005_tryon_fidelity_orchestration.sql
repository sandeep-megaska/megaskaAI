create extension if not exists pgcrypto;

alter table public.garment_library
  add column if not exists readiness_score int not null default 0,
  add column if not exists readiness_status text not null default 'reference_incomplete',
  add column if not exists reference_summary jsonb not null default '{}'::jsonb;

alter table public.tryon_jobs
  add column if not exists selected_subject_mode text,
  add column if not exists selected_garment_asset_ids uuid[],
  add column if not exists selected_primary_front_asset_id uuid,
  add column if not exists selected_primary_back_asset_id uuid,
  add column if not exists selected_detail_asset_ids uuid[],
  add column if not exists selected_reference_bundle jsonb not null default '{}'::jsonb,
  add column if not exists orchestration_debug jsonb not null default '{}'::jsonb;

create table if not exists public.tryon_output_reviews (
  id uuid primary key default gen_random_uuid(),
  tryon_job_id uuid not null references public.tryon_jobs(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  overall_rating text,
  garment_fidelity_rating text,
  subject_rating text,
  pose_background_rating text,
  issue_tags text[] not null default '{}',
  review_notes text,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tryon_output_reviews_tryon_job_id on public.tryon_output_reviews(tryon_job_id);
create index if not exists idx_tryon_output_reviews_generation_id on public.tryon_output_reviews(generation_id);
create index if not exists idx_tryon_output_reviews_overall_rating on public.tryon_output_reviews(overall_rating);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_garment_library_updated_at'
  ) then
    create trigger trg_garment_library_updated_at
      before update on public.garment_library
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_tryon_jobs_updated_at'
  ) then
    create trigger trg_tryon_jobs_updated_at
      before update on public.tryon_jobs
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_tryon_output_reviews_updated_at'
  ) then
    create trigger trg_tryon_output_reviews_updated_at
      before update on public.tryon_output_reviews
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
