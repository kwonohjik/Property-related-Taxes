/**
 * L-2 회귀: 장기임대 거주주택 비과세 특례(§155⑳·§161) 조기반환 경로의
 * 신고불성실·납부지연 가산세 반영 검증.
 *
 * 코드리뷰 2026-06-03 발견: 특례 경로가 finalizeTransferTax를 거치지 않아
 * filingPenaltyDetails/delayedPaymentDetails 가산세를 누락했었음 → emitPenaltySteps 직접 호출로 수정.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      registrationDate: new Date("2018-06-01"),
      rentalType: "long-8",
      rentalAcquisitionType: "purchase",
      isApartment: false,
      region: "non-metro",
      standardPriceAtRentalStart: 250_000_000,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

const filingPenalty: NonNullable<TransferTaxInput["filingPenaltyDetails"]> = {
  determinedTax: 10_000_000,
  reductionAmount: 0,
  priorPaidTax: 0,
  originalFiledTax: 0,
  excessRefundAmount: 0,
  interestSurcharge: 0,
  filingType: "none", // 무신고 → 20%
  penaltyReason: "normal",
};

const base = (extra?: Partial<TransferTaxInput>): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_500_000_000, // 15억 고가 → 과세 발생
    acquisitionPrice: 1_100_000_000, // 차익 4억
    acquisitionDate: new Date("2014-06-01"),
    transferDate: new Date("2024-06-01"), // 10년 보유
    residencePeriodMonths: 60, // 5년 거주
    isOneHousehold: true,
    householdHousingCount: 1,
    expenses: 0,
    rentalHousingException: rentalException,
    ...extra,
  });

describe("L-2: 장기임대 거주주택 특례 경로 가산세 반영", () => {
  it("특례 적용 확인 (조기반환 경로 진입)", () => {
    const r = calculateTransferTax(base(), rates);
    expect(r.rentalHousingExceptionDetail?.applied).toBe(true);
  });

  it("특례 + 무신고 가산세 — 신고불성실가산세 totalTax 반영 (L-2 회귀)", () => {
    const r = calculateTransferTax(base({ filingPenaltyDetails: filingPenalty }), rates);
    // 본세·지방소득세
    expect(r.calculatedTax).toBe(3_645_000);
    expect(r.determinedTax).toBe(3_645_000);
    expect(r.localIncomeTax).toBe(364_500);
    // 가산세 반영 (수정 전: penaltyDetail undefined, totalTax 4,009,500)
    expect(r.penaltyDetail).toBeDefined();
    expect(r.penaltyDetail!.filingPenalty?.filingPenalty).toBe(2_000_000);
    expect(r.totalTax).toBe(6_009_500); // 3,645,000 + 364,500 + 2,000,000
  });

  it("특례 + 가산세 미입력 — 기존 동작 보존 (penaltyDetail 없음)", () => {
    const r = calculateTransferTax(base(), rates);
    expect(r.penaltyDetail).toBeUndefined();
    expect(r.totalTax).toBe(4_009_500); // 본세 + 지방소득세만
  });
});
