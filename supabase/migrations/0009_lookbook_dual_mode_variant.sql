alter table if exists public.lookbook_jobs
  add column if not exists job_variant text default 'catalog';

alter table if exists public.lookbook_jobs
  add column if not exists theme_key text;

alter table if exists public.lookbook_job_shots
  add column if not exists scene_key text;

alter table if exists public.lookbook_job_shots
  add column if not exists pose_key text;

alter table if exists public.lookbook_job_shots
  add column if not exists mood_key text;

update public.lookbook_jobs
set job_variant = 'catalog'
where job_variant is null;
