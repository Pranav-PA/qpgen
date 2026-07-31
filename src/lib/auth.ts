import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** For server components/routes behind auth. Redirects if signed out or disabled. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile) redirect("/login");
  if (profile.is_disabled) redirect("/account-disabled");

  return { supabase, user, profile };
}

/**
 * For pages that are public but render differently when signed in (e.g. the
 * support page, which keeps the app header for logged-in teachers). Never
 * redirects — a signed-out or disabled visitor simply gets null.
 */
export async function getOptionalProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  if (!profile || profile.is_disabled) return null;
  return profile;
}

export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") redirect("/dashboard");
  return ctx;
}
