import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

// NEXT_PUBLIC_SENTRY_DSN 설정 시에만 Sentry 래핑 (환경변수 미설정 시 원본 config 반환)
async function buildConfig(): Promise<NextConfig> {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return nextConfig;
  }

  const { withSentryConfig } = await import("@sentry/nextjs");

  return withSentryConfig(nextConfig, {
    // Sentry 조직·프로젝트 (환경변수로 주입)
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,

    // 소스맵 업로드 (프로덕션 빌드에서만)
    silent: true,
    widenClientFileUpload: true,

    // 터널 라우트 (광고 차단기 우회)
    tunnelRoute: "/monitoring",

    // 트리쉐이킹: 사용하지 않는 Sentry 모듈 제거
    disableLogger: true,
    automaticVercelMonitors: false,
  });
}

export default buildConfig();
