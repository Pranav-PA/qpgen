"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MathText from "@/components/MathText";
import type { Question } from "@/lib/types";

export interface AdminData {
  stats: {
    totalUsers: number;
    totalPapers: number;
    generationsToday: number;
    cost30d: number;
  };
  trend: { date: string; count: number }[];
  failures: { created_at: string; action: string; error_message: string }[];
  reports: {
    id: string;
    paper_id: string;
    question_index: number;
    question_snapshot: Question | null;
    reason: string;
    status: "open" | "reviewed" | "dismissed";
    created_at: string;
    reported_by: string;
  }[];
  users: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    is_disabled: boolean;
    daily_generation_cap: number | null;
    generations_today: number;
    last_generation_date: string | null;
    created_at: string;
  }[];
  config: {
    global_daily_cap: number;
    default_user_daily_cap: number;
    generation_paused: boolean;
    ai_provider: "google" | "openai";
  };
  models: { google: string[]; openai: string[] };
  providerStatus: {
    resolved: "google" | "openai";
    google_key: boolean;
    openai_key: boolean;
  };
}

async function post(path: string, body: unknown): Promise<boolean> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export default function AdminPanel({ data }: { data: AdminData }) {
  const router = useRouter();
  const [notice, setNotice] = useState("");

  function done(ok: boolean) {
    setNotice(ok ? "" : "That action failed — check the server logs and retry.");
    if (ok) router.refresh();
  }

  const maxTrend = Math.max(1, ...data.trend.map((t) => t.count));
  const openReports = data.reports.filter((r) => r.status === "open");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">Admin</h1>
        <p className="text-sm text-muted">
          Usage, cost, abuse protection, and reported questions.
        </p>
      </div>

      {notice && <p role="alert" className="text-sm text-danger">{notice}</p>}

      {/* Stats */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Statistics">
        {[
          ["Users", data.stats.totalUsers],
          ["Papers", data.stats.totalPapers],
          ["Generations today", data.stats.generationsToday],
          ["API cost (30d)", `$${data.stats.cost30d.toFixed(2)}`],
        ].map(([label, value]) => (
          <div key={label} className="card p-5">
            <p className="text-xs text-muted uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </section>

      {/* Trend */}
      <section className="card p-5" aria-label="Generation trend">
        <h2 className="font-semibold text-sm mb-3">Generation batches — last 14 days</h2>
        <div className="flex items-end gap-1 h-24">
          {data.trend.map((t) => (
            <div key={t.date} className="flex-1 flex flex-col items-center gap-1" title={`${t.date}: ${t.count}`}>
              <div
                className="w-full bg-accent/70 rounded-t min-h-0.5"
                style={{ height: `${(t.count / maxTrend) * 100}%` }}
              />
              <span className="text-[9px] text-muted rotate-0 hidden sm:block">
                {t.date.slice(8)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Limits */}
      <ConfigSection
        config={data.config}
        models={data.models}
        status={data.providerStatus}
        onDone={done}
      />

      {/* Reports */}
      <section className="card p-5" aria-label="Reported questions">
        <h2 className="font-semibold text-sm mb-1">
          Reported questions{" "}
          {openReports.length > 0 && (
            <span className="badge bg-danger-soft text-danger ml-1">{openReports.length} open</span>
          )}
        </h2>
        {data.reports.length === 0 ? (
          <p className="text-sm text-muted">No reports yet. 🎉</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.reports.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-64">
                    <p className="text-sm">
                      <span className="font-medium">Q{r.question_index + 1}:</span>{" "}
                      {r.question_snapshot ? (
                        <MathText text={r.question_snapshot.question_text.slice(0, 200)} />
                      ) : (
                        <em className="text-muted">question snapshot unavailable</em>
                      )}
                    </p>
                    <p className="text-xs text-danger mt-1">Reason: {r.reason}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {new Date(r.created_at).toLocaleString("en-IN")} · reporter {r.reported_by.slice(0, 8)}…
                    </p>
                  </div>
                  <span
                    className={`badge ${
                      r.status === "open"
                        ? "bg-danger-soft text-danger"
                        : r.status === "reviewed"
                          ? "bg-ok-soft text-ok"
                          : "bg-background border border-line text-muted"
                    }`}
                  >
                    {r.status}
                  </span>
                  {r.status === "open" && (
                    <div className="flex gap-1.5">
                      <button
                        className="btn-secondary text-xs"
                        onClick={async () => done(await post("/api/admin/report", { report_id: r.id, status: "reviewed" }))}
                      >
                        Mark reviewed
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={async () => done(await post("/api/admin/report", { report_id: r.id, status: "dismissed" }))}
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Users */}
      <section className="card p-5 overflow-x-auto" aria-label="Users">
        <h2 className="font-semibold text-sm mb-3">Users (latest 100)</h2>
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-line">
              <th className="py-2 pr-3 font-medium">User</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 font-medium">Today</th>
              <th className="py-2 pr-3 font-medium">Cap</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.users.map((u) => (
              <UserRow key={u.id} user={u} onDone={done} />
            ))}
          </tbody>
        </table>
      </section>

      {/* Failures */}
      <section className="card p-5" aria-label="Recent failures">
        <h2 className="font-semibold text-sm mb-3">Recent generation failures</h2>
        {data.failures.length === 0 ? (
          <p className="text-sm text-muted">No recent failures.</p>
        ) : (
          <ul className="space-y-2 text-xs font-mono">
            {data.failures.map((f, i) => (
              <li key={i} className="text-muted">
                <span className="text-danger">{new Date(f.created_at).toLocaleString("en-IN")}</span>{" "}
                [{f.action}] {f.error_message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ConfigSection({
  config,
  models,
  status,
  onDone,
}: {
  config: AdminData["config"];
  models: AdminData["models"];
  status: AdminData["providerStatus"];
  onDone: (ok: boolean) => void;
}) {
  const [globalCap, setGlobalCap] = useState(config.global_daily_cap);
  const [userCap, setUserCap] = useState(config.default_user_daily_cap);
  const [paused, setPaused] = useState(config.generation_paused);
  const [provider, setProvider] = useState(config.ai_provider);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card p-5" aria-label="Limits">
      <h2 className="font-semibold text-sm mb-3">AI provider</h2>
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label htmlFor="provider" className="label text-xs">Provider used for generation</label>
          <select
            id="provider"
            className="input w-56"
            value={provider}
            onChange={(e) => setProvider(e.target.value as "google" | "openai")}
          >
            <option value="google">Google Gemini</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <p className="text-xs text-muted pb-2">
          Writes with <code>{models[provider][0]}</code>, verifies with{" "}
          <code>{models[provider][1]}</code>. Takes effect on the next
          generation; papers already being generated finish on their current
          provider.
        </p>
      </div>

      <div className="text-xs mb-6 flex flex-wrap gap-x-5 gap-y-1">
        <span>
          Google key:{" "}
          <strong className={status.google_key ? "text-ok" : "text-danger"}>
            {status.google_key ? "configured" : "missing"}
          </strong>
        </span>
        <span>
          OpenAI key:{" "}
          <strong className={status.openai_key ? "text-ok" : "text-danger"}>
            {status.openai_key ? "configured" : "missing"}
          </strong>
        </span>
        <span>
          Actually in use:{" "}
          <strong>{status.resolved === "google" ? "Google Gemini" : "OpenAI"}</strong>
        </span>
        {status.resolved !== config.ai_provider && (
          <span className="text-warn">
            ⚠ Falling back because the selected provider&apos;s key is missing.
          </span>
        )}
      </div>

      <h2 className="font-semibold text-sm mb-3 border-t border-line pt-4">Abuse protection</h2>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor="gcap" className="label text-xs">Global daily batch cap</label>
          <input id="gcap" type="number" min={0} className="input w-36" value={globalCap} onChange={(e) => setGlobalCap(Number(e.target.value) || 0)} />
        </div>
        <div>
          <label htmlFor="ucap" className="label text-xs">Default per-user daily papers</label>
          <input id="ucap" type="number" min={0} className="input w-36" value={userCap} onChange={(e) => setUserCap(Number(e.target.value) || 0)} />
        </div>
        <label className="flex items-center gap-2 text-sm pb-2">
          <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.target.checked)} />
          <span className={paused ? "text-danger font-medium" : ""}>Pause all generation (kill switch)</span>
        </label>
        <button
          className="btn-primary text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            onDone(
              await post("/api/admin/config", {
                global_daily_cap: globalCap,
                default_user_daily_cap: userCap,
                generation_paused: paused,
                ai_provider: provider,
              })
            );
            setBusy(false);
          }}
        >
          {busy ? "Saving…" : "Save limits"}
        </button>
      </div>
    </section>
  );
}

function UserRow({
  user: u,
  onDone,
}: {
  user: AdminData["users"][number];
  onDone: (ok: boolean) => void;
}) {
  const [capInput, setCapInput] = useState(
    u.daily_generation_cap === null ? "" : String(u.daily_generation_cap)
  );
  const today = new Date().toISOString().slice(0, 10);
  const usedToday = u.last_generation_date === today ? u.generations_today : 0;

  return (
    <tr>
      <td className="py-2 pr-3">
        <p className="font-medium">{u.display_name || "—"}</p>
        <p className="text-xs text-muted">{u.email}</p>
      </td>
      <td className="py-2 pr-3">{u.role}</td>
      <td className="py-2 pr-3">{usedToday}</td>
      <td className="py-2 pr-3">
        <span className="flex items-center gap-1">
          <input
            aria-label={`Daily cap for ${u.email}`}
            className="input w-16 text-xs py-1"
            placeholder="default"
            value={capInput}
            onChange={(e) => setCapInput(e.target.value)}
          />
          <button
            className="btn-secondary text-xs px-2 py-1"
            onClick={async () =>
              onDone(
                await post("/api/admin/user", {
                  user_id: u.id,
                  action: "set_cap",
                  cap: capInput === "" ? null : Number(capInput),
                })
              )
            }
          >
            Set
          </button>
        </span>
      </td>
      <td className="py-2 pr-3">
        {u.is_disabled ? (
          <span className="badge bg-danger-soft text-danger">Disabled</span>
        ) : (
          <span className="badge bg-ok-soft text-ok">Active</span>
        )}
      </td>
      <td className="py-2">
        <button
          className={`text-xs ${u.is_disabled ? "btn-secondary" : "btn-danger"}`}
          onClick={async () =>
            onDone(
              await post("/api/admin/user", {
                user_id: u.id,
                action: u.is_disabled ? "enable" : "disable",
              })
            )
          }
        >
          {u.is_disabled ? "Enable" : "Disable"}
        </button>
      </td>
    </tr>
  );
}
