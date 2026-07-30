import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiAdmin, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  global_daily_cap: z.number().int().min(0).max(100000),
  default_user_daily_cap: z.number().int().min(0).max(1000),
  generation_paused: z.boolean(),
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

  const admin = createAdminClient();
  const { error } = await admin
    .from("app_config")
    .update({ value: body, updated_at: new Date().toISOString() })
    .eq("key", "limits");
  if (error) return jsonError("Update failed.", 500);
  return NextResponse.json({ ok: true });
}
