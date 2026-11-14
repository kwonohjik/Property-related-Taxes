/**
 * V-6 ⓐ — 「구 임대주택법」 건설임대는 소득세법 시행령 §167의3①2호 **다목** 요건으로 판정한다.
 *
 * 근거: 법률 제13499호 민간임대주택에 관한 특별법 전부개정법률 부칙 제3조①(MST 174472) — 다른 법령의 「민간건설임대주택」
 * 인용에 「종전의 「임대주택법」 제2조제2호의3 … 에 따라 등록한 민간건설임대주택」까지 포함한다. 다목: 대지 298㎡·연면적 149㎡ 이하
 * 건설임대주택을 2호 이상 임대 · 5년 이상 · 임대개시일 기준시가 6억원 이하(지역 무관). 다주택 중과 쪽은 이미 구법 건설을 다목
 * (C형)으로 본다(`rental-card-surcharge-rows.ts` `candidateRentalTypes`).
 *
 * 수정 전 실측(2026-11-15): 구법 건설이 매입 가목처럼 판정 — 비수도권 4억 불성립 · 대지 350㎡·1호·면적 미입력 성립.
 * 매입(구법)은 바꾸지 않는다(§167의3⑪ 가목2) 적용 여부는 V-6 ⓑ로 따로 확인).
 */
import { describe, expect, it } from "vitest";
import { checkEligibility, deriveRentalArticle } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

function unit(over: Partial<RentalUnitInput> = {}): RentalUnitInput {
  return {
    businessRegistrationDate: d("2010-10-01"),
    rentalRegistrationDate: d("2010-10-01"),
    rentalRegisteredDate: d("2010-10-01"),
    rentalCategory: "pre_2018",
    rentalAcquisitionType: "construction",
    isApartment: false,
    region: "non-metro",
    standardPriceAtRentalStart: 250_000_000,
    hasMinimum2Units: true,
    landAreaM2: 200,
    totalFloorAreaM2: 100,
    rentalMonths: 72,
    rentalAutoTermination: false,
    requirementsConfirmed: true,
    isExcluded918Rule: false,
    ...over,
  } as RentalUnitInput;
}

const run = (u: RentalUnitInput) =>
  checkEligibility([u], 10, 5, false, {
    scenario: "A",
    transferDate: d("2024-06-01"),
    residenceAcquisitionDate: d("2009-01-01"),
  } as Parameters<typeof checkEligibility>[4]);

const codes = (u: RentalUnitInput) => run(u).failReasons.map((f) => f.code);

describe("V-6 ⓐ 구 임대주택법 건설임대 = 다목", () => {
  it("K-0 도출 목 — 건설 다목 · 매입은 구법 그대로", () => {
    expect(deriveRentalArticle("pre_2018", "construction", d("2010-10-01"))).toBe("다");
    expect(deriveRentalArticle("pre_2018", "purchase", d("2010-10-01"))).toBe("구법");
  });
  it("K-1 기본(비수도권 2.5억·200/100㎡·2호·6년) → 성립", () => {
    expect(run(unit()).passed).toBe(true);
  });
  it("K-2 비수도권 4억 → 성립(다목 6억 지역 무관)", () => {
    expect(run(unit({ standardPriceAtRentalStart: 400_000_000 })).passed).toBe(true);
  });
  it("K-3 대지 350㎡ → 규모요건 초과 불성립", () => {
    expect(codes(unit({ landAreaM2: 350 }))).toContain("SIZE_EXCEEDED");
  });
  it("K-4 1호 → 2호 요건 미충족 불성립", () => {
    expect(codes(unit({ hasMinimum2Units: false }))).toContain("MIN_UNITS_NOT_MET");
  });
  it("K-5 면적 미입력 → 불성립(모름=불리)", () => {
    expect(run(unit({ landAreaM2: undefined, totalFloorAreaM2: undefined })).passed).toBe(false);
  });
  it("K-6 수도권 6억 1원 초과 → 불성립", () => {
    expect(codes(unit({ region: "seoul-metro", standardPriceAtRentalStart: 600_000_001 }))).toContain("STANDARD_PRICE_EXCEEDED");
  });
  it("K-7 매입(구법)은 불변 — 비수도권 4억 불성립(3억 상한)", () => {
    expect(codes(unit({ rentalAcquisitionType: "purchase", standardPriceAtRentalStart: 400_000_000 }))).toContain("STANDARD_PRICE_EXCEEDED");
  });
});
