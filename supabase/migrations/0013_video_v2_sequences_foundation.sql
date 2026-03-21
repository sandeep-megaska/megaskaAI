-- Megaska AI Studio V2 slice 4B: sequence timeline and export preparation foundation.

create table if not exists public.video_sequences (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  sequence_name text not null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'exported')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.video_sequence_items (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.video_sequences(id) on delete cascade,
  run_id uuid not null references public.video_generation_runs(id) on delete cascade,
  order_index int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_sequences_project_updated on public.video_sequences(project_id, updated_at desc);
create index if not exists idx_video_sequence_items_sequence_order on public.video_sequence_items(sequence_id, order_index);
create index if not exists idx_video_sequence_items_run_id on public.video_sequence_items(run_id);

create unique index if not exists uq_video_sequence_items_sequence_run_active
  on public.video_sequence_items(sequence_id, run_id)
  where is_active = true;

create unique index if not exists uq_video_sequence_items_sequence_order_active
  on public.video_sequence_items(sequence_id, order_index)
  where is_active = true;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_video_sequences_updated_at') then
    create trigger trg_video_sequences_updated_at
      before update on public.video_sequences
      for each row
      execute function public.set_updated_at();
  end if;
end $$;
