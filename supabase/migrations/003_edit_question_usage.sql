-- AI-assisted question editing: teacher describes what to change about one
-- existing question in plain English, and gets a revision (text and/or a
-- diagram edit) back. Its usage needs its own action so cost is
-- distinguishable from a regenerate in the admin panel.
--
-- Same shape as the generate_image addition in 002_question_images.sql: the
-- usage_logs.action CHECK constraint must list every action logUsage() is
-- ever called with, or the insert fails. logUsage() swallows that failure
-- (a logging failure must never break the request), so without this
-- migration the feature works but its cost silently never appears anywhere.
alter table public.usage_logs drop constraint usage_logs_action_check;
alter table public.usage_logs add constraint usage_logs_action_check
  check (action in ('generate_batch', 'regenerate_question', 'verify_batch', 'analyze_reference', 'export', 'generate_image', 'edit_question'));
