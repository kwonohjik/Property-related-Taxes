/**
 * anchor: §155㉓ 대상 유형 — 「법률 제17482호 민간임대주택에 관한 특별법 일부개정법률 부칙 제5조제1항이 적용되는 주택으로 한정」
 * (소득세법 시행령 §155㉓ 괄호 · 사용자 결정 2026-11-04 D-5, `docs/00-pm/rental-155-20-review-fixes.plan.md` PR-4 · C-15·C-16).
 *
 * 부칙 §5①은 종전 장기일반민간임대주택 중 **아파트 매입임대**와 단기민간임대주택만 — 이 둘만 자진말소(민특법 §6①11호)·
 * 자동말소(§6⑤) 대상이다. 장기일반으로 등록한 비아파트·건설임대의 말소로는 ㉓이 서지 않는다(종전 엔진은 목만 보고 통과시켰다).
 */
import { describe, it, expect } from "vitest";
import { checkEligibility, type EligibilityContext } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

/** 2016 등록 장기일반 매입 · 96개월 임대 · 2024-05-10 말소 — 양도 2025-01-10(말소 후 5년 안) */
const unit = (patch: Partial<RentalUnitInput>): RentalUnitInput => ({
  businessRegistrationDate: new Date("2016-03-01"),
  rentalRegistrationDate: new Date("2016-03-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: true,
  registrationCancellationDate: new Date("2024-05-10"),
  terminatedRegistrationType: "long_term_general",
  requirementsConfirmed: true,
  ...patch,
});

const ctx: EligibilityContext = {
  scenario: "A",
  transferDate: new Date("2025-01-10"),
  residenceAcquisitionDate: new Date("2015-01-10"),
  priorRentalExemptionHistory: "none",
};
const run = (u: RentalUnitInput) => checkEligibility([u], 5, 5, false, ctx);

describe("§155㉓ 부칙 §5① 대상 유형 (D-5)", () => {
  it("C-15 장기일반 비아파트 매입 말소 → ㉓ 불성립 + 부칙 사유", () => {
    const e = run(unit({}));
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.code)).toContain("RENTAL_TERMINATION_RESTRICTED");
    expect(e.failReasons.map((f) => f.message).join("\n")).toMatch(/부칙 제5조제1항이 적용되는 주택/);
  });

  it("C-15 장기일반 아파트 건설임대(다목) 말소 → 불성립", () => {
    const e = run(unit({ isApartment: true, rentalAcquisitionType: "construction", landAreaM2: 100, totalFloorAreaM2: 80 }));
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.message).join("\n")).toMatch(/부칙 제5조제1항/);
  });

  it("C-16 [짝] 장기일반 아파트 매입 말소 → ㉓ 성립", () => {
    expect(run(unit({ isApartment: true })).passed).toBe(true);
  });

  it("C-16 [짝] 단기민간임대 말소(비아파트) → ㉓ 성립", () => {
    expect(run(unit({ terminatedRegistrationType: "short_term" })).passed).toBe(true);
  });

  it("[짝] 말소가 아니면(등록 유지) 이 게이트와 무관 — 성립", () => {
    expect(run(unit({ rentalAutoTermination: false, registrationCancellationDate: undefined, terminatedRegistrationType: undefined })).passed).toBe(true);
  });
});
