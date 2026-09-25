create table if not exists public.provider_request_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  operation text not null,
  status text not null,
  http_status integer,
  error_code text,
  exhaustion_kind text,
  attempt integer not null default 1,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_provider_events_model_created on public.provider_request_events(provider, model, created_at desc);

create table if not exists public.provider_request_leases (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  model text not null,
  operation text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_provider_leases_active on public.provider_request_leases(provider, model, expires_at);

create or replace function public.acquire_provider_request_lease(
  p_provider text, p_model text, p_operation text, p_limit integer default 3, p_ttl_seconds integer default 180
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_provider || ':' || p_model));
  delete from public.provider_request_leases where expires_at <= now();
  if (select count(*) from public.provider_request_leases where provider=p_provider and model=p_model and expires_at>now()) >= greatest(1,p_limit) then
    return null;
  end if;
  insert into public.provider_request_leases(provider,model,operation,expires_at)
  values(p_provider,p_model,p_operation,now()+make_interval(secs=>greatest(30,p_ttl_seconds)))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.release_provider_request_lease(p_id uuid)
returns void language sql security definer set search_path=public as $$
  delete from public.provider_request_leases where id=p_id;
$$;

alter table public.provider_request_events enable row level security;
alter table public.provider_request_leases enable row level security;
