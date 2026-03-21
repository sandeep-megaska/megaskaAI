# Megaska AI Studio V2 (Slice 1)

This repo now includes the first additive slice of the V2 anchor-first pipeline.

## Included in Slice 1

- **Schema foundation** for:
  - `anchor_packs`
  - `anchor_pack_items`
  - `video_generation_plans`
  - `video_generation_runs`
  - `video_validation_results`
- **Anchor Pack Builder APIs**
  - `GET/POST /api/studio/video/v2/anchor-packs`
  - `PATCH /api/studio/video/v2/anchor-packs/:packId`
  - `POST /api/studio/video/v2/anchor-packs/:packId/items`
  - `POST /api/studio/video/v2/anchor-packs/:packId/stability`
- **Mode Router + Director Planner contract**
  - deterministic mode selection (`ingredients_to_video`, `frames_to_video`, `scene_extension`)
  - planner output contract persisted in `video_generation_plans`
  - `POST /api/studio/video/v2/plan`
- **V2 UI shell** at `/studio/video/v2` with:
  - anchor pack creation/assignment/removal
  - planning panel
  - validation panel history readout

## How to use

1. Run migrations (including `0011_video_v2_anchor_and_planning_foundation.sql`).
2. Open `/studio/video/v2`.
3. Create packs and assign existing image generations to roles.
4. Enter a motion request and generate a Director plan contract.
5. Review validation history as runs are integrated in future slices.

## Notes

- Existing Image Project and Video Project routes remain unchanged.
- V2 is additive and isolated to `/studio/video/v2` and `/api/studio/video/v2/*`.
