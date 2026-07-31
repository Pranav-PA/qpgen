import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * For server components/routes behind auth. Redirects if signed out or disabled.
 *
 * Wrapped in React's cache() so the layout and the page it renders share a
 * single result per request. Without it every protected page paid for two
 * auth.getUser() calls and two profile selects, each a separate round trip to
 * Supabase — which is expensive whenever the function and the database are not
 * in the same region.
 */
export const requireUser = cache(async () => {
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
});

/**
 * For pages that are public but render differently when signed in (e.g. the
 * support page, which keeps the app header for logged-in teachers). Never
 * redirects — a signed-out or disabled visitor simply gets null.
 */
export const getOptionalProfile = cache(async function (): Promise<Profile | null> {
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
});

export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") redirect("/dashboard");
  return ctx;
}
