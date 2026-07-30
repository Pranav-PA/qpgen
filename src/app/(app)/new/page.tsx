import { requireUser } from "@/lib/auth";
import NewPaperWizard from "@/components/new-paper/NewPaperWizard";
import type { InstitutionDetails, PaperSettings } from "@/lib/types";

export const metadata = { title: "New paper" };

export default async function NewPaperPage() {
  const { supabase, user, profile } = await requireUser();

  // Last paper's settings power the "reuse last week's setup" shortcut.
  const { data: lastPaper } = await supabase
    .from("papers")
    .select("settings, institution_details")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ settings: PaperSettings; institution_details: InstitutionDetails }>();

  return (
    <NewPaperWizard
      institutionDefaults={profile.institution_defaults}
      lastSettings={lastPaper?.settings ?? null}
      lastInstitution={lastPaper?.institution_details ?? null}
      userId={user.id}
    />
  );
}
