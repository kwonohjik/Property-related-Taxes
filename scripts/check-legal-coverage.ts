#!/usr/bin/env npx tsx
/**
 * 법령 검증 커버리지 갭 점검 CLI
 *
 * 우리 앱이 계산에 쓰는 법령 인용(lib/tax-engine/legal-codes/*) 중
 * 자동 검증 매니페스트(verifier-manifest.ts)에 빠진 조문을 가려낸다.
 *
 * 법제처 API 호출 없는 순수 정적 분석 — .env.local 불필요.
 * 브라우저에서는 "검증 실행" 옆 "커버리지 점검" 버튼으로도 확인 가능
 * (동일 로직: GET /api/admin/legal-coverage).
 *
 * 사용법:
 *   npm run check:legal-coverage         # 갭 요약 + 미검증 조문 목록
 *   npm run check:legal-coverage -- --strict   # 미검증 조문이 있으면 종료코드 1
 *
 * 종료 코드:
 *   0 — 정상 (또는 갭 존재하나 비-strict)
 *   1 — --strict 이면서 미검증 조문 존재
 */

import { collectCitedCitations } from "../lib/legal-verification/coverage-collect.js";
import {
  computeCoverageGap,
  groupUncoveredByLaw,
} from "../lib/legal-verification/coverage.js";

const strict = process.argv.slice(2).includes("--strict");

function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  법령 검증 커버리지 갭 점검  (정적 분석)             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const gap = computeCoverageGap(collectCitedCitations());

  const pct = (gap.coverageRate * 100).toFixed(1);
  const verifiable = gap.totalArticles - gap.absent.length;
  console.log(
    `인용 조문 ${gap.totalArticles}개 (검증대상 ${verifiable}개 + 현행부재 ${gap.absent.length}개)\n` +
      `검증 ${gap.verifiedArticles}개 / 검증대상 ${verifiable}개 (커버리지 ${pct}%) — 미검증 ${gap.uncovered.length}개\n`,
  );

  if (gap.absent.length > 0) {
    console.log("\x1b[33m현행 부재 조문 (legal-codes 인용 점검 필요 — 검증 모수 제외):\x1b[0m");
    console.log(`  ${gap.absent.join(", ")}\n`);
  }

  if (gap.uncovered.length === 0) {
    console.log("\x1b[32m→ 검증 가능한 모든 조문이 검증 매니페스트에 포함되어 있습니다.\x1b[0m\n");
    return;
  }

  console.log("\x1b[33m미검증 조문 (자동 검증 매니페스트에 없음):\x1b[0m");
  for (const { law, articles } of groupUncoveredByLaw(gap.uncovered)) {
    console.log(`\n  ${law}  (${articles.length}개)`);
    console.log(`    ${articles.join(", ")}`);
  }

  console.log(
    "\n\x1b[2m→ 검증을 추가하려면 lib/legal-verification/verifier-manifest.ts 의\n" +
      "  VERIFICATION_MANIFEST 에 { id, citation, keywords } 규칙을 추가하세요.\n" +
      "  keywords 는 강학상 용어가 아닌 '조문 실제 법문' 표현이어야 합니다.\x1b[0m\n",
  );

  if (strict) {
    process.exit(1);
  }
}

main();
