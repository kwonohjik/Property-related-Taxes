import * as Sentry from "@sentry/nextjs";

// NEXT_PUBLIC_SENTRY_DSN 미설정 시 graceful skip
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // 성능 트래이싱 (프로덕션에서만 활성화)
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,

    // 세션 리플레이 (에러 발생 시 1%, 일반 0.1%)
    replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,
    replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.001 : 0,

    integrations: [
      Sentry.replayIntegration({
        // 개인정보 보호: input 내용 마스킹
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // 개발 환경에서 콘솔 출력 비활성화
    debug: false,
  });
}
