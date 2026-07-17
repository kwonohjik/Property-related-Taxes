/**
 * H-26 anchor — §56⑤ 유상증자·감자 월할이 명시 사업연도 개시일을 사용 (1년미만 사업연도)
 *
 * 리뷰 2round H-26. calcCapitalIncreaseAdjustment가 사업연도 개시일을 "종료일−1년+1일"로
 * 역산 → 결산기 변경·신설법인 첫 사업연도(1년미만)에서 개시일 오류 → §56⑤ 후단 월할·범위판정 오산.
 *
 * 법령(상증령 §56⑤ 후단): "사업연도 개시일부터 유상증자한 날까지의 기간에 대하여 월할".
 *   개시일이 실제와 다르면 월할 개월수·해당 사업연도 판정 모두 틀린다.
 *
 * 시나리오: 결산기 변경으로 1년전 사업연도 = 2021.7.1.~2021.12.31.(6개월).
 *   유상증자 5,000원 × 10,000주 × 10% = 연 500만원.
 */
import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseAdjustment } from "@/lib/tax-engine/property-valuation/capital-increase-adjustment";
import type { UnlistedCapitalChange } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const END_DATES: [Date, Date, Date] = [
  new Date("2021-12-31"), // 1년전 (실제 개시 2021-07-01, 6개월)
  new Date("2020-12-31"),
  new Date("2019-12-31"),
];
const START_DATES: [Date, Date, Date] = [
  new Date("2021-07-01"), // 명시 개시일 — 1년미만
  new Date("2020-01-01"),
  new Date("2019-01-01"),
];

describe("H-26 §56⑤ 월할 — 1년미만 사업연도 명시 개시일", () => {
  it("증자가 사업연도 내(2021-10-01) → 명시 개시일 4/12 (역산은 10/12 과대)", () => {
    const change: UnlistedCapitalChange[] = [
      { changeType: "paid_in", changeDate: new Date("2021-10-01"), sharesIssued: 10_000, pricePerShare: 5_000 },
    ];
    // 명시 개시일 2021-07-01 → monthsBetween(7/1,10/1)=4 → 500만 × 4/12 = 1,666,666
    const withStart = calcCapitalIncreaseAdjustment(change, END_DATES, 0.1, START_DATES);
    expect(withStart[0]).toBe(1_666_666);
    // 역산(개시 2021-01-01) → monthsBetween=10 → 500만 × 10/12 = 4,166,666 (과대)
    const reverse = calcCapitalIncreaseAdjustment(change, END_DATES, 0.1);
    expect(reverse[0]).toBe(4_166_666);
  });

  it("증자가 명시 개시일 이전(2021-05-01) → 해당 사업연도 영향 0 (역산은 과대 산입)", () => {
    const change: UnlistedCapitalChange[] = [
      { changeType: "paid_in", changeDate: new Date("2021-05-01"), sharesIssued: 10_000, pricePerShare: 5_000 },
    ];
    // 명시 개시일 2021-07-01 → 증자 2021-05-01 < 개시일 → 본 사업연도 영향 없음
    const withStart = calcCapitalIncreaseAdjustment(change, END_DATES, 0.1, START_DATES);
    expect(withStart[0]).toBe(0);
    // 역산(개시 2021-01-01) → 2021-05-01이 범위 내 → 월할 산입(과대)
    const reverse = calcCapitalIncreaseAdjustment(change, END_DATES, 0.1);
    expect(reverse[0]).toBeGreaterThan(0);
  });

  it("회귀: 개시일 미제공(undefined) → 종전 역산 동작 유지", () => {
    const change: UnlistedCapitalChange[] = [
      { changeType: "paid_in", changeDate: new Date("2021-06-30"), sharesIssued: 50_000, pricePerShare: 5_000 },
    ];
    const noStart = calcCapitalIncreaseAdjustment(change, END_DATES, 0.1);
    // 2021 사업연도(역산 1.1.~12.31.) 6개월 월할 = 50,000×5,000×0.1×6/12 = 12,500,000 (PDF 사례1)
    expect(noStart[0]).toBe(12_500_000);
  });
});
