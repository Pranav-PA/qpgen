import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import PrintView from "@/components/print/PrintView";
import type { Paper } from "@/lib/types";

export const metadata = { title: "Print answer key" };

export default async function PrintKeyPage({
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
  return <PrintView paper={paper} mode="key" />;
}
