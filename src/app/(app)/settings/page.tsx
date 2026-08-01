import { requireUser } from "@/lib/auth";
import SettingsForm from "@/components/settings/SettingsForm";
import { ThemeChoice } from "@/components/ThemeControls";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile } = await requireUser();
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm profile={profile} />

      {/*
        Appearance is kept out of SettingsForm: that form writes to the
        profiles table, while the theme is a per-device choice held in this
        browser's storage. Nothing here needs saving.
      */}
      <section className="card p-6 mt-6">
        <h2 className="font-semibold mb-1 text-sm">Appearance</h2>
        <p className="help mb-4">
          Applies to this browser only, and takes effect straight away. Printed
          and exported papers are always on white paper.
        </p>
        <ThemeChoice />
      </section>
    </div>
  );
}
