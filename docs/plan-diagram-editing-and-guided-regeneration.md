# Prompt: fix diagram captions/distribution, add AI-assisted question editing and guided regeneration

Carry this into a new session as the opening message. It is written as a briefing, not a
finished spec — the investigation and root causes below are established; the exact UI
shape and a few implementation calls are left for that session to make with fresh eyes on
the code. Read `AGENTS.md` first, as always.

## Origin

A teacher generated an SSLC Science paper on the branch that added Karnataka board support
(`feat/kseeb-karnataka-high-school`, PRs #2/#3) and reported four things after using it for
real:

1. The text under each generated diagram is the raw image-generation prompt, not a caption.
2. Only one question in the whole paper got a diagram, and it was Physics — Chemistry and
   Biology got none, even though the SSLC papers this project is modeled on clearly include
   diagrams in all three (apparatus setups in Chemistry, labelled structures in Biology).
3. Some generated diagrams were wrong, and there is no way to fix one without discarding
   the whole question and hoping the next random attempt is better.
4. Regeneration is all-or-nothing and blind — one click gets a fresh random question with
   no way to steer what comes back.

This file investigates root causes for all four (with file:line citations, verified by
reading the actual code, not guessed) and proposes what to build. All of it is additive to
`Question`/`PaperSettings`/the review UI; nothing here should change how a paper without
diagrams behaves.

## 1. The caption bug

**Root cause, confirmed:** [generate-batch/route.ts:201](../src/app/api/papers/[id]/generate-batch/route.ts)
sets `figure.caption` to `raw.figure_spec?.slice(0, 150)` — the plain-text prompt the model
wrote for the *image* model, truncated. That is not a caption, it is the drawing
instructions ("A circuit with a 6V battery, two resistors..."), and both renderers print it
verbatim:
- Review UI: [QuestionFigure.tsx:32-36](../src/components/QuestionFigure.tsx)
- PDF export: [pdf/html.ts:258-263](../src/lib/pdf/html.ts)

**Fix:** stop deriving a caption from `figure_spec`. Karnataka's own model papers do not
caption inline diagrams beyond what the question text already says ("Observe the figure
below...") — check the three model papers already in this repo's context/history for that
convention before adding one back. Simplest correct fix: don't set `caption` at all
(`figure: imageUrl ? { image_url: imageUrl } : undefined`), and confirm both renderers
handle an absent caption gracefully (they already do — `figure.caption &&` guards it).

**Optional follow-up, not required to close this out:** if a real caption is wanted later
(e.g. "Fig. 3: Structure of a nephron"), that needs a genuinely new field —
`figure_caption` distinct from `figure_spec` — threaded through the generation JSON schema
in [generate.ts](../src/lib/ai/generate.ts) (`questionsSchema`, `RawQuestion`,
`normalizeRaw`), both API routes, and `QuestionFigure` in `types.ts`. Treat as a separate,
smaller task if the teacher actually wants it; don't bundle it into this fix.

**This bug also affects the regenerate-question route indirectly** — see §3, where a
second, more serious problem in that route is documented.

## 2. Diagrams cluster in one strand and are too sparse

**What "auto" figure mode does today:** `settings.figure_mode === "auto"` (added on the
KSEEB branch, see `AGENTS.md`) marks no slots in `plan.ts`; the model decides per-question
whether to write a `figure_spec`. The guidance it gets is `FIGURE_AUTO_INSTRUCTIONS` in
[generate.ts:190-206](../src/lib/ai/generate.ts).

**Root causes, confirmed by reading the actual generation path:**

- **Batches are blind to each other.** `GENERATION_BATCH_SIZE` is 6
  ([constants.ts:10](../src/lib/constants.ts)), and the SSLC blueprint plan walks parts in
  printed order — all of PART-A (Physics, 12 slots) first, then PART-B (Chemistry, 13),
  then PART-C (Biology, 13) (`blueprintPlan` in [plan.ts](../src/lib/ai/plan.ts)). Each
  `generateQuestions` call in [generate-batch/route.ts](../src/app/api/papers/[id]/generate-batch/route.ts)
  is an independent model call with **no idea** how many diagrams the paper already has, or
  which strands still have zero. If the model decides to add a diagram in the first Physics
  batch, nothing tells the Chemistry or Biology batches that happened, and nothing prompts
  them to catch up.
- **The instructions actively discourage spreading them.** `FIGURE_AUTO_INSTRUCTIONS` says
  *"Do not add a figure just to spread them evenly"* and *"most questions need no figure at
  all"* — a reasonable guard against decorative images, but combined with the point above,
  the net effect is exactly what was observed: whichever batch runs first (Physics, always,
  in the SSLC plan) is the one most likely to produce one, and later strands get nothing.
- **The examples in the prompt skew Physics.** The worked examples in
  `FIGURE_AUTO_INSTRUCTIONS` are "ray diagrams... electric circuits... magnetic field
  arrangements" listed before "apparatus and experiment setups" and "labelled biological
  structures" — not necessarily causal, but worth fixing while in there.
- **The syllabus data for good diagram candidates already exists and isn't being used.**
  `src/lib/curriculum/kseeb.ts` carries a `drawable_figures` list per chapter, sourced
  directly from KSEAB's official 2024-25 diagram list — real Chemistry examples ("Reaction
  of zinc granules with dilute sulphuric acid and testing hydrogen gas by burning",
  "Electrolytic refining of copper") and Biology ones ("Structure of a nephron", "The human
  heart", "The human brain") are sitting right there via the `drawableFigures()` helper in
  `src/lib/curriculum/index.ts`, and nothing in the generation prompt currently reads it.

**You do not need to research this from scratch** — the curriculum data already encodes
KSEAB's own published diagram list, which is a better source than a fresh web search would
turn up. Reuse `drawableFigures(subject)`.

**Proposed fix (two complementary changes, both needed):**

1. **Give each batch call visibility into the paper's running figure state.** Before
   calling `generateQuestions` in `generate-batch/route.ts`, compute how many figures the
   paper already has (this already happens for the budget check —
   `existing.filter((q) => q.figure?.image_url).length`) and break it down **per strand**.
   Thread that into the prompt as new context, e.g. "So far this paper has 1 diagram in
   Physics, 0 in Chemistry, 0 in Biology, out of a maximum of 10." Let the model use that to
   self-correct instead of guessing blind every batch.
2. **Add a light per-part nudge, not a rigid count.** Consider having `plan.ts` mark one
   slot per blueprint section (not more) as a soft candidate in auto mode — something like
   `figure_candidate: true` on the composition line meaning "if this chapter has a natural
   diagram opportunity, this is a good place for one" — without forcing the model to use it
   if the chapter genuinely doesn't warrant one. This guarantees every part gets *asked*
   about a diagram at least once, without reintroducing a fixed count (which is exactly what
   `figure_mode: "auto"` was built to avoid — see `AGENTS.md` and the wizard's "let the AI
   decide" toggle). Weigh this against just relying on (1) + better prompt wording; both are
   legitimate, pick based on how much the model actually improves with (1) alone once you
   can test it.
3. **Strengthen the prompt wording** to name concrete syllabus-correct examples per strand,
   pulled from `drawableFigures()` when `settings.curriculum` is set, rather than generic
   physics-flavoured examples.
4. **Reorder/rebalance the example list** in `FIGURE_AUTO_INSTRUCTIONS` so Chemistry and
   Biology aren't structurally an afterthought in the prompt text itself.

**Testability gap worth closing while in this code:** `mockGenerate()` in
[generate.ts:639-683](../src/lib/ai/generate.ts) never sets `figure_spec` — MOCK_AI mode
cannot exercise any diagram behaviour at all today (not the caption fix, not the
distribution fix, not the editing feature below). Extend it to return a non-null
`figure_spec` on a slot when `slot.wants_figure` is true, and roughly one in every several
slots in auto mode, so the whole diagram lifecycle is testable locally without spending
real Gemini image credits. This directly serves the project's own "verify in the browser
before calling it done" rule and would have caught issue #1 immediately.

## 3. Editing a wrong question or diagram via a prompt

**Two real bugs found while investigating this, fix both regardless of the new feature:**

- **Regenerating a question always drops its diagram, permanently.**
  [regenerate-question/route.ts](../src/app/api/papers/[id]/regenerate-question/route.ts)
  calls `generateQuestions` without the `figures` option at all (compare to
  `generate-batch/route.ts:70` which passes `figures: images.raster !== "off"`). That means
  `opts.figures` is `undefined` → falsy → the model is explicitly told *"Do not produce
  diagrams"* (see the ternary at [generate.ts:250-256](../src/lib/ai/generate.ts)), and the
  route never calls `generateQuestionImage`/`uploadQuestionImage` at all. A teacher hitting
  "Regenerate" on a question that had a diagram gets one back with no diagram, silently,
  every time.
- **No figure-budget check on regenerate.** If this is fixed by wiring images back in, the
  per-paper `MAX_FIGURE_QUESTIONS` cap logic in `generate-batch/route.ts` (the
  `figureBudget`/`figureCapped` block) needs to apply here too, or a teacher could push the
  paper over its image budget one regeneration at a time. This logic is currently only in
  `generate-batch/route.ts` inline — pull it into a small shared helper (e.g.
  `lib/ai/figure-budget.ts`) once a second and third call site need it (this fix, plus the
  edit feature below), rather than copy-pasting it a third time.

**The requested feature: let a teacher describe what's wrong in plain English and have the
question (and/or its diagram) revised accordingly**, e.g. "the circuit is wrong, it
shouldn't show the value, please remove that from the image", or "this should ask about
Ohm's law instead", or "the third option isn't actually wrong, fix the distractors".

Recommended shape:

- **New action, distinct from a full regenerate**, because the useful behaviour is
  different: *keep* everything about the question that the teacher didn't mention, and
  *only* change what the instruction implies. A full regenerate throws away the question
  text and options entirely; an edit should not, or "remove the value from the circuit"
  would come back with an entirely different question by coincidence.
- **Prompt design:** a new system/user prompt pair (or a mode on the existing generation
  call) that hands the model the *current* question in full — `question_text`, `options`,
  `correct_answer`, `solution`, `figure_spec` if any — plus the teacher's instruction, and
  asks for a revised version in the same shape, changing only what the instruction implies
  and leaving marks/type/chapter/section fixed by the app (mirroring how
  `regenerate-question/route.ts:50-64` already pins those fields rather than letting the
  model choose them — do the same here).
- **Frame the teacher's instruction the same way `extra_instructions` is already framed**
  in [generate.ts:141-152](../src/lib/ai/generate.ts) (`teacherInstructionBlock`) — fenced,
  labelled as data, explicitly allowed to narrow/redirect the content but never to override
  the exam/chapter/format rules. This is a security-relevant pattern already established in
  this codebase (untrusted free text going into a model call); don't skip it for the new
  endpoint.
- **Image editing, not just re-drawing from scratch.** Gemini's image models used here
  (`gemini-3.1-flash-image` / `gemini-2.5-flash-image`, see
  [images.ts](../src/lib/ai/images.ts) and `IMAGE_MODEL_FOR_TIER` in
  [constants.ts](../src/lib/constants.ts)) support conversational image editing: passing an
  existing image as an `inlineData` part alongside a new text instruction, rather than only
  fresh text-to-image. `generateQuestionImage` currently only builds a `contents.parts`
  array from a text prompt ([images.ts:39-61](../src/lib/ai/images.ts)). For a targeted fix
  like "remove the value labels from this circuit", editing the *existing* image with the
  teacher's instruction will preserve the parts of the diagram that were already right,
  which a fresh re-render from a rewritten `figure_spec` might not. Recommend adding an
  optional `sourceImage: { bytes, mimeType }` parameter to `generateQuestionImage` used when
  there's an existing image and the instruction is about the diagram; fall back to plain
  text-to-image when there's no existing image, or when the instruction implies the diagram
  should now look completely different rather than be tweaked. Verify the exact Gemini
  request shape for this (multi-part `contents` with an image part + a text part) before
  committing to it — it wasn't tested in this session, only the single text-to-image path
  was read.
- **Support removing a diagram entirely** via the same instruction path ("this doesn't need
  a diagram") — the model returning `figure_spec: null` when it was previously set should
  clear `figure` on the question.
- **Always re-verify and flag for review** after an AI edit, the same way regeneration does
  today (`verifyQuestions` + `needs_review: true`) — never let an AI-edited question skip
  the correctness pass, per `AGENTS.md`'s "correctness is priority #1."
- **Also add a zero-latency manual escape hatch**, independent of AI: in the existing manual
  "Edit" mode ([PaperReview.tsx:725-803](../src/components/review/PaperReview.tsx)), which
  currently has no affordance for the figure at all, add a plain "Remove diagram" button
  that clears `q.figure`. Sometimes the fastest fix for a wrong image is just removing it,
  and this needs no AI round-trip, no cost, and can't fail.
- **Auth/rate limiting:** mirror `regenerate-question`'s existing pattern exactly — it does
  not call `consume_generation` (that only runs once, at paper creation — see
  [papers/create/route.ts:48-52](../src/app/api/papers/create/route.ts)), it just requires
  `getApiUser()` and logs usage. Do the same for the new endpoint; don't add a new
  rate-limit gate that regenerate itself doesn't have. Extend `UsageLog.action` in
  [types.ts:393-398](../src/lib/types.ts) with a new value (e.g. `"edit_question"`) so the
  cost is distinguishable in the admin usage view.

## 4. Regenerate should offer a guided option, not just random

Today, [PaperReview.tsx:597-614](../src/components/review/PaperReview.tsx) has one
"Regenerate" button that always does exactly what `regenerate-question` does: a fresh
random question in the same slot, avoid-listed against the rest of the paper. The teacher
asked for this to become two paths:

1. **Random** (today's behaviour, unchanged as the fast one-click default — do not regress
   this path).
2. **Guided** — teacher types free text describing what they want ("make it about Ohm's law
   with a numerical instead", "make this harder", "this chapter has a diagram, add one"),
   and the *replacement* question is generated fresh (unlike the edit feature in §3, this
   discards the old content entirely) but steered by that instruction, still respecting the
   slot's fixed type/marks/chapter/section/strand exactly like random regenerate does today.

**Architecture recommendation, not a mandate — reconsider with fresh eyes on the code:**
"random regenerate", "guided regenerate", and "AI edit" (§3) share nearly all of their
plumbing — auth, load the paper, load the old question, build a slot, call
`generateQuestions`, verify, optionally render an image (respecting the budget cap), replace
the question in the array, log usage. Rather than three near-duplicate routes, consider one
`POST /api/papers/[id]/regenerate-question` taking `{ question_id, mode: "random" |
"guided" | "edit", instruction?: string }`, where:
- `mode: "random"` is exactly today's behaviour, `instruction` ignored — this must stay the
  literal default so nothing about the current one-click flow changes.
- `mode: "guided"` builds a fresh slot (like random) but adds the instruction as steering,
  reusing the `teacherInstructionBlock` framing.
- `mode: "edit"` hands the model the old question's full content (like §3).

If that consolidation turns out awkward in practice, two or three separate routes is a
perfectly fine fallback — the important thing is not duplicating the auth/verify/image/save
boilerplate three times, whichever shape it ends up taking.

**UI:** replace the single "Regenerate" button with the random path staying a single click
(don't add a menu/confirmation step to the common case), plus a secondary, clearly
secondary affordance — a small "..." menu or a second smaller button — that reveals a text
box for the guided case. Reuse the same inline-disclosure pattern recommended for the §3 AI
edit box rather than inventing a third distinct UI treatment; a teacher fixing a question
likely wants "guided regenerate" and "AI edit" to feel like the same kind of control, even
though they do different things underneath (edit keeps the existing content as a base;
guided regenerate throws it away). Make the distinction between them legible in the UI copy
— e.g. "Ask AI to fix this question" (edit, keeps most of it) vs. "Regenerate with
instructions" (guided, starts over) — since conflating them would be confusing.

## What NOT to do

- Don't touch `figure_mode: "fixed"` behaviour (JEE/NEET-style papers with a manual figure
  count) — everything here is about `"auto"` mode and about single-question actions that
  apply regardless of mode.
- Don't make random regenerate slower, add a confirmation step, or otherwise regress the
  existing one-click path while adding the guided option.
- Don't skip the `teacherInstructionBlock`-style fencing for the new free-text inputs — they
  are untrusted content going into a model call, same as `extra_instructions` already is.
- Don't let an AI-edited or guided-regenerated question skip verification or come back with
  `needs_review: false` — that would violate this project's core correctness rule.
- Don't reintroduce a fixed per-paper or per-part diagram *count* as the fix for §2 — the
  whole point of `figure_mode: "auto"` (see `AGENTS.md`) is that the model decides based on
  the question, not a quota. The fixes proposed above are about giving the model better
  information and better examples, not about forcing a number.

## Suggested order

1. Caption fix (§1) — smallest, isolated, immediately visible improvement.
2. Fix regenerate silently dropping diagrams + missing budget check (§3, the two "fix
   regardless" bugs) — these are real defects independent of any new feature.
3. Extend `mockGenerate` to produce figures (§2's testability gap) — do this before the
   distribution fix so you can actually verify it without spending real image credits.
4. Diagram distribution fix (§2).
5. AI-assisted edit (§3's new feature).
6. Guided regenerate (§4), reusing whatever shared plumbing came out of step 5.

## Verification

- `MOCK_AI=true npm run dev`, exercise every path in the browser once `mockGenerate`
  produces figures: caption no longer shows the spec text, a paper generated in auto mode
  spreads diagrams across strands (check with a fresh SSLC Science paper), regenerating a
  question that had a diagram either keeps or deliberately drops one for a stated reason
  (never silently), the AI-edit box and guided-regenerate box both work and reflect their
  changes in the question card.
- At least one real-API smoke test (small paper, real Gemini key) to confirm the image
  editing request shape actually works — this was not testable in the investigation session
  and is the one part of this plan genuinely unverified end-to-end.
- Re-run the existing verification scripts from the KSEEB branch (structure/schema/regression
  checks) to confirm none of this touches blueprint/plan behaviour unexpectedly — it
  shouldn't, but the plan/generate.ts changes are shared code paths.
