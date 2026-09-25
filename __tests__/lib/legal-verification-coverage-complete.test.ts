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
import { VERIFICATION_MANIFEST } from "@/lib/legal-verification/verifier-manifest";

describe("법령 검증 커버리지", () => {
  it("legal-codes 인용 조문이 전부 VERIFICATION_MANIFEST에 등록돼 있다", () => {
    const gap = computeCoverageGap(collectCitedCitations());

    // 실패 시 어느 조문이 빠졌는지 바로 보이도록 배열을 그대로 단언한다
    expect(gap.uncovered).toEqual([]);
    expect(gap.coverageRate).toBe(1);
  });

  it("커버리지 모수가 비어 있지 않다 (수집기 자체가 깨지면 100%로 보인다)", () => {
    // `collectCitedCitations()`가 0건을 반환하면 uncovered도 0건이라 위 테스트가 통과한다.
    // 그 위양성을 막는 하한선 — **현재 336조문**(2026-09-20 P0 실측)이며, 대폭 줄면 수집기 회귀를 의심해야 한다.
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
    // 현재 119조문(2026-09-20 P0 실측). `LAW_ALIAS`에서 시행령 약칭이 빠지거나 수집기가 하위법령을
    // 흘리면 여기가 먼저 빨개진다.
    expect(decreeKeys.length).toBeGreaterThan(90);
  });
});

/**
 * 게이트: **재개발 축 핵심 문언이 감시 대상에 남아 있다** (L1-09 · 2026-08-26)
 *
 * 커버리지 게이트는 「법령명 + 조 번호」 단위 비교라(`coverage.ts:8`) §95②·§89①4호가
 * 등록돼 있기만 하면 100%로 집계된다. 그래서 **항·호 수준의 감시 공백**은 그 게이트로
 * 잡히지 않는다 — 실제로 §95② 규칙의 키워드는 「장기보유·공제액·보유기간·공제율」 넷뿐이라
 * 입주권 축이 전적으로 의존하는 **본문 괄호 두 문언**이 개정·삭제돼도 전부 통과했다.
 *
 * 아래 문자열은 2026-08-26 법제처 조문 본문(소득세법 MST 280405, 시행 2026-07-01)의
 * **verbatim**이며, `fetchArticle`이 돌려주는 `fullText`에 실재함을 캐시로 실측했다.
 * 문언이 실제 법문과 맞는지는 `npm run verify:legal`이 라이브 API로 다시 확인한다 —
 * 이 테스트는 **키워드가 조용히 빠지는 것**만 막는다.
 */
describe("재개발 축 감시 문언 — verify:legal 키워드 유지", () => {
  const REQUIRED: Record<string, string[]> = {
    "TRANSFER.LONG_TERM_DEDUCTION": [
      // 승계조합원 LTHD 배제 (REDEVELOPMENT.LTHD_RIGHT_PROVISO)
      "조합원으로부터 취득한 것은 제외한다",
      // 인가전 분 한정 (REDEVELOPMENT.LTHD_RIGHT_GAIN_LIMIT) — 근거는 본문 괄호이지 부속표가 아니다
      "토지분 또는 건물분의 양도차익으로 한정한다",
      // §104⑦ 중과 자산 LTHD 배제 (E2-04가 고친 축)
      "같은 조 제7항 각 호에 따른 자산은 제외한다",
    ],
    "TRANSFER.ONE_HOUSE_EXEMPT": [
      // §89①4호 가목 — 1세대1입주권 비과세 게이트
      "다른 주택 또는 분양권을 보유하지 아니할 것",
      // §89①4호 각 목 외의 부분 **단서** — 12억 초과 안분 (「가목 단서」가 아니다)
      "12억원을 초과하는 경우에는 양도소득세를 과세한다",
      // 🔴 §89**②** 문언 (P0 · 2026-09-20). 커버리지 비교 단위가 **조**라 §89②는 §89 키로
      //    흡수돼 별도 규칙을 만들 수 없다 ⇒ 이 조의 키워드로 항을 감시하고 여기서 동결한다.
      //    빠지면 §89②가 통째로 개정·삭제돼도 `verify:legal`이 통과한다.
      "조합원입주권 또는 분양권을 보유하다가 그 주택을 양도하는 경우",
      "제1항에도 불구하고 같은 항 제3호를 적용하지 아니한다",
    ],
  };

  for (const [id, keywords] of Object.entries(REQUIRED)) {
    it(`${id} — 재개발 축 문언 ${keywords.length}건이 키워드에 있다`, () => {
      const rule = VERIFICATION_MANIFEST.find((r) => r.id === id);
      expect(rule, `규칙 ${id}이 매니페스트에서 사라졌다`).toBeDefined();
      const missing = keywords.filter((kw) => !rule!.keywords.includes(kw));
      expect(missing, `빠진 감시 문언: ${missing.join(" · ")}`).toEqual([]);
    });
  }
});

