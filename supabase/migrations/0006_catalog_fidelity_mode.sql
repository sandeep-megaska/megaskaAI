alter table public.tryon_jobs
  add column if not exists workflow_mode text not null default 'standard_tryon',
  add column if not exists fidelity_level text not null default 'balanced',
  add column if not exists preferred_output_style text not null default 'catalog',
  add column if not exists hard_preservation_rules jsonb not null default '{}'::jsonb,
  add column if not exists forbidden_transformations text[] not null default '{}',
  add column if not exists readiness_gate_result jsonb not null default '{}'::jsonb;

create index if not exists idx_tryon_jobs_workflow_mode on public.tryon_jobs(workflow_mode);
create index if not exists idx_tryon_jobs_fidelity_level on public.tryon_jobs(fidelity_level);
