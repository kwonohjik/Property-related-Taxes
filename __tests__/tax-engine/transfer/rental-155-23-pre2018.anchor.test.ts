/**
 * V-6 — 「구 임대주택법」 등록분(엔진 `구법`)도 §155㉓ 말소 특례 대상이다.
 *
 * 근거:
 * - 법률 제13499호 민간임대주택에 관한 특별법 전부개정법률 부칙 제3조①(MST 174472): 「…민간건설임대주택 및 민간매입임대주택,
 *   준공공임대주택을 다른 법령에서 인용하는 경우 종전의 「임대주택법」 제2조제2호의3, 제3호 및 제3호의3에 따라 등록한
 *   민간건설임대주택 및 민간매입임대주택, 준공공임대주택까지 포함한다.」 → 소령 §167의3①2호 가목·다목에 들어간다.
 * - 사전-2025-법규재산-0972[법규과-2992](2025.12.23.): 「(구)「임대주택법」 제16조제1항제4호에 따른 민간건설임대주택 또는
 *   매입임대주택(준공공임대주택은 제외)이 … 2020.08.18. 전 임대의무기간이 경과된 경우 같은 법 시행일에 임대주택의 등록이
 *   말소된 것으로 보는 것으로 등록 말소일 이후 5년 이내 거주주택을 양도하는 경우에 한정하여 「소득세법 시행령」 제155조제20항을
 *   적용하는 것」.
 *
 * 수정 전 실측: 구법 + 자동말소 → 말소를 무시하고 기한과 무관하게 passed=true(창 없음).
 */
import { describe, expect, it } from "vitest";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import { isTerminationEligibleArticle } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/termination-window";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

const d = (s: string) => new Date(s);

/** 0972 사실관계 — 2010.10. 구 임대주택법 매입임대(아파트·5년) 등록 */
function unit(over: Partial<RentalUnitInput> & { cancelled: string }): RentalUnitInput {
  const { cancelled, ...rest } = over;
  return {
    businessRegistrationDate: d("2010-10-01"),
    rentalRegistrationDate: d("2010-10-01"),
    rentalRegisteredDate: d("2010-10-01"),
    rentalCategory: "pre_2018",
    rentalAcquisitionType: "purchase",
    isApartment: true,
    region: "seoul-metro",
    standardPriceAtRentalStart: 300_000_000,
    hasMinimum2Units: false,
    rentalMonths: 60,
    halfDutyRentalMonths: 60,
    rentalAutoTermination: true,
    terminatedRegistrationType: "short_term",
    terminationReason: "auto",
    registrationCancellationDate: d(cancelled),
    requirementsConfirmed: true,
    isExcluded918Rule: false,
    ...rest,
  } as RentalUnitInput;
}

const run = (units: RentalUnitInput[], transferDate: string) =>
  checkEligibility(units, 10, 5, false, {
    scenario: "A",
    transferDate: d(transferDate),
    residenceAcquisitionDate: d("2009-01-01"),
  } as Parameters<typeof checkEligibility>[4]);

describe("V-6 구 임대주택법 등록분 × §155㉓", () => {
  it("P-0 ㉓ 대상 목 술어에 구법이 들어간다", () => {
    expect(isTerminationEligibleArticle("구법")).toBe(true);
  });

  it("P-1 0972 — 의무기간 2015-10-01 종료 · 2025-11-01 양도 → 2020.8.18. 말소 간주, 5년 기한 경과로 불성립", () => {
    const r = run([unit({ cancelled: "2015-10-01" })], "2025-11-01");
    expect(r.passed).toBe(false);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
    expect(r.cancellationWindow?.deadline).toBe("2025-08-18");
  });

  it("P-2 같은 호 · 2025-06-01 양도 → 기한 안 성립 · 부칙 제7조 간주 고지", () => {
    const r = run([unit({ cancelled: "2015-10-01" })], "2025-06-01");
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
    expect(r.notices?.some((n) => n.includes("부칙 제7조"))).toBe(true);
  });

  it("P-3 0972 건설임대도 포함 — 구법 × 건설 · 같은 날짜 → 2020.8.18. 간주 창", () => {
    const r = run([unit({ cancelled: "2015-10-01", rentalAcquisitionType: "construction", hasMinimum2Units: true })], "2025-06-01");
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2020-08-18");
    expect(r.passed).toBe(true);
  });

  it("P-4 자진말소 2022-01-10 · 2024-06-01 양도 → 말소일 기준 창(2027-01-10 일요일 → 기한 2027-01-11)", () => {
    const r = run([unit({ cancelled: "2022-01-10", terminationReason: "voluntary" })], "2024-06-01");
    expect(r.cancellationWindow?.firstCancellationDate).toBe("2022-01-10");
    expect(r.cancellationWindow?.deadline).toBe("2027-01-11");
    expect(r.notices?.some((n) => n.includes("구 임대주택법") && n.includes("확인 필요"))).toBe(true);
  });

  it("P-5 말소 OFF 구법(등록·임대 중)은 불변 — 성립 · 창 없음", () => {
    const r = run([unit({ cancelled: "2015-10-01", rentalAutoTermination: false, registrationCancellationDate: undefined, terminationReason: undefined, terminatedRegistrationType: undefined })], "2025-11-01");
    expect(r.passed).toBe(true);
    expect(r.cancellationWindow ?? null).toBeNull();
  });
});
