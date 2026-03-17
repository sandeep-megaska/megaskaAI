alter table if exists public.garment_library
  add column if not exists print_readiness_score int not null default 0,
  add column if not exists print_readiness_status text not null default 'print_reference_weak',
  add column if not exists print_reference_summary jsonb not null default '{}'::jsonb;

alter table if exists public.tryon_jobs
  add column if not exists print_lock_enabled boolean not null default false,
  add column if not exists print_fidelity_level text not null default 'balanced',
  add column if not exists print_preservation_rules jsonb not null default '{}'::jsonb,
  add column if not exists print_gate_result jsonb not null default '{}'::jsonb;

create index if not exists idx_garment_library_print_readiness_status
  on public.garment_library (print_readiness_status);

create index if not exists idx_tryon_jobs_print_lock_enabled
  on public.tryon_jobs (print_lock_enabled);

create index if not exists idx_tryon_jobs_print_fidelity_level
  on public.tryon_jobs (print_fidelity_level);
