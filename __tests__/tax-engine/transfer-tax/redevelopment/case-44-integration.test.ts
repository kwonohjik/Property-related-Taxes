/**
 * 사례 44 — APT-환산-납부-주택출자 / transfer-tax.ts 통합 anchor (산출세액·지방세·세액합계)
 *
 * 본 spec 은 transfer-tax.ts 의 calculateTransferTax() 진입점을 통해 redevelopment 분기 라우팅
 * → RedevelopmentResult → 기본공제·과세표준·산출세액·지방소득세·세액합계 까지 전체 흐름 검증.
 *
 * ★ Primary anchor (양도코리아 SW 2026 개정판 스크린샷 — 양도일 2026-02-16):
 *   산출세액   55,836,613 (엔진 55,836,614, BigInt floor ±1원)
 *   지방소득세  5,583,661
 *   세액합계   61,420,274 (엔진 61,420,275, ±1원)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../../_helpers/mock-rates";
import { case44RedevelopmentInfo } from "./_helpers";

const mockRates = makeMockRates();

describe("사례 44 통합 anchor — APT-환산-납부-주택출자 (transfer-tax.ts → redevelopment 분기)", () => {
  const input: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0, // 환산 모드 — actualAcquisitionPrice 미사용
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false, // 사례 44 는 1세대1주택 아님 (12억 안분 미적용)
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
  });

  const result = calculateTransferTax(input, mockRates);

  it("redevelopmentDetail 부착 (분기 라우팅 활성)", () => {
    expect(result.redevelopmentDetail).toBeDefined();
    expect(result.redevelopmentDetail?.valuationMeta?.method).toBe(
      "estimated_post_disclosure_decree_166_3",
    );
  });

  it("환산취득가 = 141,221,534 (xlsx 일치, BigInt floor)", () => {
    expect(result.redevelopmentDetail?.preApproval.apportionedAcquisition).toBe(141_221_534);
  });

  it("합계 양도차익 = 288,445,917 (xlsx 일치)", () => {
    expect(result.transferGain).toBe(288_445_917);
  });

  it("합계 LTHD = 86,533,774 (분배법칙, SW 86,533,774 일치 — 청산금분 30%)", () => {
    expect(result.longTermHoldingDeduction).toBe(86_533_774);
  });

  it("양도소득금액 = 201,912,143 (288,445,917 − 86,533,774, SW 201,912,142 와 ±1원)", () => {
    expect(result.redevelopmentDetail?.total.taxableIncome).toBe(201_912_143);
  });

  it("기본공제 = 2,500,000", () => {
    expect(result.basicDeduction).toBe(2_500_000);
  });

  it("과세표준 = 199,412,143 (201,912,143 − 2,500,000, SW 199,412,142 와 ±1원)", () => {
    expect(result.taxBase).toBe(199_412_143);
  });

  it("★ 산출세액 = 55,836,614 (SW 55,836,613 와 ±1원, BigInt floor)", () => {
    // 199,412,143 × 38% − 19,940,000 = 75,776,614 − 19,940,000 = 55,836,614
    expect(result.calculatedTax).toBe(55_836_614);
  });

  it("★ 지방소득세 = 5,583,661 (SW 일치)", () => {
    // 55,836,614 × 10%
    expect(result.localIncomeTax).toBe(5_583_661);
  });

  it("★ 세액합계 = 61,420,275 (SW 61,420,274 와 ±1원)", () => {
    expect(result.totalTax).toBe(61_420_275);
  });

  it("steps 에 LTHD 3줄 emit (인가전 / 인가후 기존 / 청산금)", () => {
    const lthdSteps = result.steps.filter(
      (s) => s.label.includes("장기보유공제") && s.label.startsWith("인가") || s.label.startsWith("청산금"),
    );
    expect(lthdSteps.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────
// H-9 회귀 (코드감사 2026-07-03): 재개발/입주권 경로 신고불성실·납부지연 가산세 누락
//   수정 전 redevelopment 분기는 penaltyTax:0 하드코딩 + emitPenaltySteps 미호출로
//   filingPenaltyDetails/delayedPaymentDetails 를 침묵 누락 → totalTax 과소산출.
//   rental-housing-exception 특례 경로(L-2)와 동일 부류 — emitPenaltySteps 재사용으로 수정.
// ─────────────────────────────────────────────────────────────
describe("사례 44 + 무신고 가산세 — 재개발 경로 신고불성실가산세 반영 (H-9 회귀)", () => {
  const filingPenalty: NonNullable<TransferTaxInput["filingPenaltyDetails"]> = {
    determinedTax: 55_836_614, // 재개발 산출세액 (route 2-pass 주입값)
    reductionAmount: 0,
    priorPaidTax: 0,
    originalFiledTax: 0,
    excessRefundAmount: 0,
    interestSurcharge: 0,
    filingType: "none", // 무신고 → 20%
    penaltyReason: "normal",
  };
  const penInput: TransferTaxInput = baseTransferInput({
    propertyType: "redevelopment_apt",
    transferPrice: 525_000_000,
    transferDate: new Date("2026-02-16"),
    acquisitionDate: new Date("2005-04-09"),
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    redevelopment: case44RedevelopmentInfo(),
    filingPenaltyDetails: filingPenalty,
  });
  const r = calculateTransferTax(penInput, mockRates);

  it("본세·지방소득세 불변 (산출세액 55,836,614 / 지방세 5,583,661)", () => {
    expect(r.calculatedTax).toBe(55_836_614);
    expect(r.localIncomeTax).toBe(5_583_661);
  });

  it("신고불성실가산세(20%) = 11,167,322 · penaltyDetail 부착 (수정 전: 미반영)", () => {
    // 55,836,614 × 20% = 11,167,322
    expect(r.penaltyDetail).toBeDefined();
    expect(r.penaltyDetail!.filingPenalty?.filingPenalty).toBe(11_167_322);
  });

  it("totalTax = 산출세액 + 지방세 + 가산세 = 72,587,597 (가산세 반영, H-9 회귀)", () => {
    // 55,836,614 + 5,583,661 + 11,167,322
    expect(r.totalTax).toBe(72_587_597);
  });
});
