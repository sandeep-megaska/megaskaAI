-- Megaska AI Studio V2 slice 5A: sequence rendering status + output linkage.

alter table public.video_sequences
  drop constraint if exists video_sequences_status_check;

alter table public.video_sequences
  add constraint video_sequences_status_check
  check (status in ('draft', 'ready', 'rendering', 'exported', 'failed'));

alter table public.video_sequences
  add column if not exists output_asset_id uuid references public.generations(id) on delete set null,
  add column if not exists sequence_meta jsonb not null default '{}'::jsonb;

create index if not exists idx_video_sequences_output_asset_id
  on public.video_sequences(output_asset_id);
