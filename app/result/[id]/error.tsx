"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ResultError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Result] Page error:", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <p className="text-2xl mb-2">⚠️</p>
        <h2 className="font-bold mb-2">결과를 불러오지 못했습니다</h2>
        <div className="flex gap-3 justify-center mt-3">
          <button
            onClick={reset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            다시 시도
          </button>
          <Link
            href="/history"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40"
          >
            이력으로
          </Link>
        </div>
      </div>
    </div>
  );
}
