create extension if not exists pgcrypto;

create table if not exists public.model_library (
  id uuid primary key default gen_random_uuid(),
  model_code text unique not null,
  display_name text not null,
  category text not null,
  status text not null default 'active',
  prompt_anchor text,
  negative_prompt text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists public.model_assets (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.model_library(id) on delete cascade,
  asset_url text not null,
  storage_path text,
  is_primary boolean default false,
  sort_order int default 0,
  created_at timestamptz default now()
);

alter table public.generations
  add column if not exists model_id uuid references public.model_library(id);
