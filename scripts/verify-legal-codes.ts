#!/usr/bin/env npx tsx
/**
 * 법령 조문 자동 검증 CLI
 *
 * 사용법:
 *   npm run verify:legal              # 전체 검증
 *   npm run verify:legal -- --id INH  # 특정 ID 패턴만 검증
 *   npm run verify:legal -- --clear   # 캐시 초기화 후 재검증
 *
 * 종료 코드:
 *   0 — 전체 통과
 *   1 — 1건 이상 실패/오류
 */

import { verifyAll, VERIFICATION_MANIFEST, type VerificationResult } from "../lib/legal-verification/verifier.js";
import { clearCache } from "../lib/legal-verification/korean-law-client.js";

// ── CLI 인자 파싱 ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const shouldClear = args.includes("--clear");
const idFilter = (() => {
  const idx = args.indexOf("--id");
  return idx !== -1 ? args[idx + 1] : undefined;
})();

// ── 출력 유틸 ─────────────────────────────────────────────────────────────

const PASS  = "\x1b[32m✓ PASS \x1b[0m";
const FAIL  = "\x1b[31m✗ FAIL \x1b[0m";
const ERROR = "\x1b[33m⚠ ERR  \x1b[0m";

function printResult(r: VerificationResult) {
  const icon = r.status === "PASS" ? PASS : r.status === "FAIL" ? FAIL : ERROR;
  const title = r.articleTitle ? ` [${r.articleTitle}]` : "";
  console.log(`${icon} ${r.rule.id.padEnd(42)} ${r.rule.citation}${title}`);

  if (r.failedKeywords?.length) {
    console.log(`        ↳ 누락 키워드: ${r.failedKeywords.map((k) => `"${k}"`).join(", ")}`);
  }
  if (r.foundForbiddenKeywords?.length) {
    console.log(`        ↳ 금지 키워드 발견: ${r.foundForbiddenKeywords.map((k) => `"${k}"`).join(", ")}`);
  }
  if (r.error) {
    console.log(`        ↳ 오류: ${r.error}`);
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  법령 조문 자동 검증  — 법제처 Open API 기반         ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  if (shouldClear) {
    console.log("캐시 초기화 중...");
    await clearCache();
    console.log("완료.\n");
  }

  // 규칙 필터링
  const rules = idFilter
    ? VERIFICATION_MANIFEST.filter((r) => r.id.includes(idFilter))
    : VERIFICATION_MANIFEST;

  if (rules.length === 0) {
    console.error(`"${idFilter}"에 해당하는 규칙이 없습니다.`);
    process.exit(1);
  }

  console.log(`검증 규칙: ${rules.length}건  (동시 요청: 3건)\n`);

  const startAt = Date.now();
  const results = await verifyAll(rules, {
    concurrency: 3,
    onProgress: printResult,
  });

  // ── 요약 ──────────────────────────────────────────────────────────
  const pass  = results.filter((r) => r.status === "PASS").length;
  const fail  = results.filter((r) => r.status === "FAIL").length;
  const error = results.filter((r) => r.status === "ERROR").length;
  const elapsed = ((Date.now() - startAt) / 1000).toFixed(1);

  console.log("\n────────────────────────────────────────────────────────");
  console.log(`결과: 통과 ${pass}건 / 실패 ${fail}건 / 오류 ${error}건   (${elapsed}s)`);

  if (fail > 0 || error > 0) {
    console.log("\n\x1b[31m실패/오류 목록:\x1b[0m");
    results
      .filter((r) => r.status !== "PASS")
      .forEach((r) => {
        console.log(`  • ${r.rule.id}`);
        if (r.failedKeywords?.length) {
          console.log(`    누락 키워드: ${r.failedKeywords.join(", ")}`);
        }
        if (r.foundForbiddenKeywords?.length) {
          console.log(`    금지 키워드: ${r.foundForbiddenKeywords.join(", ")}`);
        }
        if (r.error) {
          console.log(`    오류: ${r.error}`);
        }
      });
    console.log("\n\x1b[31m→ legal-codes.ts 조문 확인 후 수정하세요.\x1b[0m\n");
    process.exit(1);
  }

  console.log("\n\x1b[32m→ 모든 법령 인용이 현행 법조문과 일치합니다.\x1b[0m\n");
}

main().catch((e) => {
  console.error("검증 중 예기치 않은 오류:", e);
  process.exit(1);
});
