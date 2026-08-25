/**
 * 세액감면대상금액(별지84호 부표 1 ⑲) — 조문별 `reducibleIncome` 동봉 anchor
 *
 * 계획: docs/00-pm/transfer-reduction-eligible-income-gap.plan.md
 *
 * ⑲는 「§90①(세액감면방식) 적용 시 양도자산의 감면소득금액」이고 **감면율은 별지 별도 칸**이다
 * (부표 1 작성방법 14번·16번). 따라서 ⑲에는 **감면율을 곱하기 전 대상 소득금액**을 싣는다.
 *
 * 종전에는 §77 계열·§69만 `candidates.push`에 `reducibleIncome`을 동봉해,
 * §97 계열·하이브리드 5년 내·구 방식이 적용되면 ⑲가 **0**으로 나왔다(신고서 값도 0).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { reductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";

/** 화면·신고서가 ⑲에 넣는 값과 동일한 경로로 계산한다(표시측 헬퍼 재사용 — dual-truth 회피). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eligible19(r: any): number {
  return reductionEligibleIncome(
    r.reductionTypeApplied,
    r.taxableGain - r.longTermHoldingDeduction,
    r.reducibleIncome ?? 0,
    r.replacementLandDetail?.eligibleTransferIncome,
  );
}

describe("⑲ 세액감면대상금액 — 하이브리드 5년 내 세액감면", () => {
  it("§99의2 100% 세액감면 — ⑲ = 양도소득금액 전액 (감면율은 별도 칸)", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2013-06-15"),
        transferDate: new Date("2017-06-01"), // 취득 후 3년 11개월 — 5년 내
        householdHousingCount: 2,
        reductions: [{
          type: "unsold_99_2" as const,
          houseType992: "new_or_unsold" as const,
          contractDate992: new Date("2013-06-01"),
          acquisitionPrice992: 550_000_000,
          exclusiveAreaSqm992: 84.5,
          meetsHouseTypeRequirement992: true,
          isNotRecontract992: true,
          hasConfirmationSeal992: true,
        }],
      }),
      makeMockRates(),
    );
    const income = r.taxableGain - r.longTermHoldingDeduction;
    expect(r.reductionTypeApplied).toBe("unsold_99_2");
    expect(r.reductionAmount).toBeGreaterThan(0);
    // 🔴 종전에는 undefined → ⑲ 0이었다
    expect(r.reducibleIncome).toBe(income);
    expect(eligible19(r)).toBe(income);
  });
});

describe("⑲ 세액감면대상금액 — §69 자경농지 (대조군 · 회귀 방지)", () => {
  it("감면대상 소득금액이 그대로 ⑲에 들어간다", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        propertyType: "land",
        transferPrice: 300_000_000,
        acquisitionPrice: 100_000_000,
        acquisitionDate: new Date("2005-04-07"),
        transferDate: new Date("2024-03-01"),
        reductions: [{ type: "self_farming" as const, farmingYears: 18 }],
      }),
      makeMockRates(),
    );
    expect(r.reductionTypeApplied).toBe("self_farming");
    expect(eligible19(r)).toBe(r.reducibleIncome);
    expect(eligible19(r)).toBeGreaterThan(0);
  });
});

describe("🔴 구별력 — 감면이 적용되지 않으면 ⑲는 0이다", () => {
  it("감면 미입력 — reducibleIncome undefined 유지", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2013-06-15"),
        transferDate: new Date("2017-06-01"),
        householdHousingCount: 2,
      }),
      makeMockRates(),
    );
    expect(r.reductionTypeApplied).toBeUndefined();
    expect(r.reducibleIncome).toBeUndefined();
    expect(eligible19(r)).toBe(0);
  });
});
