// Server-only: reads usage_logs with the service-role client. Never import
// this from a client component.

import { createAdminClient } from "@/lib/supabase/admin";
import { USD_TO_INR } from "@/lib/constants";

/**
 * Cached because the support page is public and would otherwise re-scan a
 * month of usage_logs on every view. Serverless instances are reused, so a
 * short TTL removes most repeat queries without needing a materialised total.
 */
let cached: { at: number; inr: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

/**
 * Total AI spend for the current calendar month, in rupees.
 *
 * Only ever returns the aggregate — no per-user rows leave this function, so
 * it is safe to render for any visitor. Returns null if the figure cannot be
 * computed, and callers should simply omit the number rather than error.
 */
export async function getMonthlyAiCostInr(): Promise<number | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.inr;

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("usage_logs")
      .select("cost_usd")
      .gte("created_at", start.toISOString())
      .limit(50000);

    if (error || !data) return cached?.inr ?? null;

    let usd = 0;
    for (const row of data) usd += Number(row.cost_usd) || 0;

    const inr = usd * USD_TO_INR;
    cached = { at: Date.now(), inr };
    return inr;
  } catch {
    // A missing service-role key or a transient DB error must not take the
    // page down; the cost line just disappears.
    return cached?.inr ?? null;
  }
}
