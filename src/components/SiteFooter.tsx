import Link from "next/link";
import Icon from "@/components/Icon";

export default function SiteFooter() {
  return (
    <footer className="no-print border-t border-line mt-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>
          QP<span className="text-accent">Gen</span> — always review generated
          questions before distributing them.
        </span>
        <Link
          href="/support"
          className="hover:text-foreground inline-flex items-center gap-1.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <Icon name="heart" className="size-3.5" />
          Support this project
        </Link>
      </div>
    </footer>
  );
}
