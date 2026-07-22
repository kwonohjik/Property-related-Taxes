/**
 * 겸용주택 상세명세서 어댑터 — 실가/환산 모드별 취득가액·필요경비 표시 anchor.
 *
 * 버그(수정 전): mixedUseToFilingResult()가 usedEstimatedAcquisition을 항상 true로 하드코딩하고
 * estimatedBase/expenses를 채우지 않아, 실가 취득(section97_actual)에서도 상세명세서가
 * "취득가액(추계) 0 / 개산공제 0"으로 표시되었다. (겸용주택 결과뷰 전용)
 *
 * 상세명세서 취득가액 실가 분기: 취득가액 = 양도가액 − 양도차익 − expenses (DetailedStatementHelpers.ts:244).
 * 어댑터가 이 역산이 실제 취득가액을 내도록 expenses(개산공제 합계)를 전달하는지 검증한다.
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { mixedUseToFilingResult } from "@/components/calc/results/mixed-use/MixedUseResultCard";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

const RATES = makeMockRates();
const TRANSFER_PRICE = 3_300_000_000;
const TRANSFER_DATE = new Date("2026-06-01");
const ACQ_DATE = new Date("2020-06-01");

function base(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: ACQ_DATE,
    buildingAcquisitionDate: ACQ_DATE,
    transferStandardPrice: {
      housingPrice: 800_000_000,
      commercialBuildingPrice: 500_000_000,
      landPricePerSqm: 3_000_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 500_000_000,
      commercialBuildingPrice: 300_000_000,
      landPricePerSqm: 2_000_000,
    },
    residencePeriodYears: 6,
    isMetropolitanArea: true,
    zoneType: "residential",
    isOneHouseExempt: true,
    ...overrides,
  };
}

const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

// 상세명세서 실가 취득가액 역산 (DetailedStatementHelpers.ts:244, capEx=0)
const displayedAcq = (r: ReturnType<typeof mixedUseToFilingResult>) =>
  TRANSFER_PRICE - r.transferGain - (r.expenses ?? 0);

describe("겸용 상세명세서 어댑터 — 취득 모드별 취득가액·필요경비", () => {
  it("실가 취득(section97_actual) — usedEstimated=false, 취득가액 역산=실거래가 10억, 개산공제 0", () => {
    const b = run(base({ useActualAcquisition: true, acquisitionActualTotalPrice: 1_000_000_000 }));
    expect(b.calculationRoute.acquisitionConversionRoute).toBe("section97_actual");

    const r = mixedUseToFilingResult(b);
    expect(r.usedEstimatedAcquisition).toBe(false);
    expect(r.expenses).toBe(0); // 실가 = 개산공제 없음
    // 버그 재현 방지: 취득가액이 0이 아니라 실제 취득가액(10억)으로 표시되어야 한다.
    expect(displayedAcq(r)).toBe(1_000_000_000);
  });

  it("환산 취득(section97_direct) — usedEstimated=true, estimatedBase=환산취득가·estimatedDeduction=개산공제", () => {
    const b = run(base()); // 실가 미입력 → 환산
    expect(b.calculationRoute.acquisitionConversionRoute).toBe("section97_direct");

    const r = mixedUseToFilingResult(b);
    const acqPrice =
      b.housingPart.estimatedAcquisitionPrice + b.commercialPart.estimatedAcquisitionPrice;
    const deduction =
      b.housingPart.landAppraisalDed +
      b.housingPart.buildingAppraisalDed +
      b.commercialPart.landAppraisalDed +
      b.commercialPart.buildingAppraisalDed;
    expect(r.usedEstimatedAcquisition).toBe(true);
    expect(r.estimatedBase).toBe(acqPrice); // 환산 분기 취득가액 표시(0 아님)
    expect(r.estimatedDeduction).toBe(deduction);
    expect(deduction).toBeGreaterThan(0); // 환산은 개산공제 존재
  });
});
