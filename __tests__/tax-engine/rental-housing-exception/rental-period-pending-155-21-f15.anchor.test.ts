/**
 * F-15 — 소득세법 시행령 §155㉑: 장기임대주택의 임대기간요건을 **충족하기 전에** 거주주택을 양도해도
 * 해당 임대주택을 장기임대주택으로 보아 §155⑳을 적용한다. 요건을 끝내 못 채우면 ㉒가 사후 추징한다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-15 · §23.
 *
 * 수정 전 실측(mock 세율 · 마목 수도권 · 의무 10년 · 거주주택 2025-03-03 양도):
 *
 * | 입력 | 임대 36개월 | 임대 120개월 |
 * |---|---|---|
 * | 거주주택 8억 (RH-A1) | **50,589,000** (과세) | 0 (비과세) |
 * | 거주주택 15억 (RH-A2) | 19,321,498 · 특례 미적용 | 19,321,498 · 특례 적용 |
 *
 * 면제되는 것은 **기간 요건뿐**이다 — 기준시가 상한 등 다른 요건, 말소(㉓ 불충족)는 그대로 막는다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { checkEligibility } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";

const rates = makeMockRates();

/** 마목(2020.8.18 이후 등록 매입 장기) — 의무임대기간 10년 */
const unit = (over: Partial<RentalUnitInput> = {}): RentalUnitInput => ({
  businessRegistrationDate: new Date("2021-06-01"),
  rentalRegistrationDate: new Date("2021-06-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 300_000_000,
  hasMinimum2Units: false,
  rentalMonths: 36,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
  ...over,
});

const input = (
  u: RentalUnitInput,
  S = 800_000_000,
  scenario: "A" | "B" = "A",
): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: S,
    transferDate: new Date("2025-03-03"),
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2015-08-12"),
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    rentalHousingException:
      scenario === "A"
        ? { applyException: true, scenario, rentalUnits: [u] }
        : {
            applyException: true,
            scenario,
            rentalUnits: [u],
            priorResidenceTransferDate: new Date("2020-08-25"),
            standardPriceAtAcquisition: 300_000_000,
            standardPriceAtPriorTransfer: 450_000_000,
            standardPriceAtTransfer: 500_000_000,
          },
  });

const clawback = (w?: string[]) => (w ?? []).filter((x) => x.includes("§155㉒"));

describe("F-15 ㉑ — 임대기간요건 충족 전 양도", () => {
  it("F15-1 거주주택 8억 · 임대 36개월 → 비과세 0 (종전 50,589,000)", () => {
    const r = calculateTransferTax(input(unit()), rates);
    expect(r.totalTax).toBe(0);
    expect(r.isExempt).toBe(true);
  });

  it("F15-2 거주주택 15억 · 임대 36개월 → 특례(RH-A2) 적용 · 세액이 기간 충족 때와 같다", () => {
    const pending = calculateTransferTax(input(unit(), 1_500_000_000), rates);
    const met = calculateTransferTax(input(unit({ rentalMonths: 120 }), 1_500_000_000), rates);
    expect(pending.rentalHousingExceptionDetail?.applied).toBe(true);
    expect(pending.rentalHousingExceptionDetail?.scenarioId).toBe("RH-A2");
    expect(pending.totalTax).toBe(met.totalTax);
    expect(met.totalTax).toBeGreaterThan(0); // 구별력 가드 — 0 = 0 동치가 아니다
  });

  it("F15-3 시나리오 B(직전거주주택보유주택)도 ㉑을 적용 — 기간 충족 때와 같은 §161 안분", () => {
    const pending = calculateTransferTax(input(unit(), 800_000_000, "B"), rates);
    const met = calculateTransferTax(input(unit({ rentalMonths: 120 }), 800_000_000, "B"), rates);
    expect(pending.rentalHousingExceptionDetail?.scenarioId).toBe("RH-B1");
    expect(pending.rentalHousingExceptionDetail?.taxableGain).toBe(
      met.rentalHousingExceptionDetail?.taxableGain,
    );
    expect(pending.totalTax).toBe(met.totalTax);
  });

  it("F15-4 판정기 — 실패 사유 없이 통과하고 ㉑ 적용 호를 남긴다", () => {
    const r = checkEligibility([unit({ rentalMonths: 12 })], 5, 5);
    expect(r.passed).toBe(true);
    expect(r.failReasons).toEqual([]);
    expect(r.periodPendingUnitIndexes).toEqual([0]);
    expect(checkEligibility([unit({ rentalMonths: 120 })], 5, 5).periodPendingUnitIndexes).toEqual([]);
  });
});

