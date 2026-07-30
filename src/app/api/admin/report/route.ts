import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiAdmin, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  report_id: z.string().uuid(),
  status: z.enum(["open", "reviewed", "dismissed"]),
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
    .from("reported_questions")
    .update({ status: body.status })
    .eq("id", body.report_id);
  if (error) return jsonError("Update failed.", 500);
  return NextResponse.json({ ok: true });
}
