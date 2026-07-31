import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="no-print border-t border-line mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          QP<span className="text-accent">Gen</span> — always review generated
          questions before distributing them.
        </span>
        <Link href="/support" className="hover:text-foreground">
          ♥ Support this project
        </Link>
      </div>
    </footer>
  );
}
