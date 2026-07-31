export default function Loading() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="skeleton h-8 w-48 mb-2" />
          <div className="skeleton h-4 w-64" />
        </div>
        <div className="skeleton h-10 w-32" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton h-5 w-1/3 mb-3" />
            <div className="skeleton h-4 w-2/3 mb-2" />
            <div className="skeleton h-4 w-1/4" />
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading your papers…
      </span>
    </div>
  );
}
