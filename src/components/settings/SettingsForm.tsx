"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/types";
import Icon from "@/components/Icon";

export default function SettingsForm({ profile }: { profile: Profile }) {
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const defaults = profile.institution_defaults ?? {};
  const [instName, setInstName] = useState(defaults.name ?? "");
  const [instAddress, setInstAddress] = useState(defaults.address ?? "");
  const [instructions, setInstructions] = useState(defaults.instructions ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setState("busy");
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: displayName || null,
        institution_defaults: {
          ...defaults,
          name: instName,
          address: instAddress,
          instructions,
        },
      })
      .eq("id", profile.id);
    setState(error ? "error" : "done");
  }

  return (
    <form onSubmit={save} className="card p-6 space-y-5">
      <div>
        <label htmlFor="dn" className="label">Display name</label>
        <input id="dn" className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>

      <div className="border-t border-line pt-5">
        <h2 className="font-semibold mb-1 text-sm">Institution defaults</h2>
        <p className="help mb-4">
          Prefilled on every new paper&apos;s letterhead so you don&apos;t retype them
          each week.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="in" className="label">Institution name</label>
            <input id="in" className="input" value={instName} onChange={(e) => setInstName(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ia" className="label">Address</label>
            <input id="ia" className="input" value={instAddress} onChange={(e) => setInstAddress(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ii" className="label">Default instructions</label>
            <textarea id="ii" rows={5} className="input font-mono text-xs" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={state === "busy"}>
          {state === "busy" ? "Saving…" : "Save settings"}
        </button>
        {state === "done" && (
          <span className="text-sm text-ok inline-flex items-center gap-1">
            <Icon name="check" className="size-4" />
            Saved
          </span>
        )}
        {state === "error" && <span className="text-sm text-danger">Save failed — try again.</span>}
      </div>

      <p className="help border-t border-line pt-4">
        Signed in as {profile.email}. Your papers are private to your account;
        reference PDFs are never stored.
      </p>
    </form>
  );
}
