/**
 * 게이트: **법령 검증 커버리지 100% 유지**
 *
 * `legal-codes/`에 인용한 조문은 전부 `VERIFICATION_MANIFEST`에 등록돼 있어야 한다.
 * 등록되지 않은 조문은 `npm run verify:legal`의 대상에서 **조용히 빠져**, 그 조문이 개정돼
 * 우리 코드의 인용·상수가 낡아도 아무도 알려주지 않는다.
 *
 * ── 왜 vitest 테스트인가 (2026-08-03) ────────────────────────────────────────
 * 이 갭은 **두 번 재발**했다.
 *   · 2026-06-08 — 상증법 §17·§25·§70·§74 미등록(4건) → 등록해 100% 복구
 *   · 2026-08-03 — 국세기본법 §45·§45의2·§48·§52 / 소득세법 §111 / 조특법 §77의2·§77의3 /
 *                  상증법 §52 / 지방세법 §10의6 미등록(9건) → 등록해 100% 복구
 * 두 번 다 **E2E `legal-coverage-button`이 빨개진 뒤에야** 발견됐고, 그 E2E는 최근까지
 * 어느 자동 게이트에도 없었다.
 *
 * `npm run verify:legal`은 법제처 API(`KOREAN_LAW_OC`)와 `.env.local`이 필요해 CI fresh
 * checkout에서는 돌릴 수 없다. 반면 **커버리지 계산은 순수 정적 분석**이라 의존성이 없다.
 * ⇒ vitest에 두면 **pre-push(범위 판정상 `lib/tax-engine/**` 변경 시 전체)와 CI 전체 테스트
 *   양쪽에서 자동으로** 잡힌다. 별도 CI 스텝보다 그물이 넓고 실행 비용은 사실상 0이다.
 *
 * ── 실패했다면 ──────────────────────────────────────────────────────────────
 * 새로 인용한 조문을 `lib/legal-verification/manifest/additions-{세목}.ts`에 등록한다.
 * **키워드는 KoreanLaw MCP로 조회한 조문 본문의 verbatim 표현**이어야 한다(강학상 용어 금지).
 * 등록 후 `npm run verify:legal`로 키워드가 실제 법문과 맞는지 확인한다.
 */
import { describe, it, expect } from "vitest";
import { collectCitedCitations } from "@/lib/legal-verification/coverage-collect";
import { computeCoverageGap } from "@/lib/legal-verification/coverage";

describe("법령 검증 커버리지", () => {
  it("legal-codes 인용 조문이 전부 VERIFICATION_MANIFEST에 등록돼 있다", () => {
    const gap = computeCoverageGap(collectCitedCitations());

    // 실패 시 어느 조문이 빠졌는지 바로 보이도록 배열을 그대로 단언한다
    expect(gap.uncovered).toEqual([]);
    expect(gap.coverageRate).toBe(1);
  });

  it("커버리지 모수가 비어 있지 않다 (수집기 자체가 깨지면 100%로 보인다)", () => {
    // `collectCitedCitations()`가 0건을 반환하면 uncovered도 0건이라 위 테스트가 통과한다.
    // 그 위양성을 막는 하한선 — 현재 201조문이며, 대폭 줄면 수집기 회귀를 의심해야 한다.
    const gap = computeCoverageGap(collectCitedCitations());
    expect(gap.totalArticles).toBeGreaterThan(150);
  });
});
