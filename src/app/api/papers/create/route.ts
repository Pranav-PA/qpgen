import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser, jsonError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { institutionSchema, paperSettingsSchema } from "@/lib/schemas";

const bodySchema = z.object({
  title: z.string().trim().min(2).max(200),
  settings: paperSettingsSchema,
  institution: institutionSchema,
  has_reference: z.boolean().default(false),
});

const LIMIT_MESSAGES: Record<string, { message: string; status: number }> = {
  user_capped: {
    message:
      "You've reached your daily generation limit. It resets at midnight — this keeps the tool free for everyone.",
    status: 429,
  },
  global_capped: {
    message:
      "The site has hit its daily generation budget. Please try again tomorrow — this cap protects the free service from abuse.",
    status: 429,
  },
  paused: {
    message: "Paper generation is temporarily paused by the administrator. Please try again later.",
    status: 503,
  },
  disabled: { message: "This account has been disabled.", status: 403 },
};

export async function POST(request: Request) {
  const ctx = await getApiUser();
  if ("error" in ctx) return ctx.error;
  const { supabase, user } = ctx;

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch (err) {
    const msg =
      err instanceof z.ZodError
        ? err.issues[0]?.message ?? "Invalid input."
        : "Invalid input.";
    return jsonError(msg, 400);
  }

  // Atomic rate-limit check — one paper counts as one generation.
  const admin = createAdminClient();
  const { data: verdict, error: rpcError } = await admin.rpc("consume_generation", {
    p_user_id: user.id,
  });
  if (rpcError) {
    // The cause matters and used to be discarded: a revoked grant, a missing
    // function and a bad service-role key all surfaced as the same sentence
    // with nothing recorded anywhere.
    console.error("[papers/create] consume_generation failed:", {
      message: rpcError.message,
      details: rpcError.details,
      hint: rpcError.hint,
      code: rpcError.code,
    });
    return jsonError(
      `Could not check your generation quota: ${rpcError.message}`,
      500
    );
  }
  if (verdict !== "ok") {
    const m = LIMIT_MESSAGES[verdict as string] ?? LIMIT_MESSAGES.disabled;
    return jsonError(m.message, m.status);
  }

  const { data: paper, error } = await supabase
    .from("papers")
    .insert({
      user_id: user.id,
      title: body.title,
      exam_type:
        body.settings.exam_type === "Custom"
          ? body.settings.exam_type_custom || "Custom"
          : body.settings.exam_type,
      subject: body.settings.subject,
      chapters: body.settings.chapters,
      question_count: body.settings.question_count,
      difficulty_settings: body.settings.difficulty,
      institution_details: body.institution,
      settings: body.settings,
      questions: [],
      reference_pdf_used: body.has_reference,
      status: "draft",
    })
    .select("id")
    .single();

  if (error || !paper) return jsonError("Could not save the paper. Please retry.", 500);

  // Remember letterhead details for next time (exam-specific fields excluded).
  await supabase
    .from("profiles")
    .update({
      institution_defaults: {
        name: body.institution.name,
        address: body.institution.address,
        logo_url: body.institution.logo_url,
        instructions: body.institution.instructions,
        duration_minutes: body.institution.duration_minutes,
      },
    })
    .eq("id", user.id);

  return NextResponse.json({ paper_id: paper.id });
}
