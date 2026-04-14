export default function HistoryLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-24 rounded bg-muted mb-2" />
        <div className="h-7 w-32 rounded bg-muted" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border border-border p-4">
            <div className="h-4 w-1/3 rounded bg-muted mb-2" />
            <div className="h-4 w-2/3 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
