import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_SENTRY_DSN 미설정 시 graceful skip
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // 서버 성능 트래이싱
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

    debug: false,
  });
}
