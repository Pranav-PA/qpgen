export const metadata = { title: "Account disabled" };

export default function AccountDisabledPage() {
  return (
    <main id="main" className="flex-1 flex items-center justify-center p-6">
      <div className="card p-8 max-w-md text-center">
        <h1 className="text-lg font-semibold mb-2">Account disabled</h1>
        <p className="text-sm text-muted">
          Your account has been disabled by an administrator, usually for
          unusual usage patterns. If you believe this is a mistake, contact the
          site administrator to have it restored.
        </p>
      </div>
    </main>
  );
}
