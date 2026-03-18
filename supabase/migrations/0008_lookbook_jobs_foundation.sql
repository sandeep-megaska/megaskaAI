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

create table if not exists public.lookbook_jobs (
  id uuid primary key default gen_random_uuid(),
  job_code text unique,
  status text not null default 'queued',
  workflow_mode text not null default 'consistent-lookbook',
  model_id uuid not null references public.model_library(id),
  garment_id uuid not null references public.garment_library(id),
  backend text,
  backend_model text,
  output_style text not null default 'catalog',
  no_reconstruction boolean not null default true,
  result_generation_ids uuid[] not null default '{}',
  debug_trace jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lookbook_job_shots (
  id uuid primary key default gen_random_uuid(),
  lookbook_job_id uuid not null references public.lookbook_jobs(id) on delete cascade,
  shot_key text not null,
  shot_title text not null,
  shot_order int not null default 0,
  status text not null default 'queued',
  generation_id uuid references public.generations(id) on delete set null,
  output_url text,
  prompt_hash text,
  debug_trace jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lookbook_job_id, shot_key)
);

create index if not exists idx_lookbook_jobs_status on public.lookbook_jobs(status);
create index if not exists idx_lookbook_jobs_created_at on public.lookbook_jobs(created_at desc);
create index if not exists idx_lookbook_jobs_model_id on public.lookbook_jobs(model_id);
create index if not exists idx_lookbook_jobs_garment_id on public.lookbook_jobs(garment_id);

create index if not exists idx_lookbook_job_shots_job_id on public.lookbook_job_shots(lookbook_job_id);
create index if not exists idx_lookbook_job_shots_status on public.lookbook_job_shots(status);
create index if not exists idx_lookbook_job_shots_shot_order on public.lookbook_job_shots(lookbook_job_id, shot_order);


do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_lookbook_jobs_updated_at'
  ) then
    create trigger trg_lookbook_jobs_updated_at
      before update on public.lookbook_jobs
      for each row
      execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_lookbook_job_shots_updated_at'
  ) then
    create trigger trg_lookbook_job_shots_updated_at
      before update on public.lookbook_job_shots
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
