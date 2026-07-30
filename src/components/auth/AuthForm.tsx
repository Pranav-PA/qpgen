"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Turnstile from "./Turnstile";

const CAPTCHA_ENABLED = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

export default function AuthForm({
  mode,
  next,
  initialError,
}: {
  mode: "login" | "signup";
  next: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [error, setError] = useState(initialError ?? "");
  const [busy, setBusy] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const supabase = createClient();

  async function handleGoogle() {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setError(error.message);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (CAPTCHA_ENABLED && !captchaToken) {
      setError("Please complete the security check below.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: displayName },
            emailRedirectTo: `${location.origin}/auth/callback`,
            ...(captchaToken ? { captchaToken } : {}),
          },
        });
        if (error) throw error;
        // If email confirmation is on (recommended), no session is returned yet.
        if (data.session) {
          router.push(next);
          router.refresh();
        } else {
          setEmailSent(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
          options: captchaToken ? { captchaToken } : undefined,
        });
        if (error) throw error;
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(
        message === "Invalid login credentials"
          ? "Incorrect email or password. If you signed up with Google, use the Google button instead."
          : message
      );
    } finally {
      setBusy(false);
    }
  }

  if (emailSent) {
    return (
      <div className="card p-8 text-center">
        <div className="text-4xl mb-3" aria-hidden>📬</div>
        <h2 className="text-lg font-semibold mb-2">Confirm your email</h2>
        <p className="text-sm text-muted">
          We sent a confirmation link to <strong>{email}</strong>. Click it to
          activate your account, then sign in.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-8">
      <h1 className="text-xl font-semibold mb-1">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="text-sm text-muted mb-6">
        {mode === "login"
          ? "Sign in to generate and manage your question papers."
          : "Free for teachers. Generate your first paper in minutes."}
      </p>

      <button type="button" onClick={handleGoogle} className="btn-secondary w-full">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
        </svg>
        Continue with Google
      </button>

      <div className="flex items-center gap-3 my-5" role="separator">
        <div className="h-px bg-line flex-1" />
        <span className="text-xs text-muted">or with email</span>
        <div className="h-px bg-line flex-1" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div>
            <label htmlFor="displayName" className="label">Your name</label>
            <input
              id="displayName"
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Prof. A. Sharma"
              autoComplete="name"
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "signup" && <p className="help">At least 8 characters.</p>}
        </div>

        <Turnstile onToken={setCaptchaToken} />

        {error && (
          <p role="alert" className="text-sm text-danger bg-danger-soft border border-danger/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="text-sm text-muted mt-6 text-center">
        {mode === "login" ? (
          <>New here? <Link className="text-accent font-medium hover:underline" href="/signup">Create an account</Link></>
        ) : (
          <>Already have an account? <Link className="text-accent font-medium hover:underline" href="/login">Sign in</Link></>
        )}
      </p>
    </div>
  );
}
