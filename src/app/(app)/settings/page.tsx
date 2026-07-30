import { requireUser } from "@/lib/auth";
import SettingsForm from "@/components/settings/SettingsForm";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { profile } = await requireUser();
  return (
    <div className="max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <SettingsForm profile={profile} />
    </div>
  );
}
