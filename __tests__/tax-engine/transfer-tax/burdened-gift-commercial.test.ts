/**
 * 부담부증여 — 상업용건물·오피스텔(commercial_building) propertyType anchor (Phase 2, F-3, 2026-05-12)
 *
 * 케이스 인벤토리 후속:
 *   - F-3-1: 상업용건물 부담부증여 + 기준시가 모드 + §95 표1 (일반)
 *   - F-3-2: 미지원 propertyType(예: presale_right) → throw 검증
 *
 * 설계 의사결정:
 *   상업용건물의 cb* 필드(cbExclusiveArea·cbUnitPriceAtTransfer 등)는 환산취득가(useEstimatedAcquisition) 전용.
 *   부담부증여 모드에서는 사용자가 standardPriceAtTransfer / standardPriceAtAcq에 상증법 §61 평가액을 직접 입력.
 *   housing/building/commercial_building 모두 동일한 단일 가격 fallback 패턴.
 *
 * 법령 근거:
 *   - 소득세법 시행령 §159 (부담부증여 양도차익)
 *   - 소득세법 §95 ② 표1 + §95 ④ 본문 (보유기간·장특공)
 *   - 상증법 §60~§66 (Max 평가)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

// ============================================================
// F-3-1: 상업용건물 부담부증여 + 기준시가 모드 + §95 표1
// ============================================================
//
// 합성 시나리오:
//   상업용건물(오피스텔) — 보유 12년 (2012-01-01 ~ 2024-01-01)
//   양도시 호별고시가 (단일 기준시가) = 1,000,000,000 (상증법 §61 평가)
//   취득시 호별고시가 = 400,000,000
//   인수채무: 보증금 200M + 차입금 200M = 400,000,000
//
// 평가 Max:
//   supplementary = 1,000,000,000 (commercial_building → buildingStdPrice 자리)
//   mortgage      = 200M + 200M = 400,000,000
//   rental        = 200M + 0 = 200,000,000
//   → giftValuation C = 1,000,000,000
//
// 채무비율 B/C = 400M / 1B = 0.4
//
// §159 안분:
//   transferPrice = 1B × 0.4 = 400,000,000
//   acquisitionPrice = 400M × 0.4 = 160,000,000
//   estimatedDeduction = 160M × 3% = 4,800,000
//
// transferGain = 400M - 160M - 4.8M = 235,200,000
//
// 장특공 표1 (보유 11년 환산, 22%): 235,200,000 × 0.22 = 51,744,000
// 양도소득금액 = 235,200,000 - 51,744,000 = 183,456,000
// 과세표준 = 183,456,000 - 2,500,000 = 180,956,000
//
// §55 2024 누진세율: 150M~300M = 38% (누진공제 19,940,000)
//   180,956,000 × 0.38 - 19,940,000 = 68,763,280 - 19,940,000 = 48,823,280

describe("F-3-1 — 상업용건물 부담부증여 + §95 표1", () => {
  const TRANSFER_DATE = new Date("2024-01-01");
  const ACQUISITION_DATE = new Date("2012-01-01");

  const cbBurdenedGiftInfo: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 200_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    // commercial_building: 단일 기준시가 — buildingStdPrice 자리에 통째
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: 1_000_000_000,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: 400_000_000,
  };

  function makeF31Input(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
    return baseTransferInput({
      propertyType: "commercial_building",
      transferDate: TRANSFER_DATE,
      acquisitionDate: ACQUISITION_DATE,
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      transferType: "burdened_gift",
      acquisitionCause: "purchase",
      isOneHousehold: false,
      householdHousingCount: 0,
      burdenedGiftInfo: cbBurdenedGiftInfo,
      ...overrides,
    });
  }

  it("§159 안분: transferPrice = 400,000,000 / acquisitionPrice = 160,000,000", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    const b = result.transferBurdenedGiftBreakdown!;
    expect(b.assumedDebtAmount).toBe(400_000_000);
    expect(b.debtRatio).toBeCloseTo(0.4, 7);
    expect(b.sangjeungbeopValuation.max).toBe(1_000_000_000);
    expect(b.sangjeungbeopValuation.selectedMode).toBe("supplementary");
    expect(b.perAsset.building.transferPrice).toBe(400_000_000);
    expect(b.perAsset.building.acquisitionPrice).toBe(160_000_000);
    expect(b.perAsset.building.estimatedDeduction).toBe(4_800_000);
  });

  it("양도차익 = 235,200,000 / 장특공 표1 22%", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    expect(result.transferGain).toBe(235_200_000);
    expect(result.longTermHoldingDeduction).toBe(51_744_000);
    expect(result.longTermHoldingRate).toBeCloseTo(0.22, 7);
  });

  it("§55 양도연도 누진세율 자가검증 → 산출세액 = 48,823,280", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    // 과세표준 = (235.2M - 51.744M) - 2.5M = 180,956,000
    expect(result.taxBase).toBe(180_956_000);
    // 150M~300M = 38% (누진공제 19,940,000) → 180,956,000 × 0.38 - 19,940,000 = 48,823,280
    expect(result.calculatedTax).toBe(48_823_280);
  });

  // Phase 3 (2026-05-12): 증여세 통합 anchor
  // gratuitousPortion = 1B − 400M = 600,000,000
  // donorRelation default "lineal_descendant" 공제 50M → 과세표준 550,000,000
  // §56 5억~10억 30% (누진공제 60M): 550M × 0.3 − 60M = 165M − 60M = 105,000,000
  // §69 신고세액공제 3%: 105M × 0.03 = 3,150,000 → 결정세액 101,850,000
  it("Phase 3 증여세 통합 — gratuitousPortion 600M, finalTax 101,850,000", () => {
    const result = calculateTransferTax(makeF31Input(), rates);
    const bg = result.transferBurdenedGiftBreakdown!;
    expect(bg.gratuitousPortion).toBe(600_000_000);
    const gt = bg.giftTax!;
    expect(gt.donorRelation).toBe("lineal_descendant");
    // §47① — grossGiftValue는 **채무 차감 전 총 평가액(C)**이다. 차감은 과세가액에서 이뤄진다.
    // (2026-08-12 정정: 종전에는 C − B를 넣어 별지10호 ⑰에 이미 뺀 값이 표시됐다)
    expect(gt.grossGiftValue).toBe(1_000_000_000); // C = 10억, B = 4억 → 무상 6억
    expect(gt.deduction).toBe(50_000_000);
    expect(gt.taxBase).toBe(550_000_000);
    expect(gt.computedTax).toBe(105_000_000);
    expect(gt.filingCredit).toBe(3_150_000);
    expect(gt.finalTax).toBe(101_850_000);
  });
});

// ============================================================
// F-3-2: 미지원 propertyType 차단 회귀
// ============================================================

describe("F-3-2 — 미지원 propertyType (presale_right) 차단", () => {
  it("presale_right(분양권) → assertBurdenedGiftEligible throw", () => {
    const input = baseTransferInput({
      propertyType: "presale_right",
      transferDate: new Date("2024-01-01"),
      acquisitionDate: new Date("2022-01-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      transferType: "burdened_gift",
      acquisitionCause: "purchase",
      isOneHousehold: false,
      householdHousingCount: 0,
      burdenedGiftInfo: {
        valuationMode: "sangjeungbeop_standard",
        lendingDepositTotal: 100_000_000,
        mortgageDebtAmount: 100_000_000,
        annualRentTotal: 0,
        landStdPriceAtTransfer: 0,
        buildingStdPriceAtTransfer: 500_000_000,
        landStdPriceAtAcquisition: 0,
        buildingStdPriceAtAcquisition: 300_000_000,
      },
    });
    expect(() => calculateTransferTax(input, rates)).toThrow(/주택·토지·건물·일반건물·상업용건물|미지원/);
  });
});

// ============================================================
// F-3-3: 상업용건물 K-4(시가 + 실지취득가액) — 취득시 기준시가 inert 회귀
// ============================================================
//
// 근거: 상업용건물은 토지/건물 분리 없이 단일 기준시가로 처리(landStd=0).
//   K-4 실지 경로는 실지취득가액 전액이 건물분으로 귀속되므로(§159①1호 본문),
//   취득시 건물 기준시가(buildingStdPriceAtAcquisition)의 값은 양도차익·산출세액에
//   영향을 주지 않는다 → UI/검증에서 입력 필수 해제(gift-tax-form-shared validateStep)의 전제.
//
//   취득가액 = 실지취득가액 160M × 채무비율(400M/1B = 0.4) = 64,000,000 (기준시가 무관)

describe("F-3-3 — 상업용건물 K-4(시가+실지): 취득시 기준시가는 결과에 무영향(inert)", () => {
  const TRANSFER_DATE = new Date("2024-01-01");
  const ACQUISITION_DATE = new Date("2012-01-01");

  function makeK4Input(buildingStdAtAcq: number): TransferTaxInput {
    const info: BurdenedGiftInfo = {
      valuationMode: "sangjeungbeop_market",
      marketValueAtTransfer: 1_000_000_000, // 분모 C (감정·매매사례 시가)
      lendingDepositTotal: 200_000_000,
      mortgageDebtAmount: 200_000_000,
      annualRentTotal: 0,
      acquisitionMethod: "actual",
      actualAcquisitionTotal: 160_000_000, // 실지취득가액 합계(건물+토지)
      landStdPriceAtTransfer: 0,
      buildingStdPriceAtTransfer: 1_000_000_000,
      landStdPriceAtAcquisition: 0,
      buildingStdPriceAtAcquisition: buildingStdAtAcq, // ← 변수: 미입력(0) vs 입력(400M)
    };
    return baseTransferInput({
      propertyType: "commercial_building",
      transferDate: TRANSFER_DATE,
      acquisitionDate: ACQUISITION_DATE,
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      transferType: "burdened_gift",
      acquisitionCause: "purchase",
      isOneHousehold: false,
      householdHousingCount: 0,
      burdenedGiftInfo: info,
    });
  }

  it("취득시 기준시가 0(미입력) vs 400,000,000 → 양도차익·과세표준·산출세액 동일", () => {
    const withZero = calculateTransferTax(makeK4Input(0), rates);
    const withValue = calculateTransferTax(makeK4Input(400_000_000), rates);

    expect(withZero.transferGain).toBe(withValue.transferGain);
    expect(withZero.taxBase).toBe(withValue.taxBase);
    expect(withZero.calculatedTax).toBe(withValue.calculatedTax);

    // 취득가액도 실지취득가액 전액(건물분) 기준으로 동일 — 64,000,000 (= 160M × 0.4)
    const acqZero = withZero.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice;
    const acqValue = withValue.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice;
    expect(acqZero).toBe(acqValue);
    expect(acqZero).toBe(64_000_000);
  });

  // 회귀 가드: 시가 모드(K-4)에서도 장기보유특별공제(§95② 표1)가 적용되어야 한다.
  //   (보유 2012-01-01~2024-01-01 = 표1 22%. "시가 모드 LTHD 누락" 의혹에 대한 실증 anchor —
  //    LTHD=0은 보유기간 3년 미만일 때만 발생, 시가 모드 자체로는 누락되지 않음.)
  it("시가 K-4 — 장기보유특별공제 적용(표1 22%) — LTHD 누락 회귀 가드", () => {
    const r = calculateTransferTax(makeK4Input(0), rates);
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(r.longTermHoldingRate).toBeCloseTo(0.22, 2);
    // LTHD가 실제 과세표준에 차감됨 (양도차익 − 기본공제보다 작아야 함)
    expect(r.taxBase).toBeLessThan(r.transferGain - 2_500_000);
  });
});
