-- Megaska AI Studio V2 Slice D reconciliation: add durable planner audit fields.

alter table if exists public.clip_fidelity_plans
  add column if not exists risk_summary jsonb not null default '{}'::jsonb,
  add column if not exists critical_missing_roles jsonb not null default '[]'::jsonb,
  add column if not exists recommendations jsonb not null default '[]'::jsonb;
