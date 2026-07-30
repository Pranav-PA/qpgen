import Link from "next/link";

const FEATURES = [
  {
    title: "Chapter-scoped by design",
    body: "Questions come only from the chapters you specify, at JEE, NEET, or Board level — verified by a second AI pass before you see them.",
  },
  {
    title: "Answer key, always",
    body: "Every paper ships with a separate answer key: quick-reference answers plus full step-by-step solutions for every question.",
  },
  {
    title: "You stay in control",
    body: "Edit, delete, or regenerate any question before export. Nothing reaches students without your review.",
  },
  {
    title: "Professional exports",
    body: "Print-ready PDF with your institution's letterhead, and clean editable Word files — question paper and answer key as separate documents.",
  },
  {
    title: "Match your style",
    body: "Upload a past paper as a reference PDF and the AI mirrors its style and difficulty — diagrams and equations included.",
  },
  {
    title: "Real equations",
    body: "Physics and Chemistry papers render proper mathematical notation everywhere: on screen, in PDF, and as native equations in Word.",
  },
];

export default function LandingPage() {
  return (
    <main className="flex-1">
      <header className="bg-surface border-b border-line">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-semibold">QP<span className="text-accent">Gen</span></span>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="btn-secondary text-sm">Sign in</Link>
            <Link href="/signup" className="btn-primary text-sm">Get started free</Link>
          </nav>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
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
          Free to use · AI-assisted, teacher-approved: you review everything before it prints
        </p>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="card p-6">
            <h2 className="font-semibold mb-1.5">{f.title}</h2>
            <p className="text-sm text-muted leading-relaxed">{f.body}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-line py-8 text-center text-xs text-muted">
        QPGen assists teachers — it does not replace their judgment. Always
        review generated questions before distributing to students.
      </footer>
    </main>
  );
}
