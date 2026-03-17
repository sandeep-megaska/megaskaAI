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

create table if not exists public.garment_library (
  id uuid primary key default gen_random_uuid(),
  garment_code text unique not null,
  sku text,
  display_name text not null,
  category text,
  sub_category text,
  status text not null default 'draft',
  brand text not null default 'Megaska',
  description text,
  notes text,
  colorway text,
  print_type text,
  fabric_notes text,
  silhouette_notes text,
  coverage_notes text,
  primary_front_asset_id uuid,
  primary_back_asset_id uuid,
  primary_detail_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.garment_assets (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garment_library(id) on delete cascade,
  asset_type text not null,
  file_path text not null,
  public_url text not null,
  sort_order int not null default 0,
  is_primary boolean not null default false,
  view_label text,
  detail_zone text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_garment_library_garment_code on public.garment_library(garment_code);
create index if not exists idx_garment_library_sku on public.garment_library(sku);
create index if not exists idx_garment_library_status on public.garment_library(status);
create index if not exists idx_garment_assets_garment_id on public.garment_assets(garment_id);
create index if not exists idx_garment_assets_asset_type on public.garment_assets(asset_type);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'garment_library_primary_front_asset_fk'
  ) then
    alter table public.garment_library
      add constraint garment_library_primary_front_asset_fk
      foreign key (primary_front_asset_id) references public.garment_assets(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'garment_library_primary_back_asset_fk'
  ) then
    alter table public.garment_library
      add constraint garment_library_primary_back_asset_fk
      foreign key (primary_back_asset_id) references public.garment_assets(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'garment_library_primary_detail_asset_fk'
  ) then
    alter table public.garment_library
      add constraint garment_library_primary_detail_asset_fk
      foreign key (primary_detail_asset_id) references public.garment_assets(id)
      on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_garment_library_updated_at'
  ) then
    create trigger trg_garment_library_updated_at
      before update on public.garment_library
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
