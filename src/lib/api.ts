import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";
import type { Usage } from "@/lib/ai/generate";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Auth for API routes. Returns a context or a ready error response. */
export async function getApiUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: jsonError("You need to be signed in.", 401) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (!profile) return { error: jsonError("Profile not found.", 401) };
  if (profile.is_disabled)
    return { error: jsonError("This account has been disabled.", 403) };

  return { supabase, user, profile };
}

/** Auth for admin API routes — role checked against the database, not the client. */
export async function getApiAdmin() {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx;
  if (ctx.profile.role !== "admin")
    return { error: jsonError("Admin access required.", 403) };
  return ctx;
}

export async function logUsage(entry: {
  user_id: string;
  action: "generate_batch" | "regenerate_question" | "verify_batch" | "analyze_reference" | "export";
  usage?: Usage;
  success?: boolean;
  error_message?: string;
}) {
  try {
    const admin = createAdminClient();
    await admin.from("usage_logs").insert({
      user_id: entry.user_id,
      action: entry.action,
      model: entry.usage?.model ?? null,
      input_tokens: entry.usage?.input_tokens ?? 0,
      output_tokens: entry.usage?.output_tokens ?? 0,
      cost_usd: entry.usage?.cost_usd ?? 0,
      success: entry.success ?? true,
      error_message: entry.error_message ?? null,
    });
  } catch {
    // Usage logging must never break the user-facing request.
  }
}
