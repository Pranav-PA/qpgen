export default function Loading() {
  return (
    <div>
      <div className="skeleton h-8 w-2/3 mb-2" />
      <div className="skeleton h-4 w-1/3 mb-8" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-5">
            <div className="skeleton h-4 w-20 mb-3" />
            <div className="skeleton h-4 w-full mb-2" />
            <div className="skeleton h-4 w-5/6 mb-4" />
            <div className="grid sm:grid-cols-2 gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="skeleton h-4 w-3/4" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        Loading this paper…
      </span>
    </div>
  );
}
