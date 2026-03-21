-- Megaska AI Studio V2: auto production orchestration job storage.

create table if not exists public.video_auto_jobs (
  id uuid primary key default gen_random_uuid(),
  input_prompt text not null,
  status text not null check (status in ('planning', 'generating', 'sequencing', 'rendering', 'completed', 'failed')),
  progress_json jsonb not null default '{}'::jsonb,
  sequence_id uuid null references public.video_sequences(id) on delete set null,
  output_asset_id uuid null references public.generations(id) on delete set null,
  error_message text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_auto_jobs_status_created_at
  on public.video_auto_jobs(status, created_at desc);
