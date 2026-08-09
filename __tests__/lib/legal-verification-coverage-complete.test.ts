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
import { computeCoverageGap, articleKeys } from "@/lib/legal-verification/coverage";

describe("법령 검증 커버리지", () => {
  it("legal-codes 인용 조문이 전부 VERIFICATION_MANIFEST에 등록돼 있다", () => {
    const gap = computeCoverageGap(collectCitedCitations());

    // 실패 시 어느 조문이 빠졌는지 바로 보이도록 배열을 그대로 단언한다
    expect(gap.uncovered).toEqual([]);
    expect(gap.coverageRate).toBe(1);
  });

  it("커버리지 모수가 비어 있지 않다 (수집기 자체가 깨지면 100%로 보인다)", () => {
    // `collectCitedCitations()`가 0건을 반환하면 uncovered도 0건이라 위 테스트가 통과한다.
    // 그 위양성을 막는 하한선 — **현재 323조문**이며, 대폭 줄면 수집기 회귀를 의심해야 한다.
    const gap = computeCoverageGap(collectCitedCitations());
    expect(gap.totalArticles).toBeGreaterThan(280);
  });

  /**
   * ⭐ **총량 하한만으로는 「시행령만 빠지는」 실패를 못 잡는다** (2026-08-09 · R-J 후속).
   *
   * 시행령·시행규칙을 `LAW_ALIAS` 화이트리스트와 매니페스트에 등재한 뒤 모수가
   * 201 → **323**으로 늘었는데, 하한선은 등재 **이전**에 정한 **150** 그대로였다.
   * 실측하면 시행령·시행규칙 기여분이 **112조문**이고 본법만 남으면 **211**이라,
   * 그 112가 통째로 사라져도 `211 > 150`으로 **조용히 통과**했다.
   *
   * 이 갭은 정확히 R-J가 만들었던 상태로 되돌아가는 경로다 — 「시행령 60여 건이
   * 몇 달간 숨어 있었다」(`coverage.ts` UNVERIFIABLE_LAW_NAMES 주석)의 재발.
   * ⇒ **기여분에 독립 하한**을 둔다. 총량 하한을 올리는 것만으로는 부족하다
   *   (본법 인용이 늘면 시행령이 줄어도 총량이 유지된다).
   *
   * ## mutation probe 실측 (2026-08-09) — 이 가드만 잡는다
   *
   * `LAW_ALIAS`에서 `"소득세법 시행령"`·`"소령"` 두 줄을 지우고 실행:
   *
   * | 단언 | 결과 |
   * |---|---|
   * | `uncovered = []` | ✅ 통과 — 빠진 조문은 **모수에서 사라지므로 uncovered에도 안 뜬다** |
   * | `totalArticles > 280` | ✅ 통과 |
   * | **이 테스트** | 🔴 **실패** (`expected 73 to be greater than 90`) |
   *
   * ⇒ 종전 구성이었다면 소득세법 시행령이 커버리지에서 통째로 빠져도 **전부 초록**이었다.
   *   [[feedback_negative_assertion_needs_mutation_probe]]
   */
  it("시행령·시행규칙이 모수에 남아 있다 (본법만 남으면 총량 하한은 통과한다)", () => {
    const keys = new Set(collectCitedCitations().flatMap(articleKeys));
    const decreeKeys = [...keys].filter(
      (k) => k.includes("시행령") || k.includes("시행규칙"),
    );
    // 현재 112조문. `LAW_ALIAS`에서 시행령 약칭이 빠지거나 수집기가 하위법령을
    // 흘리면 여기가 먼저 빨개진다.
    expect(decreeKeys.length).toBeGreaterThan(90);
  });
});
