# Reference-led generation ("generate only from this PDF")

## What was actually wrong

A teacher uploaded a NEET *Current Electricity* question bank, typed "generate
questions only from this reference PDF" in the notes box, and got a paper that
had nothing to do with it.

That is the designed behaviour, not a regression:

1. `analyzeReference` renders the PDF's pages, sends them to a vision model
   once, and asks for a **≤300-word style profile**. The prompt ends with
   *"Describe the style; do NOT transcribe or copy any actual question."*
2. The page images are discarded. Nothing downstream ever sees the PDF again.
3. `generateQuestions` writes fresh questions from `settings.chapters` — the
   chapter list typed on step 1 — with the style blurb pasted in as flavour.
4. `teacherInstructionBlock` fences the notes box with *"It cannot override the
   exam, subject, chapter list, composition"*. So "only from this PDF" was
   explicitly neutered on arrival.

Everything the teacher saw follows from that: unrelated questions, invented
diagrams (the paper's own `figure_mode`, not the PDF's figures), and a
difficulty mix driven by the easy/medium/hard sliders rather than the source.

## The shape of the fix

A second **source mode** for a paper, alongside the existing syllabus mode.
Every pre-existing paper is `"syllabus"` and behaves byte-for-byte as before.

```
settings.source_mode        "syllabus" (default) | "reference"
settings.reference_fidelity "variant" (default)  | "reuse"
```

`"reference"` moves the authority for *what to ask* from the chapter list to
the PDF. The syllabus path is untouched.

### 1. Extraction — the PDF becomes a durable question bank

One vision pass **per page** (parallel, bounded concurrency), not one pass over
all pages: a single call returning 120 questions is both unreliable and a very
large output, and per-page calls parallelise. Each page yields items:

```
{ id, ref_label, page, topic, archetype, type, difficulty,
  question_text, options, correct_answer,
  figure: { bbox } | null }
```

