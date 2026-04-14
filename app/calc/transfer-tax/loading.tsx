export default function TransferTaxLoading() {
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 animate-pulse">
        <div className="h-3 w-32 rounded bg-muted mb-2" />
        <div className="h-7 w-48 rounded bg-muted" />
      </div>

      {/* StepIndicator 스켈레톤 */}
      <div className="flex items-center gap-1 mb-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
            {i < 4 && <div className="h-0.5 flex-1 mx-1 bg-muted animate-pulse" />}
          </div>
        ))}
      </div>

      {/* 폼 영역 스켈레톤 */}
      <div className="space-y-4 animate-pulse">
        <div className="h-4 w-3/4 rounded bg-muted" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
