/**
 * 겸용주택 감정가액·매매사례가액 취득가액 (§176의2②③ 추계 + 법 §100² 안분) — anchor (R-B).
 *
 * 감정가액·매매사례가액은 실지거래가 확인 불가 시 추계(§176의2③ 순서: 매매사례→감정→환산→기준시가).
 * 겸용 취득가액 총액을 법 §100² 취득시 기준시가 비율로 주택분/상가분·토지/건물 안분하되,
 * **개산공제(§163⑥, 취득시 기준시가×3%)는 적용**(실거래가와 달리 추계라 개산공제 유지·swap 대상 아님).
 *
 * 수정 전: 겸용 감정/매매사례도 환산 강제(useAppraisalSalesAcquisition 미소비).
 * 수정 후: 안분된 감정가액 직접 사용 + 개산공제 유지.
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import { makeMockRates } from "../_helpers/mock-rates";

afterEach(cleanup);

const RATES = makeMockRates();
const TRANSFER_PRICE = 3_300_000_000;
const ACQ_DATE = new Date("2020-06-01");
const TRANSFER_DATE = new Date("2026-06-01");

/** 취득시 기준시가 주택 5억 : 상가(건물 3억 + 토지 2M×100㎡=2억)=5억 → 1:1. 감정가액 8억 → 4억/4억. */
function appraisalBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
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
    useAppraisalSalesAcquisition: true,
    acquisitionActualTotalPrice: 800_000_000,
    ...overrides,
  };
}

const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

describe("겸용주택 감정가액·매매사례가액 취득가액 (§176의2·§100², R-B)", () => {
  it("B1: 감정가액 8억 → 주택분 4억·상가분 4억 안분, route=section176_2_appraisal_sales, 개산공제 O(≠0)", () => {
    const r = run(appraisalBase());
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("section176_2_appraisal_sales");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(400_000_000);
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(400_000_000);
    // 개산공제(§163⑥, 취득시 기준시가×3%) 적용 — 실거래가(0)와 결정적 차이
    expect(r.housingPart.landAppraisalDed).toBeGreaterThan(0);
    expect(r.commercialPart.landAppraisalDed).toBeGreaterThan(0);
    // 안분 불변식
    expect(
      r.housingPart.estimatedAcquisitionPrice + r.commercialPart.estimatedAcquisitionPrice,
    ).toBe(800_000_000);
  });

  it("R(회귀): 실거래가(useActual) → route=section97_actual·개산공제 0(불변)", () => {
    const r = run(
      appraisalBase({
        useAppraisalSalesAcquisition: false,
        useActualAcquisition: true,
        acquisitionActualTotalPrice: 1_000_000_000,
      }),
    );
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("section97_actual");
    expect(r.housingPart.landAppraisalDed).toBe(0);
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(500_000_000);
  });

  it("R(회귀): 환산 모드 → section97_direct 불변(1,031,250,000)", () => {
    const r = run(
      appraisalBase({ useAppraisalSalesAcquisition: false, acquisitionActualTotalPrice: undefined }),
    );
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("section97_direct");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(1_031_250_000);
  });

  it("가드: 감정/매매사례 + 공익수용 → throw(미지원)", () => {
    expect(() =>
      run(appraisalBase({ transferCause: "public_expropriation" })),
    ).toThrow(/공익수용/);
  });
});
