import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiAdmin, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  global_daily_cap: z.number().int().min(0).max(100000),
  default_user_daily_cap: z.number().int().min(0).max(1000),
  generation_paused: z.boolean(),
  ai_provider: z.enum(["google", "openai"]).optional(),
  images: z
    .object({
      raster: z.enum(["high", "low", "off"]),
    })
    .optional(),
});

export async function POST(request: Request) {
  const ctx = await getApiAdmin();
  if ("error" in ctx) return ctx.error;

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return jsonError("Invalid input.", 400);
  }

  const { ai_provider, images, ...limits } = body;
  const admin = createAdminClient();

  const { error } = await admin
    .from("app_config")
    .update({ value: limits, updated_at: new Date().toISOString() })
    .eq("key", "limits");
  if (error) return jsonError("Update failed.", 500);

  if (ai_provider) {
    const { error: aiError } = await admin
      .from("app_config")
      .upsert(
        { key: "ai", value: { provider: ai_provider }, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (aiError) return jsonError("Saved limits, but the AI provider did not update.", 500);
  }

  if (images) {
    const { error: imgError } = await admin
      .from("app_config")
      .upsert(
        { key: "images", value: images, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (imgError)
      return jsonError("Saved limits, but the diagram settings did not update.", 500);
  }

  return NextResponse.json({ ok: true });
}
