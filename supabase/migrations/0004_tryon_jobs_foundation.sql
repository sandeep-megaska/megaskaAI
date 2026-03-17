create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.tryon_jobs (
  id uuid primary key default gen_random_uuid(),
  job_code text unique,
  status text not null default 'queued',
  source_mode text not null,
  model_id uuid references public.model_library(id),
  person_asset_url text,
  garment_id uuid not null references public.garment_library(id),
  preset_id uuid,
  backend text,
  engine_mode text,
  prompt text,
  negative_prompt text,
  constraints jsonb not null default '{}'::jsonb,
  result_generation_id uuid references public.generations(id),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tryon_job_assets (
  id uuid primary key default gen_random_uuid(),
  tryon_job_id uuid not null references public.tryon_jobs(id) on delete cascade,
  asset_role text not null,
  file_path text not null,
  public_url text not null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_tryon_jobs_status on public.tryon_jobs(status);
create index if not exists idx_tryon_jobs_model_id on public.tryon_jobs(model_id);
create index if not exists idx_tryon_jobs_garment_id on public.tryon_jobs(garment_id);
create index if not exists idx_tryon_jobs_created_at on public.tryon_jobs(created_at desc);
create index if not exists idx_tryon_job_assets_tryon_job_id on public.tryon_job_assets(tryon_job_id);
create index if not exists idx_tryon_job_assets_asset_role on public.tryon_job_assets(asset_role);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_tryon_jobs_updated_at'
  ) then
    create trigger trg_tryon_jobs_updated_at
      before update on public.tryon_jobs
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
