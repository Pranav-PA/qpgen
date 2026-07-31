import { Suspense } from "react";
import AppHeader, { AppHeaderSkeleton } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";

/**
 * The profile fetch lives here rather than in the layout body on purpose. A
 * layout that awaits runtime data blocks navigation entirely and stops any
 * loading.tsx fallback from ever rendering, so the whole app felt frozen
 * between clicking a link and the page appearing.
 *
 * Dropping the await from the layout does not weaken the auth guard: the proxy
 * middleware already redirects signed-out users away from every protected
 * prefix, and each page calls requireUser() itself.
 */
async function HeaderWithProfile() {
  const { profile } = await requireUser();
  return <AppHeader profile={profile} />;
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Suspense fallback={<AppHeaderSkeleton />}>
        <HeaderWithProfile />
      </Suspense>
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </>
  );
}
