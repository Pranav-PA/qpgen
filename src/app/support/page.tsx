import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import UpiPanel from "@/components/support/UpiPanel";
import { getOptionalProfile } from "@/lib/auth";
import { getMonthlyAiCostInr } from "@/lib/support";
import { FIXED_COSTS_INR, UPI_PAYEE_NAME, UPI_VPA } from "@/lib/constants";
import { formatInr } from "@/lib/upi";

export const metadata = {
  title: "Support",
  description:
    "QPGen is free to use. If it has saved you time, you can contribute towards the domain and AI running costs over UPI.",
};

// Reads live usage totals, so it must not be statically rendered.
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const [profile, monthlyAiInr] = await Promise.all([
    getOptionalProfile(),
    getMonthlyAiCostInr(),
  ]);

  const monthName = new Date().toLocaleString("en-IN", { month: "long" });

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
          It does cost something to run, though. If QPGen has saved you an
          evening of typing out question papers, you are welcome to put
          something towards that.
        </p>

        <h2 className="font-semibold mt-10 mb-3">What it costs to run</h2>
        <div className="card divide-y divide-line">
          {monthlyAiInr !== null && monthlyAiInr > 0 && (
            <div className="flex items-baseline justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">AI generation</p>
                <p className="help">
                  Actual spend across every paper generated this {monthName}
                </p>
              </div>
              <span className="text-sm font-mono shrink-0">
                {formatInr(monthlyAiInr)}
              </span>
            </div>
          )}
          {FIXED_COSTS_INR.map((cost) => (
            <div
              key={cost.label}
              className="flex items-baseline justify-between gap-4 p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{cost.label}</p>
                <p className="help">{cost.period}</p>
              </div>
              <span className="text-sm font-mono shrink-0">
                {cost.amount > 0 ? formatInr(cost.amount) : "—"}
              </span>
            </div>
          ))}
        </div>
        <p className="help mt-2">
          The AI figure is measured, not estimated — every generation logs its
          own token cost.
        </p>

        <h2 className="font-semibold mt-10 mb-3">Contribute over UPI</h2>
        <UpiPanel vpa={UPI_VPA} payeeName={UPI_PAYEE_NAME} />

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
          <li>
            Money goes to running costs in this order: the domain, the AI bill,
            then faster hosting if there is ever enough to justify it.
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
