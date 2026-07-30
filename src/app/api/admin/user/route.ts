import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiAdmin, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  user_id: z.string().uuid(),
  action: z.enum(["disable", "enable", "set_cap"]),
  cap: z.number().int().min(0).max(1000).nullable().optional(),
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
  if (body.user_id === ctx.user.id && body.action === "disable") {
    return jsonError("You cannot disable your own admin account.", 400);
  }

  const admin = createAdminClient();
  const update =
    body.action === "disable"
      ? { is_disabled: true }
      : body.action === "enable"
        ? { is_disabled: false }
        : { daily_generation_cap: body.cap ?? null };

  const { error } = await admin.from("profiles").update(update).eq("id", body.user_id);
  if (error) return jsonError("Update failed.", 500);
  return NextResponse.json({ ok: true });
}
