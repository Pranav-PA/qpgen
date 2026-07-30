import Link from "next/link";
import { requireUser } from "@/lib/auth";
import PaperList from "@/components/dashboard/PaperList";
import type { Paper } from "@/lib/types";

export const metadata = { title: "My papers" };

export default async function DashboardPage() {
  const { supabase, user, profile } = await requireUser();

  const { data: papers } = await supabase
    .from("papers")
    .select(
      "id, title, exam_type, subject, chapters, question_count, status, created_at, questions"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const list = (papers ?? []).map((p) => ({
    id: p.id as string,
    title: p.title as string,
    exam_type: p.exam_type as string,
    subject: p.subject as string,
    chapters: p.chapters as string[],
    status: p.status as string,
    created_at: p.created_at as string,
    question_count: Array.isArray(p.questions)
      ? (p.questions as Paper["questions"]).length
      : 0,
    flagged: Array.isArray(p.questions)
      ? (p.questions as Paper["questions"]).filter((q) => q.needs_review).length
      : 0,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">My papers</h1>
          <p className="text-sm text-muted">
            Welcome back{profile.display_name ? `, ${profile.display_name}` : ""}.
          </p>
        </div>
        <Link href="/new" className="btn-primary">+ New paper</Link>
      </div>

      {list.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4" aria-hidden>📝</div>
          <h2 className="text-lg font-semibold mb-2">No papers yet</h2>
          <p className="text-sm text-muted mb-6 max-w-sm mx-auto">
            Create your first question paper: pick a chapter, choose how many
            questions, and get a reviewed paper with its answer key in minutes.
          </p>
          <Link href="/new" className="btn-primary">Create your first paper</Link>
        </div>
      ) : (
        <PaperList papers={list} />
      )}
    </div>
  );
}
