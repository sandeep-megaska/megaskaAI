-- Raise the storage bucket's per-object size limit so generated videos fit.
--
-- Veo 3.1 renders at higher resolution and with native audio, so an 8s clip is
-- several times larger than the Veo 2 output this bucket was sized for. Uploads
-- were failing with "The object exceeded the maximum allowed size" (HTTP 413
-- EntityTooLarge) from Supabase Storage.
--
-- 47185920 bytes = 45 MB, matching DEFAULT_VIDEO_MAX_UPLOAD_BYTES in
-- lib/supabaseStorageUpload.ts. Keep the two in step if either changes.
--
-- NOTE: the project-level global upload limit (Dashboard -> Storage -> Settings)
-- still caps this. A bucket limit above the global limit has no effect, so
-- confirm the global limit is at least as large.

-- A null file_size_limit means "inherit the project global limit", so it is
-- left alone: only an explicit bucket limit that is too low gets raised.
update storage.buckets
set file_size_limit = 47185920
where id = 'brand-assets'
  and file_size_limit is not null
  and file_size_limit < 47185920;
