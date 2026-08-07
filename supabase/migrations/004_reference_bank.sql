-- Reference-led generation: the teacher's reference PDF, extracted once into a
-- durable question bank.
--
-- Until now a reference PDF produced only settings.style_notes — a ≤300-word
-- style profile — and the page images were discarded, so "generate only from
-- this PDF" was impossible by construction. The bank holds the PDF's actual
-- questions (text, options, topic, archetype, figure crop URL) so every
-- generation batch can draw from it, and so a half-generated paper resumes on
-- the same deterministic selection.
--
-- Its own column rather than a key inside settings: settings is read on every
-- dashboard row and is validated whole by paperSettingsSchema, whereas the bank
-- is large (a 10-page question bank runs to ~100 KB), read only during
-- generation, and never needs to round-trip through that schema.

alter table public.papers add column if not exists reference_bank jsonb;

comment on column public.papers.reference_bank is
  'Questions extracted from the reference PDF, when settings.source_mode is reference. Null for syllabus-mode papers.';
