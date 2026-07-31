export default function Loading() {
  return (
    <div>
      <div className="skeleton h-8 w-40 mb-2" />
      <div className="skeleton h-4 w-72 mb-8" />
      <div className="card p-6 space-y-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton h-4 w-28 mb-2" />
            <div className="skeleton h-10 w-full" />
          </div>
        ))}
        <div className="skeleton h-10 w-32" />
      </div>
      <span className="sr-only" role="status">
        Loading your settings…
      </span>
    </div>
  );
}
