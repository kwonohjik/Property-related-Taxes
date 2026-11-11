/**
 * anchor — §155⑳ 목 도출은 지자체 등록 신청일만 본다 (기획재정부 재산세제과-1413, 2023.12.22.)
 *
 * 회신: 2020.7.10. 이전에 오피스텔 분양권 상태로 임대등록하고 2020.7.11. 이후 완공·잔금청산해 주택으로 사용한 경우
 * 거주주택 양도 시 소득세법 시행령 §155⑳ 적용(제2안). 임대 호 입력에는 취득일·완공일 칸이 없고 판정이 신청일로만 목을 가른다.
 * 단기→장기 변경신고 제외는 소득세법 시행령 §167의3①2호 마목 3)·바목 단서에만 있고 가목에는 없다.
 *
 * | # | 주장 |
 * |---|---|
 * | R-1 | 신청일 2020-07-05 → 가목·5년 · 통과 |
 * | R-2 | 경계 — 2020-07-10 가목 / 2020-07-11 마목(8년) |
 * | R-3 | 변경신고 선언 + 원 신청일 2018-05-01(가목) → 제외 없음(가목에는 변경신고 제외가 없다) |
 * | R-4 | 변경신고 선언 + 신청일 2020-07-15(마목) → SHORT_TO_LONG_CHANGE 사유로 불통과 |
 */
import { describe, it, expect } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const unit = (regDate: string, o: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
  businessRegistrationDate: new Date(regDate),
  rentalRegistrationDate: new Date(regDate),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "non-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 200_000_000,
  hasMinimum2Units: false,
  rentalMonths: 120,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
  ...o,
});

describe("재산세제과-1413 — 목 도출은 신청일만 (R)", () => {
  it("R-1 2020-07-05 신청 → 가목 · 의무 5년 · 통과", () => {
    const r = checkEligibility([unit("2020-07-05", { rentalMonths: 72 })], 5, 5);
    expect(r.passed).toBe(true);
    expect(r.perUnitVerdict?.[0]).toMatchObject({ derivedArticle: "가", requiredYears: 5 });
  });

  it("R-2 경계 — 2020-07-10 가목 · 2020-07-11 마목(8년)", () => {
    const before = checkEligibility([unit("2020-07-10")], 5, 5);
    const after = checkEligibility([unit("2020-07-11")], 5, 5);
    expect(before.perUnitVerdict?.[0]).toMatchObject({ derivedArticle: "가", requiredYears: 5 });
    expect(after.perUnitVerdict?.[0]).toMatchObject({ derivedArticle: "마", requiredYears: 8 });
  });

  it("R-3 원 신청일 2018-05-01(가목) + 변경신고 선언 → 가목에는 제외가 없다", () => {
    const r = checkEligibility([unit("2018-05-01", { isExcludedShortToLongChange: true })], 5, 5);
    expect(r.perUnitVerdict?.[0].derivedArticle).toBe("가");
    expect(r.passed).toBe(true);
  });

  it("R-4 신청일 2020-07-15(마목) + 변경신고 선언 → 불통과 · 사유 문장에 「2020.7.11. 이후」", () => {
    const r = checkEligibility([unit("2020-07-15", { isExcludedShortToLongChange: true })], 5, 5);
    expect(r.perUnitVerdict?.[0].derivedArticle).toBe("마");
    expect(r.passed).toBe(false);
    const reason = r.failReasons.find((f) => f.code === "SHORT_TO_LONG_CHANGE");
    expect(reason?.message).toMatch(/2020\.7\.11\. 이후 장기일반으로 변경신고한 주택/);
  });

  it("R-4 대조 — 같은 입력에서 선언을 끄면 통과", () => {
    const r = checkEligibility([unit("2020-07-15", { isExcludedShortToLongChange: false })], 5, 5);
    expect(r.passed).toBe(true);
  });
});
