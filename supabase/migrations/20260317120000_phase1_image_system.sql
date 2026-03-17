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

create table if not exists public.brand_presets (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  prompt_template text,
  overlay_defaults jsonb default '{}'::jsonb,
  aspect_ratio text default '1:1',
  created_at timestamptz default now()
);

alter table public.generations add column if not exists model_id uuid references public.model_library(id);
alter table public.generations add column if not exists preset_id uuid references public.brand_presets(id);
alter table public.generations add column if not exists overlay_json jsonb;
alter table public.generations add column if not exists reference_urls jsonb;
alter table public.generations add column if not exists generation_kind text default 'image';
