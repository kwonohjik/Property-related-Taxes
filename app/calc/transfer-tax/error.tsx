"use client";

import { useEffect } from "react";
import Link from "next/link";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TransferTaxError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[TransferTax] Page error:", error);
    // Sentry 설정 시 자동 캡처 (withSentryConfig가 error boundary 래핑)
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      import("@sentry/nextjs").then(({ captureException }) => captureException(error));
    }
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
        <div className="text-4xl mb-3">⚠️</div>
        <h2 className="text-lg font-bold mb-2">페이지를 불러오지 못했습니다</h2>
        <p className="text-sm text-muted-foreground mb-4">
          잠시 후 다시 시도하거나, 입력한 데이터를 확인해 주세요.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground mb-4">오류 코드: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
