import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import UpiPanel from "@/components/support/UpiPanel";
import { getOptionalProfile } from "@/lib/auth";
import { UPI_VPA } from "@/lib/constants";

export const metadata = {
  title: "Support",
  description:
    "QPGen is free to use. If it has saved you time, you can contribute towards its running costs over UPI.",
};

// Renders differently for signed-in teachers, so it must not be static.
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const profile = await getOptionalProfile();

  return (
    <>
      {profile ? (
        <AppHeader profile={profile} />
      ) : (
        <header className="no-print bg-surface border-b border-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center">
            <Link href="/" className="font-semibold text-foreground">
              QP<span className="text-accent">Gen</span>
            </Link>
          </div>
        </header>
      )}

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-2xl font-semibold">Support QPGen</h1>
        <p className="text-muted mt-2">
          QPGen is free, and it stays free. There is no paid plan, nothing is
          locked behind a payment, and contributing changes nothing about what
          you can generate.
        </p>
        <p className="text-muted mt-3">
          It does cost something to run, though — the domain, and the AI behind
          every generated paper. If QPGen has saved you an evening of typing out
          question papers, you are welcome to put something towards that.
        </p>

        <h2 className="font-semibold mt-10 mb-3">Contribute over UPI</h2>
        <UpiPanel vpa={UPI_VPA} />

        <h2 className="font-semibold mt-10 mb-3">The fine print</h2>
        <ul className="text-sm text-muted space-y-2 list-disc pl-5">
          <li>
            This goes to a personal UPI account, not a registered charity.
            Nothing here is tax-deductible and no 80G receipt can be issued.
          </li>
          <li>
            Contributions are voluntary and non-refundable. Please do not send
            money you would rather keep.
          </li>
          <li>
            Contributing does not buy priority, extra features, or higher
            generation limits. Everybody gets the same QPGen.
          </li>
        </ul>

        <p className="text-sm text-muted mt-8">
          Would rather help without money? Reporting a bad question with the
          report button is genuinely useful — it is how the question quality
          gets better.
        </p>
      </main>
    </>
  );
}
