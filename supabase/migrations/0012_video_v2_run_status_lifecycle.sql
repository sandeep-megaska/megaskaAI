-- Expand V2 run lifecycle states for execute -> validate workflow.
alter table if exists public.video_generation_runs
  drop constraint if exists video_generation_runs_status_check;

alter table if exists public.video_generation_runs
  add constraint video_generation_runs_status_check
  check (status in ('planned', 'queued', 'running', 'succeeded', 'failed', 'validated', 'completed'));
