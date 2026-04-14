"use client";

import { useEffect } from "react";

export default function HistoryError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[History] Page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <h2 className="font-bold mb-2">이력을 불러오지 못했습니다</h2>
        <button
          onClick={reset}
          className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
