/**
 * anchor: §155⑳ 요건 축 — OH-14(전 호 장기임대주택) · OH-15(PHRP 등록 이후 거주) ·
 *         OH-39(㉓ 자진말소 1/2 = 민특법 임대의무기간) · OH-41(나·라목 ⑳2호)
 *
 * 리뷰 `docs/reviews/one-house-exemption-review-2026-09.md` 실패 시나리오를 그대로 옮겼다.
 *
 * 법령(KoreanLaw MCP 현행 MST 286211 + DRF 연혁본 실독 2026-09-26):
 * - §155⑳ 본문 「장기임대주택 … 과 그 밖의 1주택을 국내에 소유하고 있는 1세대」 — 조심 2023서7289
 * - §155⑳1호 괄호 「직전거주주택보유주택의 경우에는 법 제168조에 따른 사업자등록과 「민간임대주택에 관한
 *   특별법」 제5조에 따른 임대사업자 등록을 한 날 … 이후의 거주기간」 (MST 202148·207800·262425·286211 동일)
 * - §155㉓1호 「(같은 법 제43조에 따른 임대의무기간의 2분의 1 이상을 임대한 경우에 한정한다)」 +
 *   종전 민특법 §2 5호 장기일반 「8년 이상」·6호 단기 「4년 이상」(MST 211593)
 * - §155⑳2호 「양도일 현재 … 사업자등록을 하고, … 민간임대주택으로 등록하여 임대하고 있으며, 임대료등의
 *   증가율이 100분의 5를 초과하지 않을 것」 — 목 구분 없음
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

const unitOk: RentalUnitInput = {
  businessRegistrationDate: new Date("2016-06-01"),
  rentalRegistrationDate: new Date("2016-06-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};
/** 수도권 임대개시일 기준시가 7억 — 가목 상한 6억 초과(장기임대주택 아님) */
const unitCapExceeded: RentalUnitInput = { ...unitOk, standardPriceAtRentalStart: 700_000_000 };