describe("F-15 ㉒ — 사후 추징 안내", () => {
  it("F15-5 ㉑이 쓰이면 두 경로(전액 비과세 조기반환 · 특례 A2) 모두 ㉒ 안내", () => {
    expect(clawback(calculateTransferTax(input(unit()), rates).warnings)).toHaveLength(1);
    expect(
      clawback(calculateTransferTax(input(unit(), 1_500_000_000), rates).warnings),
    ).toHaveLength(1);
    expect(
      clawback(calculateTransferTax(input(unit(), 800_000_000, "B"), rates).warnings),
    ).toHaveLength(1);
  });

  it("F15-6 (긍정 짝) 기간을 채웠거나 ㉓ 말소 특례로 간주 충족이면 안내 없음", () => {
    expect(clawback(calculateTransferTax(input(unit({ rentalMonths: 120 })), rates).warnings)).toEqual([]);
    expect(
      clawback(calculateTransferTax(input(unit({ rentalMonths: 120 }), 1_500_000_000), rates).warnings),
    ).toEqual([]);
    const terminated = unit({ rentalMonths: 72, rentalAutoTermination: true });
    expect(checkEligibility([terminated], 5, 5).periodPendingUnitIndexes).toEqual([]);
    expect(clawback(calculateTransferTax(input(terminated), rates).warnings)).toEqual([]);
  });
});

describe("F-15 복수 임대주택 — ㉒ 대상 호만 남긴다", () => {
  it("F15-10 기간 미충족 호만 기록(호 번호는 1부터) · 다른 요건도 못 채운 호는 기록하지 않는다", () => {
    const ok = unit({ rentalMonths: 120 });
    expect(checkEligibility([ok, unit()], 5, 5).periodPendingUnitIndexes).toEqual([1]);
    const w = clawback(calculateTransferTax(input(ok), rates).warnings);
    expect(w).toEqual([]);
    const both = baseTransferInput({
      ...input(ok),
      rentalHousingException: { applyException: true, scenario: "A", rentalUnits: [ok, unit()] },
    });
    expect(clawback(calculateTransferTax(both, rates).warnings)[0]).toContain("장기임대주택 2호가");
    const capFail = unit({ standardPriceAtRentalStart: 700_000_000 });
    expect(checkEligibility([ok, capFail], 5, 5).periodPendingUnitIndexes).toEqual([]);
  });
});

describe("F-15 대조 — 면제되는 것은 기간 요건뿐", () => {
  const TAXED = 50_589_000;

  it("F15-7 기준시가 상한 초과(수도권 6억)는 기간 미충족과 겹쳐도 과세", () => {
    const r = calculateTransferTax(input(unit({ standardPriceAtRentalStart: 700_000_000 })), rates);
    expect(r.totalTax).toBe(TAXED);
    const e = checkEligibility([unit({ standardPriceAtRentalStart: 700_000_000 })], 5, 5);
    expect(e.failReasons.map((f) => f.code)).toEqual(["STANDARD_PRICE_EXCEEDED"]);
  });

  it("F15-8 말소됐는데 ㉓(자진말소 1/2)을 못 채웠으면 과세 — 양도일 현재 임대 중이 아니다(⑳2호)", () => {
    const u = unit({ rentalMonths: 36, rentalAutoTermination: true }); // 10년 × 1/2 = 60개월 미만
    expect(calculateTransferTax(input(u), rates).totalTax).toBe(TAXED);
    expect(checkEligibility([u], 5, 5).failReasons.map((f) => f.code)).toEqual(["RENTAL_PERIOD_SHORT"]);
  });

  it("F15-9 거주주택 요건(거주 2년) 미충족은 그대로 막는다", () => {
    expect(checkEligibility([unit()], 5, 1).passed).toBe(false);
  });
});
