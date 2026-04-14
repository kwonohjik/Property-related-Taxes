export default function ResultLoading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8 animate-pulse">
      <div className="mb-6">
        <div className="h-3 w-40 rounded bg-muted mb-2" />
        <div className="h-7 w-36 rounded bg-muted" />
      </div>
      <div className="h-32 rounded-xl bg-muted mb-4" />
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded bg-muted" />
        ))}
      </div>
    </div>
  );
}
