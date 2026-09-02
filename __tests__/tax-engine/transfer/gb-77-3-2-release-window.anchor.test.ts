// CA-05 anchor — 조특법 §77의3② 단서는 «양방향 창»이다
//
// 조문 실측: 「② 개발제한구역에서 해제된 해당 토지등을 … 협의매수 또는 수용을 통하여
//   2028년 12월 31일까지 양도함으로써 발생하는 소득에 대해서는 다음 각 호에 따른 세액을
//   감면한다. **다만, 개발제한구역 해제일부터 1년**(개발제한구역 해제 이전에 「경제자유구역의
//   지정 및 운영에 관한 법률」에 따른 경제자유구역의 지정 등 대통령령으로 정하는 지역으로
//   지정이 된 경우에는 **5년**) **이내에** … 사업인정고시가 된 경우에 **한정한다**.」
//
// ⇒ `해제일 ≤ 사업인정고시일 ≤ 해제일 + N년`
//
// 종전 코드는 뒤쪽 경계(`releasedDate < subYears(triggerDate, N)`)만 봤다. 앞쪽 경계가 없어
// **고시가 해제보다 앞선** 입력이 그대로 통과했다 — 실측: 해제 2026-06-01 · 고시 2025-01-01 ·
// 지정 2005-06-01 · 취득 2003-03-27 · 거주 충족 · 양도 2026-09-01 · 산출세액 1억
// → 종전 `isEligible:true / 40% / ②1호 / 40,000,000원`, 조문상 정답은 0원.
//
// 조특령 §74②는 5년 창이 열리는 **지역 목록만** 정할 뿐 창의 기산점·방향을 바꾸지 않는다.
import { describe, it, expect } from "vitest";
import {
  calculateGbDesignatedLandReduction,
  type GbDesignatedLandInput,
} from "@/lib/tax-engine/gb-designated-land-reduction";

function base(over: Partial<GbDesignatedLandInput> = {}): GbDesignatedLandInput {
  return {
    branch: "released",
    acquisitionDate: new Date("2003-03-27"),
    designationDate: new Date("2005-06-01"),
    triggerDate: new Date("2025-01-01"), // 사업인정고시일
    releasedDate: new Date("2024-06-01"),
    residedFromAcqToTrigger: true,
    transferDate: new Date("2026-09-01"),
    calculatedTax: 100_000_000,
    transferIncome: 500_000_000,
    basicDeduction: 2_500_000,
    taxBase: 497_500_000,
    ...over,
  };
}

describe("CA-05 §77의3② 단서 — 해제일 ≤ 고시일 ≤ 해제일 + N년", () => {
  it("CA-05-1: 고시가 해제보다 «앞선» 경우 → 불적격 (종전 결함)", () => {
    const r = calculateGbDesignatedLandReduction(
      base({ releasedDate: new Date("2026-06-01"), triggerDate: new Date("2025-01-01") }),
    );
    expect(r.isEligible).toBe(false);
    expect(r.reductionAmount).toBe(0);
    expect(r.notEligibleReason).toContain("해제일보다 앞섭니다");
  });

  it("CA-05-2 경계: 고시 = 해제일 당일 → 적격 (「해제일부터 … 이내」)", () => {
    const d = new Date("2025-01-01");
    const r = calculateGbDesignatedLandReduction(base({ releasedDate: d, triggerDate: d }));
    expect(r.isEligible).toBe(true);
    expect(r.reductionRate).toBe(0.4);
  });

  it("CA-05-3 경계: 고시 = 해제일 하루 «전» → 불적격", () => {
    const r = calculateGbDesignatedLandReduction(
      base({ releasedDate: new Date("2025-01-02"), triggerDate: new Date("2025-01-01") }),
    );
    expect(r.isEligible).toBe(false);
  });

  it("CA-05-4 경계: 해제 + 1년 당일 고시 → 적격 / 하루 초과 → 불적격", () => {
    const ok = calculateGbDesignatedLandReduction(
      base({ releasedDate: new Date("2024-01-01"), triggerDate: new Date("2025-01-01") }),
    );
    expect(ok.isEligible).toBe(true);
    const ng = calculateGbDesignatedLandReduction(
      base({ releasedDate: new Date("2023-12-31"), triggerDate: new Date("2025-01-01") }),
    );
    expect(ng.isEligible).toBe(false);
    expect(ng.notEligibleReason).toContain("1년 이내");
  });

  it("CA-05-5: 경제자유구역 등 지정 시 5년 창 — 앞쪽 경계는 그대로다", () => {
    // 뒤쪽 경계는 5년으로 넓어진다
    expect(
      calculateGbDesignatedLandReduction(
        base({
          freeEconZone: true,
          releasedDate: new Date("2020-06-01"),
          triggerDate: new Date("2025-01-01"),
        }),
      ).isEligible,
    ).toBe(true);
    // 그러나 고시가 해제보다 앞서면 5년 창이어도 불적격
    expect(
      calculateGbDesignatedLandReduction(
        base({
          freeEconZone: true,
          releasedDate: new Date("2026-06-01"),
          triggerDate: new Date("2025-01-01"),
        }),
      ).isEligible,
    ).toBe(false);
  });

  it("CA-05-6: ①구역 내(in_zone) 분기는 이 창의 영향을 받지 않는다", () => {
    const r = calculateGbDesignatedLandReduction(
      base({ branch: "in_zone", releasedDate: undefined }),
    );
    expect(r.isEligible).toBe(true);
  });
});
