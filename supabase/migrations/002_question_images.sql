-- Question images: teacher-facing diagram generation via Gemini image models.
--
-- Two additions, both required before src/lib/ai/images.ts can be used:
-- 1. A storage bucket for the generated image bytes. Papers.questions stores
--    only the storage PATH, never base64 — that JSONB is selected in full by
--    the dashboard for every paper, and embedding images there would undo the
--    Mumbai-region latency work.
-- 2. usage_logs.action is a CHECK constraint (see 001_init.sql). Without this
--    migration, every image-cost insert fails — and because logUsage()
--    deliberately swallows errors so a logging failure never breaks a
--    request, that failure would be SILENT. Image costs would just be
--    missing from the admin panel with no error anywhere.

-- ============================================================ storage: question-images
insert into storage.buckets (id, name, public) values ('question-images', 'question-images', true);

create policy "question_images_read_public" on storage.objects
  for select using (bucket_id = 'question-images');
create policy "question_images_write_own_folder" on storage.objects
  for insert with check (
    bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "question_images_update_own_folder" on storage.objects
  for update using (
    bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "question_images_delete_own_folder" on storage.objects
  for delete using (
    bucket_id = 'question-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================ usage_logs: allow generate_image
alter table public.usage_logs drop constraint usage_logs_action_check;
alter table public.usage_logs add constraint usage_logs_action_check
  check (action in ('generate_batch', 'regenerate_question', 'verify_batch', 'analyze_reference', 'export', 'generate_image'));
