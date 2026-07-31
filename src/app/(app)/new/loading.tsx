export default function Loading() {
  return (
    <div>
      <div className="skeleton h-8 w-56 mb-2" />
      <div className="skeleton h-4 w-80 mb-8" />
      <div className="card p-6 space-y-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton h-4 w-32 mb-2" />
            <div className="skeleton h-10 w-full" />
          </div>
        ))}
        <div className="skeleton h-10 w-40" />
      </div>
      <span className="sr-only" role="status">
        Loading the paper setup…
      </span>
    </div>
  );
}
