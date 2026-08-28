/**
 * 장기보유특별공제 보유/거주 기간분 분리 — 거주분 직접 산정 anchor.
 *
 * 세법(소득세법 §95② 표2): 장특공제 = 보유기간분 + 거주기간분, 각각 자기 공제율로 산정.
 * 수정 전 버그: 거주기간분 = 총 장특공제 − 보유기간분 (잔액 방식) → 세법 로직 위배.
 * 수정 후: 거주기간분 = floor(총 장특공제 × 거주율 ÷ 총율) 직접 산정, ≤1원 floor 잔액은 보유분 흡수.
 */
import { describe, it, expect } from "vitest";
import { splitLtDeduction } from "@/components/calc/results/transfer/FilingFormTableHelpers";

describe("splitLtDeduction — 거주기간분 직접 산정 (§95② 표2)", () => {
  it("표2: 거주분 = 총 × 거주율/총율 직접 (잔액 방식 아님)", () => {
    // 보유 10년(40%) + 거주 5년(20%) = 총율 60%. total에 1원 나머지 발생 케이스.
    const total = 100_000_001;
    const { holdingAmount, residenceAmount } = splitLtDeduction(total, 120, 60, true);

    // 거주분 = floor(total × 0.20/0.60) — 직접 산정
    expect(residenceAmount).toBe(Math.floor((total * 0.2) / 0.6)); // 33,333,333
    // 보유분 = 총 − 거주분 (≤1원 잔액 흡수)
    expect(holdingAmount).toBe(total - residenceAmount);
    // 불변식: 합 = 총 장특공제 (세액 무관·표시 정합)
    expect(holdingAmount + residenceAmount).toBe(total);

    // 회귀 방지: 옛 잔액 방식(거주 = 총 − floor(총×보유율/총율))과 달라야 한다.
    const oldResidual = total - Math.floor((total * 0.4) / 0.6); // 33,333,334
    expect(residenceAmount).not.toBe(oldResidual);
  });

  it("표1(거주 미충족) — 거주분 0, 보유분 전액", () => {
    const total = 209_817_023;
    expect(splitLtDeduction(total, 120, 0, true)).toEqual({
      holdingAmount: total,
      residenceAmount: 0,
    });
  });

  it("나누어떨어지는 케이스 — 보유·거주 모두 직접, 합 = 총", () => {
    // 보유 10년(40%) + 거주 10년(40%) = 총율 80%. total 배수.
    const total = 200_000_000;
    const { holdingAmount, residenceAmount } = splitLtDeduction(total, 120, 120, true);
    expect(residenceAmount).toBe(Math.floor((total * 0.4) / 0.8)); // 100,000,000
    expect(holdingAmount).toBe(100_000_000);
    expect(holdingAmount + residenceAmount).toBe(total);
  });
});
