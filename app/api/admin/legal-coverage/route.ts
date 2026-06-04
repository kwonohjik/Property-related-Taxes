/**
 * 법령 검증 커버리지 갭 점검 API
 * GET /api/admin/legal-coverage
 *
 * 우리 앱이 계산에 쓰는 법령 인용(legal-codes) 중 자동 검증 매니페스트에
 * 빠진 조문을 가려낸다. 법제처 API 호출 없는 순수 정적 분석.
 */

import { NextResponse } from "next/server";
import { collectCitedCitations } from "@/lib/legal-verification/coverage-collect";
import {
  computeCoverageGap,
  groupUncoveredByLaw,
} from "@/lib/legal-verification/coverage";

export async function GET() {
  const gap = computeCoverageGap(collectCitedCitations());
  const byLaw = groupUncoveredByLaw(gap.uncovered);

  return NextResponse.json({
    totalArticles: gap.totalArticles,
    verifiedArticles: gap.verifiedArticles,
    uncoveredCount: gap.uncovered.length,
    coverageRate: gap.coverageRate,
    byLaw,
  });
}
