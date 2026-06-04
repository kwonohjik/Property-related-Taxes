#!/usr/bin/env npx tsx
/**
 * 법령 검증 커버리지 갭 점검 CLI
 *
 * 우리 앱이 계산에 쓰는 법령 인용(lib/tax-engine/legal-codes/*) 중
 * 자동 검증 매니페스트(verifier-manifest.ts)에 빠진 조문을 가려낸다.
 *
 * 법제처 API 호출 없는 순수 정적 분석 — .env.local 불필요.
 *
 * 사용법:
 *   npm run check:legal-coverage         # 갭 요약 + 미검증 조문 목록
 *   npm run check:legal-coverage -- --strict   # 미검증 조문이 있으면 종료코드 1
 *
 * 종료 코드:
 *   0 — 정상 (또는 갭 존재하나 비-strict)
 *   1 — --strict 이면서 미검증 조문 존재
 */

import * as transfer from "../lib/tax-engine/legal-codes/transfer.js";
import * as inheritanceGift from "../lib/tax-engine/legal-codes/inheritance-gift.js";
import * as acquisition from "../lib/tax-engine/legal-codes/acquisition.js";
import * as property from "../lib/tax-engine/legal-codes/property.js";
import * as comprehensive from "../lib/tax-engine/legal-codes/comprehensive.js";
import * as stock from "../lib/tax-engine/legal-codes/stock.js";
import * as burdenedGift from "../lib/tax-engine/legal-codes/burdened-gift.js";
import * as common from "../lib/tax-engine/legal-codes/common.js";

import { isLegalCitation, computeCoverageGap } from "../lib/legal-verification/coverage.js";

// ── legal-codes 모듈에서 모든 문자열 leaf 재귀 수집 ────────────────────────

function collectStrings(value: unknown, out: string[], seen = new WeakSet<object>()) {
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((v) => collectStrings(v, out, seen));
    } else {
      Object.values(value as Record<string, unknown>).forEach((v) =>
        collectStrings(v, out, seen),
      );
    }
  }
}

const MODULES: Record<string, unknown> = {
  transfer,
  "inheritance-gift": inheritanceGift,
  acquisition,
  property,
  comprehensive,
  stock,
  "burdened-gift": burdenedGift,
  common,
};

// ── CLI 인자 ───────────────────────────────────────────────────────────────

const strict = process.argv.slice(2).includes("--strict");

// ── 메인 ────────────────────────────────────────────────────────────────────

function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  법령 검증 커버리지 갭 점검  (정적 분석)             ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const allStrings: string[] = [];
  for (const mod of Object.values(MODULES)) {
    collectStrings(mod, allStrings);
  }

  const citations = allStrings.filter(isLegalCitation);
  const gap = computeCoverageGap(citations);

  const pct = (gap.coverageRate * 100).toFixed(1);
  console.log(
    `인용 조문 ${gap.totalArticles}개 중 검증 ${gap.verifiedArticles}개 ` +
      `(커버리지 ${pct}%) — 미검증 ${gap.uncovered.length}개\n`,
  );

  if (gap.uncovered.length === 0) {
    console.log("\x1b[32m→ 인용한 모든 조문이 검증 매니페스트에 포함되어 있습니다.\x1b[0m\n");
    return;
  }

  // 법령명별 그룹핑하여 출력
  const byLaw = new Map<string, string[]>();
  for (const key of gap.uncovered) {
    // key = "법령명 제N조[의M]" — 마지막 "제..." 직전까지가 법령명
    const m = key.match(/^(.*?)\s(제\d+조(?:의\d+)?)$/);
    const law = m ? m[1] : key;
    const article = m ? m[2] : key;
    if (!byLaw.has(law)) byLaw.set(law, []);
    byLaw.get(law)!.push(article);
  }

  console.log("\x1b[33m미검증 조문 (자동 검증 매니페스트에 없음):\x1b[0m");
  for (const [law, articles] of [...byLaw.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ko"),
  )) {
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
