import Link from "next/link";
import Icon, { type IconName } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeControls";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Name your chapters",
    body: "Pick the exam pattern and type in the chapters you have taught. Nothing outside them is used.",
  },
  {
    title: "Let it draft and self-check",
    body: "Questions are generated in batches, then re-solved by a second AI pass that flags anything it cannot confirm.",
  },
  {
    title: "Review, then export",
    body: "Edit, reorder, regenerate or delete anything. Download the paper and its answer key as separate PDFs.",
  },
];

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "check",
    title: "Chapter-scoped by design",
    body: "Questions come only from the chapters you specify, at JEE, NEET, or Board level — verified by a second AI pass before you see them.",
  },
  {
    icon: "key",
    title: "Answer key, always",
    body: "Every paper ships with a separate answer key: quick-reference answers plus full step-by-step solutions for every question.",
  },
  {
    icon: "pencil",
    title: "You stay in control",
    body: "Edit, delete, or regenerate any question before export. Nothing reaches students without your review.",
  },
  {
    icon: "download",
    title: "Professional exports",
    body: "Print-ready PDF with your institution's letterhead — question paper and answer key as separate documents.",
  },
  {
    icon: "upload",
    title: "Work from your own paper",
    body: "Upload a past paper or question bank and generate only from it — its diagrams come across with the questions. Or use it just as a style guide.",
  },
  {
    icon: "sparkles",
    title: "Real equations",
    body: "Physics and Chemistry papers render proper mathematical notation everywhere — on screen and in the printed PDF.",
  },
];

export default function LandingPage() {
  return (
    <main id="main" className="flex-1">
      <header className="bg-surface border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <span className="font-semibold">
            QP<span className="text-accent">Gen</span>
          </span>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Account">
            <ThemeToggle />
            <Link href="/login" className="btn-secondary text-sm">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary text-sm">
              {/* The long label is what breaks a 360px-wide header. */}
              <span className="hidden sm:inline">Get started free</span>
              <span className="sm:hidden">Sign up</span>
            </Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-16 sm:pt-20 pb-16 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
          Weekly question papers,
          <br />
          <span className="text-accent">minutes instead of hours.</span>
        </h1>
        <p className="mt-5 text-lg text-muted max-w-xl mx-auto">
          Generate chapter-scoped JEE, NEET, and Board exam papers with full
          answer keys. Review every question, then export a polished paper with
          your college letterhead.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/signup" className="btn-primary px-6 py-3 text-base">
            Create your first paper
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted">
          Free to use · AI-assisted, teacher-approved: you review everything
          before it prints
        </p>
      </section>

      {/*
        A teacher's first question is not "what can it do" but "how much of my
        evening does this take". Answering that before the feature grid does
        more work than a seventh card would.
      */}
      <section className="border-y border-line bg-surface">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <h2 className="text-center font-semibold text-lg mb-8">
            Three steps, start to printable
          </h2>
          <ol className="grid gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="inline-flex items-center justify-center size-8 rounded-full bg-accent-soft text-accent font-semibold text-sm mb-3">
                  {i + 1}
                </span>
                <h3 className="font-semibold mb-1">{step.title}</h3>
                <p className="text-sm text-muted leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-6">
            <span className="inline-flex items-center justify-center size-9 rounded-lg bg-accent-soft text-accent mb-3">
              <Icon name={f.icon} className="size-4" />
            </span>
            <h2 className="font-semibold mb-1.5">{f.title}</h2>
            <p className="text-sm text-muted leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      {/*
        Deliberately a <section>, not a <footer>: SiteFooter is the page's
        footer landmark and already renders below this. Two footers meant the
        review notice was announced twice and neither one was "the" footer.
      */}
      <section className="border-t border-line">
        <div className="max-w-3xl mx-auto px-6 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Set this week&apos;s paper tonight.
          </h2>
          <div className="mt-6">
            <Link href="/signup" className="btn-primary px-6 py-3 text-base">
              Create your first paper
            </Link>
          </div>
          <p className="mt-8 text-xs text-muted max-w-md mx-auto">
            QPGen assists teachers — it does not replace their judgment. Always
            review generated questions before distributing them to students.
          </p>
        </div>
      </section>
    </main>
  );
}