// ─────────────────────────────────────────────────────────────────────────────
// OH-14 — 한 호라도 장기임대주택이 아니면 ⑳ 불성립
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-14 전 호가 장기임대주택이어야 한다", () => {
  it("OH14-1 [충족, 상한 초과] → 불성립", () => {
    const e = checkEligibility([unitOk, unitCapExceeded], 5, 5);
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => [f.unitIndex, f.code])).toEqual([[1, "STANDARD_PRICE_EXCEEDED"]]);
  });

  it("OH14-2 긍정 짝: [충족, 충족] → 성립", () => {
    expect(checkEligibility([unitOk, unitOk], 5, 5).passed).toBe(true);
  });

  it("OH14-3 ㉑ 구제는 유지: [충족, 기간만 미충족] → 성립 + ㉒ 대상 2호", () => {
    const e = checkEligibility([unitOk, { ...unitOk, rentalMonths: 12 }], 5, 5);
    expect(e.passed).toBe(true);
    expect(e.periodPendingUnitIndexes).toEqual([1]);
  });

  it("OH14-4 전엔진(리뷰 F3): 2024-06-01 · 8억/4억 · 주택 수 1 · [충족, 상한 초과] → 과세", () => {
    const r = calculateTransferTax(
      baseTransferInput({
        transferPrice: 800_000_000,
        acquisitionPrice: 400_000_000,
        acquisitionDate: new Date("2016-01-01"),
        transferDate: new Date("2024-06-01"),
        residencePeriodMonths: 60,
        rentalHousingException: {
          applyException: true,
          scenario: "A",
          rentalUnits: [unitOk, unitCapExceeded],
        },
      }),
      rates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.determinedTax).toBeGreaterThan(0);
    const step = r.steps.find((s) => s.label.includes("적용 불가"));
    expect(step?.formula).toContain("2호 임대개시일 기준시가 6억원 초과");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OH-15 — 직전거주주택보유주택(B)의 거주요건은 등록 이후 거주기간
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-15 PHRP 거주요건 = 사업자·임대사업자 등록 이후 거주기간", () => {
  const ctxB = (m?: number) => ({
    scenario: "B" as const,
    residenceAcquisitionDate: new Date("2009-08-12"),
    transferDate: new Date("2024-03-03"),
    postRegistrationResidenceMonths: m,
  });

  it("OH15-1 전체 48개월이어도 등록 이후 0개월 → 불충족", () => {
    const e = checkEligibility([unitOk], 14, 4, false, ctxB(0));
    expect(e.passed).toBe(false);
    expect(e.residenceFailReasons.join()).toContain("임대사업자 등록 이후");
  });

  it("OH15-2 경계: 등록 이후 23개월 → 불충족 / 24개월 → 충족", () => {
    expect(checkEligibility([unitOk], 14, 4, false, ctxB(23)).passed).toBe(false);
    expect(checkEligibility([unitOk], 14, 4, false, ctxB(24)).passed).toBe(true);
  });

  it("OH15-3 미입력 → 충족으로 보지 않는다(침묵 통과 금지)", () => {
    const e = checkEligibility([unitOk], 14, 4, false, ctxB(undefined));
    expect(e.passed).toBe(false);
    expect(e.residenceFailReasons.join()).toContain("입력하지 않아");
  });

  it("OH15-4 상생임대(§155의3①)면 §155⑳1호 거주기간 제한 면제 — 등록 이후 0개월이어도 충족", () => {
    expect(checkEligibility([unitOk], 14, 4, true, ctxB(0)).passed).toBe(true);
  });

  it("OH15-5 A 시나리오는 종전대로 전체 거주기간(짝)", () => {
    const e = checkEligibility([unitOk], 14, 4, false, { ...ctxB(0), scenario: "A" });
    expect(e.passed).toBe(true);
  });

  const inputB = (m: number): TransferTaxInput =>
    baseTransferInput({
      transferPrice: 800_000_000,
      acquisitionPrice: 480_000_000,
      acquisitionDate: new Date("2009-08-12"),
      transferDate: new Date("2024-03-03"),
      residencePeriodMonths: 48,
      rentalHousingException: {
        applyException: true,
        scenario: "B",
        rentalUnits: [unitOk],
        priorResidenceTransferDate: new Date("2016-08-25"),
        standardPriceAtAcquisition: 300_000_000,
        standardPriceAtPriorTransfer: 450_000_000,
        standardPriceAtTransfer: 500_000_000,
        postRegistrationResidenceMonths: m,
      },
    });

  it("OH15-6 전엔진(리뷰 F4): 거주 48개월 전부 등록 전 → 특례 미적용(과세 경로)", () => {
    const r = calculateTransferTax(inputB(0), rates);
    expect(r.rentalHousingExceptionDetail).toBeUndefined();
    expect(r.steps.find((s) => s.label.includes("적용 불가"))?.formula).toContain("임대사업자 등록 이후");
  });

  it("OH15-7 긍정 짝: 등록 이후 24개월 → RH-B1 적용", () => {
    const r = calculateTransferTax(inputB(24), rates);
    expect(r.rentalHousingExceptionDetail?.scenarioId).toBe("RH-B1");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OH-39 — ㉓1호 자진말소 1/2 = 민특법 임대의무기간(단기 4년·장기일반 8년)
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-39 ㉓ 자진말소 1/2 기준", () => {
  // 2018-06-01 등록 매입 비아파트 → 가목(소득세법 임대기간요건 5년)
  const terminated = (months: number, type?: RentalUnitInput["terminatedRegistrationType"]): RentalUnitInput => ({
    ...unitOk,
    businessRegistrationDate: new Date("2018-06-01"),
    rentalRegistrationDate: new Date("2018-06-01"),
    rentalMonths: months,
    rentalAutoTermination: true,
    terminatedRegistrationType: type,
  });

  it("OH39-1 단기(4년) 27개월 → 24개월 이상이라 ㉓ 충족(리뷰 F6 — 종전 30개월 기준으로 탈락)", () => {
    const e = checkEligibility([terminated(27, "short_term")], 5, 5);
    expect(e.perUnitVerdict?.[0].derivedArticle).toBe("가");
    expect(e.passed).toBe(true);
    expect(e.periodPendingUnitIndexes).toEqual([]); // ㉑이 아니라 ㉓으로 통과(㉒ 추징 대상 아님)
  });

  it("OH39-2 단기 경계: 24개월 충족 / 23개월 불충족", () => {
    expect(checkEligibility([terminated(24, "short_term")], 5, 5).passed).toBe(true);
    const e = checkEligibility([terminated(23, "short_term")], 5, 5);
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.code)).toEqual(["RENTAL_TERMINATION_RESTRICTED"]);
  });

  it("OH39-3 장기일반(8년) 36개월 → 48개월 미달이라 불충족(리뷰 역방향 — 종전 30개월 기준으로 통과)", () => {
    const e = checkEligibility([terminated(36, "long_term_general")], 5, 5);
    expect(e.passed).toBe(false);
    expect(e.failReasons[0].message).toContain("임대의무기간(8년)의 1/2(48개월)");
  });

  it("OH39-4 장기일반 경계: 48개월 충족 / 47개월 불충족", () => {
    expect(checkEligibility([terminated(48, "long_term_general")], 5, 5).passed).toBe(true);
    expect(checkEligibility([terminated(47, "long_term_general")], 5, 5).passed).toBe(false);
  });

  it("OH39-5 등록 유형 미입력 → ㉓ 판정하지 않음(간주 충족 없음)", () => {
    const e = checkEligibility([terminated(40)], 5, 5);
    expect(e.passed).toBe(false);
    expect(e.failReasons[0].message).toContain("등록 유형");
  });

  it("OH39-6 소득세법 임대기간요건(5년)을 이미 채운 말소 주택은 ㉓ 1/2 판정과 무관하게 통과(짝)", () => {
    expect(checkEligibility([terminated(60)], 5, 5).passed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// OH-41 — 나·라목에도 ⑳2호(양도일 현재 등록·임대 중·5% 이내) 요구
// ─────────────────────────────────────────────────────────────────────────────
describe("OH-41 나·라목 §155⑳2호", () => {
  const unitNa: RentalUnitInput = {
    ...unitOk,
    businessRegistrationDate: new Date("2003-01-01"),
    rentalRegistrationDate: new Date("2003-01-01"),
    rentalCategory: "existing_business",
    acquisitionOfficialPrice: 200_000_000,
    isNationalSizeHousing: true,
    hasMinimum2Units: true,
    rentalMonths: 120,
  };
  const unitLa: RentalUnitInput = {
    ...unitOk,
    businessRegistrationDate: new Date("2009-01-01"),
    rentalRegistrationDate: new Date("2009-01-01"),
    rentalCategory: "unsold_08_09",
    region: "non-metro",
    acquisitionOfficialPrice: 200_000_000,
    firstSaleContractDate: new Date("2009-01-01"),
    hasMinimum5UnitsInCity: true,
    landAreaM2: 100,
    totalFloorAreaM2: 80,
    rentalMonths: 120,
  };

  it("OH41-1 나목 · 자기확인 없음(등록 말소 등) → 불충족(리뷰 F7)", () => {
    const e = checkEligibility([{ ...unitNa, requirementsConfirmed: false }], 5, 5);
    expect(e.perUnitVerdict?.[0].derivedArticle).toBe("나");
    expect(e.passed).toBe(false);
    expect(e.failReasons.map((f) => f.code)).toEqual(["REQUIREMENTS_NOT_CONFIRMED"]);
  });

  it("OH41-2 나목 긍정 짝: 자기확인 → 충족", () => {
    expect(checkEligibility([unitNa], 5, 5).passed).toBe(true);
  });

  it("OH41-3 라목 · 자기확인 없음 → 불충족 / 자기확인 → 충족", () => {
    const e = checkEligibility([{ ...unitLa, requirementsConfirmed: false }], 5, 5);
    expect(e.perUnitVerdict?.[0].derivedArticle).toBe("라");
    expect(e.failReasons.map((f) => f.code)).toEqual(["REQUIREMENTS_NOT_CONFIRMED"]);
    expect(checkEligibility([unitLa], 5, 5).passed).toBe(true);
  });

  it("OH41-4 가목은 종전대로 한 번만 수집(중복 코드 없음)", () => {
    const e = checkEligibility([{ ...unitOk, requirementsConfirmed: false }], 5, 5);
    expect(e.failReasons.map((f) => f.code)).toEqual(["REQUIREMENTS_NOT_CONFIRMED"]);
  });
});
