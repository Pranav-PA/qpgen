import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import PaperReview from "@/components/review/PaperReview";
import type { Paper } from "@/lib/types";

export const metadata = { title: "Review paper" };

export default async function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { supabase } = await requireUser();
  const { id } = await params;

  const { data: paper } = await supabase
    .from("papers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Paper>();
  if (!paper) notFound();

  return <PaperReview initialPaper={paper} />;
}