/**
 * 게이트: **§39 증자 축 감시 문언이 매니페스트에 남아 있다** (상증39조 코드리뷰 6단계 · 2026-09-25)
 *
 * 커버리지 게이트는 「법령명 + 조 번호」 단위 비교라(`coverage.ts:8-10`) 상증법 §39·상증령 §29가
 * 등록돼 있기만 하면 100%로 집계된다. 그래서 **항·호 수준의 감시 공백**은 그 게이트로 잡히지
 * 않는다 — 실제로 §39 규칙의 키워드 3개·§29 규칙의 4개가 **전부 ①항 본문·1호·조문 제목**에서
 * 와서, 세액을 정하는 §29②(30%·3억·상장 단서)·§39①2호·3호·§39②·§28⑤가 개정·삭제돼도
 * 전건 통과했다(리뷰 #8·#41·#42·#86·#96·#98·#99·#106 — 뮤테이션 PASS 실측).
 *
 * 아래 문자열은 저장소 `fetchArticle`의 **현행 시행본**(상증법 MST 276123 / 상증령 MST 288887)
 * 본문에 실재함을 28건 일괄 probe로 실측했다(MISS 0). 문언이 실제 법문과 맞는지는
 * `npm run verify:legal`이 라이브 API로 다시 확인한다 — 이 테스트는 **키워드가 조용히 빠지는
 * 것**만 막는다. `verify:legal`은 `KOREAN_LAW_OC`·`.env.local`이 필요해 CI에서 돌지 않으므로,
 * 실제로 매 푸시·매 PR에 도는 관문은 이쪽이다.
 */
describe("§39 증자 축 감시 문언 — verify:legal 키워드 유지", () => {
  const REQUIRED: Record<string, string[]> = {
    "INH.GIFT_DEEMED_CAPITAL_INCREASE": [
      // ①1호 가목 괄호 — 주권상장법인 모집방법 배정 제외(`publicOfferingExcluded`)
      "같은 법 제9조제7항에 따른 유가증권의 모집방법(대통령령으로 정하는 경우를 제외한다)으로 배정하는 경우는 제외한다",
      // ①1호 나목 — 실권주 미배정 시 수증자는 「포기자의 특수관계인」
      "실권주를 배정하지 아니한 경우에는 그 신주 인수를 포기한 자의 특수관계인이 신주를 인수함으로써 얻은 이익",
      // ①2호 — 고가 발행 축 진입 문언
      "신주를 시가보다 높은 가액으로 발행하는 경우",
      // ①3호 — 전환주식
      "발행 이후 다른 종류의 주식으로 전환함에 따라 얻은",
      // ② — 소액주주 2명 이상이면 1명으로 의제
      "이익을 증여한 소액주주가 1명인 것으로 보고 이익을 계산한다",
    ],
    "INH_DECREE.CAPITAL_INCREASE_GAIN": [
      "증자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다",
      "주권상장법인등의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 적은 경우",
      "증자후의 1주당 평가가액이 다음 산식에 의하여 계산한 1주당 가액보다 큰 경우",
      // 엔진 상수 0.3 · 300_000_000의 근거 문언
      "100분의 30",
      "3억원 이상",
      "신주인수권증서를 교부받은 경우에는 그 교부일",
      "전환주식을 다른 종류의 주식으로 전환한 날",
      "전환주식 발행 당시",
      "제11조제3항",
      "제3자에게 증권을 취득시킬 목적으로",
      "100분의 1미만",
      "액면가액의 합계액이 3억원 미만",
    ],
    "INH_DECREE.MERGER_GAIN": [
      // §28⑤ — §29②1가·3나 두 단서가 적용되는 모집단(「주권상장법인등」)의 정의 조항.
      //   단서 자체는 §29 규칙이 보지만, 그 단서가 가리키는 **정의**는 여기가 유일한 감시점이다.
      "주권상장법인으로서 그 주권이 같은 법에 따른 증권시장에서 거래되는 법인",
    ],
    "INH_DECREE.CAPITAL_DECREASE_GAIN": [
      "에 미달하는 경우로 한정한다",
      "3억원을 말한다",
      "감자한 주식등의 1주당 평가액의 100분의 30 이상인 경우에는 기준금액은 영(零)으로 한다",
    ],
    "INH_DECREE.CONTRIBUTION_GAIN": [
      "현물출자 전ㆍ후의 주식 1주당 가액이 모두 영 이하인 경우에는 이익이 없는 것으로 본다",
      "제165조의6제1항제3호에 따른 방식으로 배정하는 경우는 제외한다",
      "100분의 30 이상이거나 그 이익이 3억원 이상인 경우에 한정하여",
    ],
  };

  for (const [id, keywords] of Object.entries(REQUIRED)) {
    it(`${id} — §39 축 문언 ${keywords.length}건이 키워드에 있다`, () => {
      const rule = VERIFICATION_MANIFEST.find((r) => r.id === id);
      expect(rule, `규칙 ${id}이 매니페스트에서 사라졌다`).toBeDefined();
      const missing = keywords.filter((kw) => !rule!.keywords.includes(kw));
      expect(missing, `빠진 감시 문언: ${missing.join(" · ")}`).toEqual([]);
    });
  }
});
