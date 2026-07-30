<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# QPGen project notes

- AI Question Paper Generator for teachers (JEE/NEET/Board). See README.md for setup.
- Correctness is priority #1: generated questions go through a second-pass AI verifier; anything unconfirmed gets `needs_review` flags shown to the teacher. Never remove the "review before distributing" notices.
- Question paper and answer key must always export as separate documents.
- Question/solution text stores inline LaTeX (`$...$`). Rendering: KaTeX in UI/print (`src/components/MathText.tsx`), LaTeX→MathML(temml)→OMML(mathml2omml) for DOCX (`src/lib/docx/math.ts`).
- Generation is client-driven in batches (`/api/papers/[id]/generate-batch`), resumable; slot plan is deterministic (`src/lib/ai/plan.ts`).
- Rate limiting is atomic SQL (`consume_generation` in `supabase/migrations/001_init.sql`); RLS is the security boundary — service-role client (`src/lib/supabase/admin.ts`) only for rate-limit bookkeeping, usage logs, and admin routes.
- `MOCK_AI=true` runs generation with free mock questions for local dev.
- Model IDs/pricing are env-overridable in `src/lib/constants.ts`; verify current OpenAI models before changing defaults.
