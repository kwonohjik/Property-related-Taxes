/**
 * 재실측 #16 — CAP-2(비율 100% 상한)는 「등급조정기간 동일」일 때만 (「소득세법 시행규칙」 §80⑥).
 *
 * 법문: 「1990년 8월 30일 직전에 결정된 시가표준액과 취득일 직전에 결정된 시가표준액이 동일한 경우로서
 * … 그 비율이 100분의 100을 초과하는 경우에는 그 초과하는 부분은 이를 없는 것으로 한다」.
 * 집행기준 97-176의2 참고 4는 이것을 **같은 결정(등급조정기간 동일)** 으로 읽는다 — '87.8.1. 취득 100,000과
 * '90.1.1. 100,000은 금액이 같아도 「등급조정기간이 다름」이라 그대로 적용한다(Case ⑤).
 *
 * 종전 엔진은 「취득일 ≥ 1990-01-01」 하나로 판정해, 1990년에 취득한 뒤 8.29.까지 **하향 수시조정**이 있으면
 * (취득시 등급 ≠ 90.8.30. 현재 등급 = 등급조정기간 다름) 상한을 걸어 취득시 기준시가를 낮췄다.
 * 직전 등급은 같은 조 ⑦ 단서로 「최종 수시조정일의 전일」 등급 = 취득시 등급이다.
 */
import { describe, it, expect } from "vitest";
import { calculatePre1990LandValuation } from "@/lib/tax-engine/pre-1990-land-valuation";

const base = { transferDate: new Date("2023-01-01"), areaSqm: 100, pricePerSqm_1990: 10_000 };

describe("#16 CAP-2 — 등급조정기간 동일 여부", () => {
  it("1990.3. 취득(100,000) → 1990.6. 하향 수시조정(80,000) → 기간이 달라 비율 125% 그대로(종전 100% 상한)", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1990-03-01"),
      grade_1990_0830: { gradeValue: 80_000 },
      gradePrev_1990_0830: { gradeValue: 100_000 }, // 소칙 §80⑦ 단서 — 최종 수시조정일 전일
      gradeAtAcquisition: { gradeValue: 100_000 },
    });
    expect(r.breakdown.denominatorCap1Applied).toBe(true); // 분모 = min(90,000, 80,000)
    expect(r.breakdown.rawRatio).toBe(1.25);
    expect(r.breakdown.ratioCap2Triggered).toBe(false);
    expect(r.caseType).toBe("case5_ratio_no_cap");
    expect(r.pricePerSqmAtAcquisition).toBe(12_500); // 종전 10,000
    expect(r.standardPriceAtAcquisition).toBe(1_250_000); // 종전 1,000,000
  });

  it("긍정 짝 — 1990.2. 취득, 그 뒤 조정 없음(취득시 = 현재 100,000) → 상한 적용(집행기준 Case ④)", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1990-02-01"),
      grade_1990_0830: { gradeValue: 100_000 },
      gradePrev_1990_0830: { gradeValue: 90_000 },
      gradeAtAcquisition: { gradeValue: 100_000 },
    });
    expect(r.breakdown.ratioCap2Triggered).toBe(true);
    expect(r.caseType).toBe("case4_ratio_cap");
    expect(r.pricePerSqmAtAcquisition).toBe(10_000);
  });

  it("1990 취득 뒤 상향 수시조정 → 미트리거(비율 100% 미만이라 값은 종전과 같다)", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1990-03-01"),
      grade_1990_0830: { gradeValue: 120_000 },
      gradePrev_1990_0830: { gradeValue: 100_000 },
      gradeAtAcquisition: { gradeValue: 100_000 },
    });
    expect(r.breakdown.ratioCap2Triggered).toBe(false);
    expect(r.pricePerSqmAtAcquisition).toBe(9_090); // 10,000 × 100,000 / 110,000
  });

  it("1990.1.1. 전 취득은 금액이 같아도 기간이 다르다(집행기준 Case ⑤ — 종전과 같음)", () => {
    const r = calculatePre1990LandValuation({
      ...base,
      acquisitionDate: new Date("1987-08-01"),
      grade_1990_0830: { gradeValue: 100_000 },
      gradePrev_1990_0830: { gradeValue: 90_000 },
      gradeAtAcquisition: { gradeValue: 100_000 },
    });
    expect(r.breakdown.ratioCap2Triggered).toBe(false);
    expect(r.pricePerSqmAtAcquisition).toBe(10_526);
  });
});
