/**
 * 법령 조문 자동 검증 API
 * POST /api/admin/verify-legal
 *
 * KOREAN_LAW_OC 환경변수가 설정된 경우에만 동작.
 * 프로덕션 배포 환경에서는 호출 자체를 막아야 한다.
 */

import { NextResponse } from "next/server";
import { verifyAll, VERIFICATION_MANIFEST } from "@/lib/legal-verification/verifier";

export const maxDuration = 60; // Vercel 함수 최대 실행 시간(초)

export async function POST() {
  if (!process.env.KOREAN_LAW_OC) {
    return NextResponse.json(
      { error: "KOREAN_LAW_OC 환경변수가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const startAt = Date.now();

  const results = await verifyAll(VERIFICATION_MANIFEST, { concurrency: 3 });

  const pass  = results.filter((r) => r.status === "PASS").length;
  const fail  = results.filter((r) => r.status === "FAIL").length;
  const error = results.filter((r) => r.status === "ERROR").length;
  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);

  return NextResponse.json({
    summary: { total: results.length, pass, fail, error, elapsed },
    results: results.map((r) => ({
      id: r.rule.id,
      citation: r.rule.citation,
      status: r.status,
      articleTitle: r.articleTitle ?? null,
      failedKeywords: r.failedKeywords ?? null,
      foundForbiddenKeywords: r.foundForbiddenKeywords ?? null,
      error: r.error ?? null,
    })),
  });
}
