import { requireAdmin } from "@/lib/auth";
import { getAiProvider, getImageConfig } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_AI_PROVIDER,
  GEMINI_GENERATION_MODEL,
  GEMINI_VERIFIER_MODEL,
  GENERATION_MODEL,
  VERIFIER_MODEL,
} from "@/lib/constants";
import AdminPanel, {
  type AdminData,
} from "@/components/admin/AdminPanel";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

/**
 * Clock reads live outside the component body. Reading the time during render
 * is exactly the impurity the compiler objects to, and hoisting it here keeps
 * every window in one call so the 30d, 14d and today boundaries cannot land on
 * different milliseconds.
 */
function timeWindows() {
  const now = Date.now();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return {
    since30d: new Date(now - 30 * 864e5).toISOString(),
    since14d: new Date(now - 14 * 864e5).toISOString(),
    todayStart,
    trendDays: Array.from({ length: 14 }, (_, i) =>
      new Date(now - (13 - i) * 864e5).toISOString().slice(0, 10)
    ),
  };
}

export default async function AdminPage() {
  await requireAdmin();
  const admin = createAdminClient();

  const { since30d, since14d, todayStart, trendDays } = timeWindows();

  const [
    { count: totalUsers },
    { count: totalPapers },
    { count: generationsToday },
    { data: logs30d },
    { data: failures },
    { data: reports },
    { data: users },
    { data: config },
  ] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("papers").select("*", { count: "exact", head: true }),
    admin
      .from("usage_logs")
      .select("*", { count: "exact", head: true })
      .eq("action", "generate_batch")
      .gte("created_at", todayStart.toISOString()),
    admin
      .from("usage_logs")
      .select("created_at, cost_usd, action")
      .gte("created_at", since30d)
      .limit(20000),
    admin
      .from("usage_logs")
      .select("created_at, action, error_message, user_id")
      .eq("success", false)
      .order("created_at", { ascending: false })
      .limit(15),
    admin
      .from("reported_questions")
      .select("id, paper_id, question_index, question_snapshot, reason, status, created_at, reported_by")
      .order("created_at", { ascending: false })
      .limit(50),
    admin
      .from("profiles")
      .select("id, email, display_name, role, is_disabled, daily_generation_cap, generations_today, last_generation_date, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin.from("app_config").select("value").eq("key", "limits").single(),
  ]);

  const { data: aiCfg } = await admin
    .from("app_config")
    .select("value")
    .eq("key", "ai")
    .maybeSingle();

  const imageCfg = await getImageConfig();

  // 14-day generation trend, computed from the 30d log slice.
  const trend: { date: string; count: number }[] = trendDays.map((date) => ({
    date,
    count: 0,
  }));
  const trendMap = new Map(trend.map((t) => [t.date, t]));
  let cost30d = 0;
  for (const log of logs30d ?? []) {
    cost30d += Number(log.cost_usd) || 0;
    if (log.action === "generate_batch" && log.created_at >= since14d) {
      const key = String(log.created_at).slice(0, 10);
      const entry = trendMap.get(key);
      if (entry) entry.count += 1;
    }
  }

  const data: AdminData = {
    stats: {
      totalUsers: totalUsers ?? 0,
      totalPapers: totalPapers ?? 0,
      generationsToday: generationsToday ?? 0,
      cost30d,
    },
    trend,
    failures: (failures ?? []).map((f) => ({
      created_at: f.created_at,
      action: f.action,
      error_message: f.error_message ?? "",
    })),
    reports: (reports ?? []) as AdminData["reports"],
    users: (users ?? []) as AdminData["users"],
    config: {
      ...((config?.value ?? {
        global_daily_cap: 500,
        default_user_daily_cap: 10,
        generation_paused: false,
      }) as Omit<AdminData["config"], "ai_provider" | "images">),
      ai_provider:
        ((aiCfg?.value as { provider?: string } | null)?.provider as
          | "google"
          | "openai"
          | undefined) ?? DEFAULT_AI_PROVIDER,
      images: imageCfg,
    },
    models: {
      google: [GEMINI_GENERATION_MODEL, GEMINI_VERIFIER_MODEL],
      openai: [GENERATION_MODEL, VERIFIER_MODEL],
    },
    // Whether each key actually reaches the server, and which provider the
    // next generation will really use after key-availability fallback.
    providerStatus: {
      resolved: await getAiProvider(),
      google_key: !!process.env.GOOGLE_API_KEY,
      openai_key: !!process.env.OPENAI_API_KEY,
    },
  };

  return <AdminPanel data={data} />;
}
