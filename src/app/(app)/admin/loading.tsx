export default function Loading() {
  return (
    <div>
      <div className="skeleton h-8 w-32 mb-6" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton h-4 w-24 mb-3" />
            <div className="skeleton h-7 w-16" />
          </div>
        ))}
      </div>
      <div className="card p-6 space-y-3">
        <div className="skeleton h-5 w-40 mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-9 w-full" />
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading the admin panel…
      </span>
    </div>
  );
}