`archetype` is the load-bearing field — a short normalised description of *what
the question does* ("resistance of a stretched wire", "power drawn by bulbs in
series"). It is what makes the variety rule below work.

The result is stored in a new `papers.reference_bank` JSONB column, and the
bank's topics are written into `settings.chapters` so the verifier, the
dashboard and the review screen keep working unchanged.

### 2. Diagrams come out of the PDF, not out of an image model

A NEET circuit question is unanswerable without its circuit, and asking Gemini
to redraw one from prose is exactly the failure AGENTS.md warns about.

So: extraction returns a normalised bounding box for each figure, the client
re-renders that page at high scale and **crops the real figure out of it**.
Crops are free, exact, and do not touch `MAX_FIGURE_QUESTIONS` — that ceiling
exists because generated images bill per image, and a crop does not.

A crop is rejected if the box is malformed, implausibly sized, or the cropped
region is essentially blank (an ink-coverage check on the canvas). Rejected
crops fall back to the existing Gemini redraw from a written spec, and *those*
do consume the per-paper image budget.

The wizard's "Include diagram questions" control is replaced in reference mode
by a choice between two ways of getting the PDF's figure onto the page.

#### Trimming the box (found on the first live run)

Boxes come back generous. On the first real paper the Q37 crop swallowed the
tail of the question's own sentence *and* the top row of the source's
`(a)/(b)/(c)/(d)` options, so the answer options printed inside the figure.
Sharpening the extraction prompt did not fix it — measured against the PDF's
text layer, the boxes still enclosed the option markers.

So the crop is trimmed deterministically instead. The page's text layer says
exactly where the prose is; any prose or option line inside the box is closed
out from whichever side of the figure it sits on, and short value-shaped labels
("10 V", "Circuit 1") are left alone. Two details are load-bearing:

- **Pad, then trim.** The other order lets the padding reach straight back
  across the options the trim just removed.
- **Split rows into columns.** A question bank prints two columns, so one
  height carries unrelated text on both sides of the page. Merging them made
  the left column's prose trim a figure in the right column — measured at 58%
  of a correct box before this was fixed.

Measured on page 3 of the real bank: both leaking boxes go to zero prose, at a
cost of 12% and 2% of box height, with all ten of Q37's labels retained.

#### Crop or redraw — the teacher's choice

Trimming makes crops good, not perfect: a crop still inherits its page, so a
poor scan stays a poor scan and a box that was wrong to begin with stays wrong.
So `settings.reference_figures` offers both:

- `"crop"` (default): the figure as printed. Free, nothing invented.
- `"redraw"`: the **crop** is handed to the image model as the thing to copy.

The distinction that makes redraw safe here is that it is image-to-image. The
pre-existing redraw path works from a written description, which is the one
place in this app where a circuit can come out wired wrong with nothing able to
check it. Shown the real figure instead, the model copies topology and values
rather than inferring them, and clears up scan noise and any text the crop
still caught.

Redraws bill per image and are capped by `MAX_FIGURE_QUESTIONS`. Crucially they
degrade to the original crop — when the budget is spent, when the admin tier is
off, or when the call fails, the question keeps the figure it already had. A
redraw must never be able to lose a figure.

### 3. Variety is enforced in code, not asked for in a prompt

The complaint — "if there are 3 same type of questions in the PDF it should not
generate all 3" — is a selection problem, so it is solved deterministically in
`lib/ai/reference-plan.ts` rather than left to the model:

- group items by normalised `archetype`;
- order the archetype groups by cycling through `topic`s, so Ohm's Law is not
  drained before Cells/EMF is touched;
- emit one item per archetype per pass. Every archetype is used once before any
  archetype is used twice.

Pure function of the stored bank, so `nextBatchSlots` resumes a half-generated
paper on exactly the same plan.

### 4. Fidelity is the teacher's call

- `"variant"` (default): each selected item is a template — same concept, same
  structure and difficulty, new numbers and context. Students cannot have seen
  it.
- `"reuse"`: the item is reproduced as printed, with OCR damage repaired and
  LaTeX normalised. Values and options are not to be changed.

Both paths still go through the verifier — correctness is priority #1, and a
transcription can be damaged by OCR as easily as a generated question can be
wrong.

### 5. The sliders stop mattering

In reference mode each question's `type` and `difficulty` come from its source
item. The easy/medium/hard mix and the question-type dropdown are disabled in
the wizard with an explanation rather than silently ignored.

## Printed output

Judged against a paper written by hand from the same PDF, the export had four
faults, all found by rendering a real reference-led paper through
`questionPaperHtml` and looking at it.

- **A varied question can contradict its own figure.** The worst of them, and
  invisible to every check in the pipeline. A live paper asked about a resistor
  banded "Red, Red, Orange, Silver" above a figure — the teacher's original,
  copied across unchanged — still banded Yellow-Violet-Brown-Gold. The verifier
  reads text and cannot see a diagram, so nothing caught it. Variant mode now
  carves out an exception: a source that carries a figure is reproduced as
  printed, never varied, because the figure pins every value in it.
- **No structure.** A reference paper has no blueprint, so 45 questions printed
  as one undifferentiated run. Its questions each carry a real topic — the
  sub-topic heading the source printed them under — so the paper is now grouped
  under those headings, and `reference-plan.ts` orders the selected questions so
  the topics run together. Selection still round-robins for variety; only the
  printing order changed.
- **The scope line ran to six lines.** It printed all two dozen sub-topics under
  the exam title, eating a quarter of page one. Capped at three plus a count.
- **`[4 marks]` forty-five times.** Suppressed when every question on the paper
  is worth the same; the letterhead total and the instructions already say it.

Reference mode also defaults to a two-column page, which is what the source
itself prints and roughly halves the page count.

## Bugs fixed alongside

- **`PATCH /api/papers/[id]` caps `questions` at 60** while a blueprint paper
  may print up to `MAX_QUESTIONS_BLUEPRINT` (80). Saving a full SSLC paper
  fails with "Invalid input".
- **`nextBatchSlots(settings, existing.length)` indexes the plan by count.**
  Delete a question on the review screen, press "Generate remaining", and the
  replacement is generated for the slot at the *end* of the plan — in blueprint
  mode it lands in the wrong part, with the wrong marks and chapter. Made
  position-aware: identical output when nothing has been deleted.
