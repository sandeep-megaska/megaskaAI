-- Megaska AI Studio V2 Slice E: allow explicit expanded anchor provenance in working pack items.

alter table if exists public.working_pack_items
  drop constraint if exists working_pack_items_source_kind_check;

alter table if exists public.working_pack_items
  add constraint working_pack_items_source_kind_check
  check (source_kind in ('reused', 'synthesized', 'derived', 'expanded_generated'));
