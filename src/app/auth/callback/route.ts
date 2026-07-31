import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles both OAuth redirects and email-confirmation links.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  /*
   * The provider reports its own failures as query params rather than by
   * omitting the code, and the exchange can fail for its own reasons. Both used
   * to collapse into one generic "invalid or expired" message, which made a
   * misconfigured OAuth client indistinguishable from a stale link and left
   * nothing to debug from. Keep the friendly sentence, but carry the real
   * reason through so it is visible on the login screen and in the logs.
   */
  const providerError =
    searchParams.get("error_description") || searchParams.get("error");

  let reason = providerError;

  if (!reason) {
    if (!code) {
      reason = "The provider did not return a sign-in code.";
    } else {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(`${origin}${safeNext}`);
      }
      reason = error.message;
    }
  }

  console.error("[auth/callback] sign-in failed:", reason);

  const message = `Sign-in failed: ${String(reason).slice(0, 200)}`;
  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent(message)}`
  );
}
