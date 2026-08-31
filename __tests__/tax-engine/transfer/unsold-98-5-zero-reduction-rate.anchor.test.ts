/**
 * anchor — §98의5 분양가격 인하율 **0%도 감면 대상**이다 (D5-02)
 *
 * ## 조문 (법제처 `target=eflaw` 실측 2026-08-31)
 *
 * **조특법 §98의5①** — 「…양도소득세에 다음 각 호의 분양가격…인하율에 따른 감면율을 곱하여
 * 계산한 세액을 감면하고…
 *   1. 분양가격 인하율이 **100분의 10 이하**인 경우: 100분의 60
 *   2. 100분의 10을 초과하고 100분의 20 이하인 경우: 100분의 80
 *   3. 100분의 20을 초과하는 경우: 100분의 100」
 *
 * 🔴 **1호에 하한 문언이 없다.** 종전 코드는 `priceReductionRatePct > 0`을 요구해 0%를
 *    「미입력」으로 차단했고, **정가 매입(인하 없음) 사안이 감면을 전혀 받지 못했다**.
 *    조특령 §98의4④의 산정식
 *    「(입주자 모집공고안에 공시된 분양가격 − 매매계약서상의 매매가격) ÷ 공시 분양가격 × 100」도
 *    정가 매입 시 값이 **정확히 0**이 된다.
 *
 * 리뷰 실측 세액 영향: 산출세액 93,650,000원 기준 **56,190,000원 과대과세**(감면 60% 전액 상실).
 *
 * ## 게이트가 **세 계층에 복제**돼 있었다
 * 엔진(`unsold-hybrid-p3.ts`)·⑧validate·④API 변환 모두 0을 버렸다.
 * 특히 ④의 `parseDecimal(...) || undefined`는 **0을 undefined로 바꾼다** —
 * 엔진과 ⑧만 고치면 값이 도달하지 않아 **no-op**가 된다.
 *
 * ## 안전망 실측 (변경 전)
 * `> 0` 게이트를 통째로 풀고 전건(18,286)을 돌렸을 때 **반응 0건**. 아무도 보고 있지 않았다.
 */
import { describe, it, expect } from "vitest";
import { evaluateUnsold985 } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p3";
import { toEngineReductions } from "@/lib/calc/transfer-tax-api-reductions";
import { reductionSchema } from "@/lib/api/transfer-tax-schema-reductions";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const D = (s: string) => new Date(`${s}T00:00:00`);

/**
 * ⚠️ §98의5는 자기확인 요건이 여럿이라 픽스처를 다 채워야 `isEligible`이 열린다 —
 *    처음에 인하율만 넣었더니 NOT_NONCAPITAL_UNSOLD·NOT_FIRST_CONTRACT·OCCUPIED_AT_CONTRACT·
 *    RECONTRACT_EXCLUDED 넷이 함께 떠서 「0% 게이트가 안 풀렸다」로 오독할 뻔했다.
 */
const BASE = {
  contractDate: D("2010-06-01"),
  acquisitionDate: D("2010-07-01"),
  transferDate: D("2014-06-01"),
  calculatedTax: 93_650_000,
  transferIncome: 200_000_000,
  isNonCapitalUnsoldAtCutoff: true,
  isFirstContract: true,
  isNotOccupiedAtContract: true,
  isNotRecontract: true,
};

const codesOf = (r: ReturnType<typeof evaluateUnsold985>) =>
  r.isEligible ? [] : (r.ineligibleReasons ?? []).map((x) => x.code);

describe("엔진 — 인하율 0%", () => {
  it("🔴 0%도 1호(10% 이하)라 60% 감면 대상이다", () => {
    const r = evaluateUnsold985({ ...BASE, priceReductionRatePct: 0 } as Any);
    expect(
      codesOf(r),
      "「미입력」으로 차단하면 정가 매입 사안이 감면을 전혀 못 받는다",
    ).not.toContain("MISSING_PRICE_REDUCTION_RATE");
    expect(r.isEligible).toBe(true);
    expect((r as unknown as { taxReductionRate?: number }).taxReductionRate).toBe(0.6);
  });

  it("기준선 — 5%도 1호라 60%", () => {
    const r = evaluateUnsold985({ ...BASE, priceReductionRatePct: 5 } as Any);
    expect((r as unknown as { taxReductionRate?: number }).taxReductionRate).toBe(0.6);
  });

  it("경계 — 10%는 「이하」라 1호(60%), 10.1%는 2호(80%)", () => {
    const at10 = evaluateUnsold985({ ...BASE, priceReductionRatePct: 10 } as Any);
    const over = evaluateUnsold985({ ...BASE, priceReductionRatePct: 10.1 } as Any);
    expect((at10 as unknown as { taxReductionRate?: number }).taxReductionRate).toBe(0.6);
    expect((over as unknown as { taxReductionRate?: number }).taxReductionRate).toBe(0.8);
  });

  it("🔴 진짜 미입력은 여전히 차단한다 — 0과 구별된다", () => {
    const r = evaluateUnsold985({ ...BASE } as Any);
    expect(codesOf(r)).toContain("MISSING_PRICE_REDUCTION_RATE");
  });

  it("음수는 조문에 없는 구간이라 별도 사유로 막는다", () => {
    const r = evaluateUnsold985({ ...BASE, priceReductionRatePct: -5 } as Any);
    expect(codesOf(r)).toContain("NEGATIVE_PRICE_REDUCTION_RATE");
  });
});

describe("④ API 변환 — 0이 undefined로 바뀌지 않는다", () => {
  function convert(pct: string) {
    const [out] = toEngineReductions(
      [
        {
          type: "unsold_98_5",
          contractDate985: "2010-06-01",
          priceReductionRatePct985: pct,
        } as Any,
      ],
      "purchase",
    );
    return (out as Record<string, unknown>).priceReductionRatePct985;
  }

  it("🔴 \"0\" → 0 (⚠️ `|| undefined`는 0을 버린다)", () => {
    expect(convert("0"), "④에서 0이 사라지면 엔진·⑧을 고쳐도 no-op다").toBe(0);
  });

  it("빈 문자열 → undefined (진짜 미입력)", () => {
    expect(convert("")).toBeUndefined();
  });

  it("\"12.5\" → 12.5", () => {
    expect(convert("12.5")).toBe(12.5);
  });
});

describe("⑫ Zod가 0을 통과시킨다", () => {
  it("nonnegative()라 0이 살아남는다", () => {
    const parsed = reductionSchema.parse({
      type: "unsold_98_5",
      priceReductionRatePct985: 0,
    }) as Record<string, unknown>;
    expect(parsed.priceReductionRatePct985).toBe(0);
  });
});
