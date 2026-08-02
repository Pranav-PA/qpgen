import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_AI_PROVIDER } from "@/lib/constants";
import type { Profile } from "@/lib/types";
import type { ProviderName, Usage } from "@/lib/ai/providers";

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

/**
 * Which AI backend to use. Admin-selectable at runtime, falling back to the
 * env default, and finally to whichever provider actually has a key.
 */
export async function getAiProvider(): Promise<ProviderName> {
  let choice: string | undefined;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "ai")
      .maybeSingle();
    choice = (data?.value as { provider?: string } | null)?.provider;
  } catch {
    // Fall through to the env default.
  }

  const wanted: ProviderName =
    choice === "openai" || choice === "google"
      ? choice
      : (DEFAULT_AI_PROVIDER as ProviderName);

  const hasGoogle = !!process.env.GOOGLE_API_KEY;
  const hasOpenAi = !!process.env.OPENAI_API_KEY;
  if (wanted === "google" && !hasGoogle && hasOpenAi) return "openai";
  if (wanted === "openai" && !hasOpenAi && hasGoogle) return "google";
  return wanted;
}

/**
 * Question-diagram settings, admin-controlled at runtime.
 *
 * "high"/"low" select which Gemini image model renders diagrams (see
 * IMAGE_MODEL_FOR_TIER in lib/ai/images.ts) — chosen by measured output
 * quality, not price; "off" disables diagram questions entirely. There used
 * to be a separate SVG toggle from when the model drew markup directly; that
 * generation path is gone, so a single tri-state is the whole control now.
 */
export type RasterMode = "high" | "low" | "off";
export interface ImageConfig {
  raster: RasterMode;
}

export const DEFAULT_IMAGE_CONFIG: ImageConfig = { raster: "high" };

export async function getImageConfig(): Promise<ImageConfig> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("app_config")
      .select("value")
      .eq("key", "images")
      .maybeSingle();
    const v = data?.value as Partial<ImageConfig> | null;
    const raster = v?.raster;
    return {
      raster:
        raster === "high" || raster === "low" || raster === "off"
          ? raster
          : DEFAULT_IMAGE_CONFIG.raster,
    };
  } catch {
    // A config read failure must not stop generation; fall back to defaults.
    return DEFAULT_IMAGE_CONFIG;
  }
}

export async function logUsage(entry: {
  user_id: string;
  action:
    | "generate_batch"
    | "regenerate_question"
    | "verify_batch"
    | "analyze_reference"
    | "export"
    | "generate_image"
    | "edit_question";
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
