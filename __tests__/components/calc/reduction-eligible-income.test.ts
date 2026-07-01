import { describe, it, expect } from "vitest";
import { reductionEligibleIncome } from "@/components/calc/results/transfer/reduction-eligible-income";

/**
 * 별지84호 부표2 ⑲ 세액감면대상금액 = 감면대상 양도소득금액 (소득세법 §90①, 감면율 前).
 * §77 계열의 reducibleIncome은 감면율(15/20/40/25%)을 곱한 값이므로 ⑲에 직접 쓰면 안 됨.
 */
describe("reductionEligibleIncome (부표2 ⑲ 세액감면대상금액)", () => {
  const fullIncome = 290_841_229; // 양도소득금액
  const reducible = 53_425_403; // 감면율 곱한 값 (§77)

  it("§77 공익수용 → 양도소득금액 전액 (reducibleIncome 아님)", () => {
    expect(reductionEligibleIncome("public_expropriation", fullIncome, reducible, undefined)).toBe(
      fullIncome,
    );
  });

  it("§77의3 개발제한 → 양도소득금액 전액", () => {
    expect(reductionEligibleIncome("gb_designated_land", fullIncome, reducible, undefined)).toBe(
      fullIncome,
    );
  });

  it("§77의2 대토보상 → echo(eligibleTransferIncome) 대토보상분", () => {
    expect(
      reductionEligibleIncome("replacement_land_comp", fullIncome, reducible, 203_484_404),
    ).toBe(203_484_404);
  });

  it("§77의2 echo 없으면 reducibleIncome fallback", () => {
    expect(reductionEligibleIncome("replacement_land_comp", fullIncome, reducible, undefined)).toBe(
      reducible,
    );
  });

  it("자경 §69 등 그 외 → reducibleIncome(감면대상 소득) 그대로", () => {
    expect(reductionEligibleIncome("self_farming", fullIncome, reducible, undefined)).toBe(reducible);
    expect(reductionEligibleIncome(undefined, fullIncome, reducible, undefined)).toBe(reducible);
  });
});
