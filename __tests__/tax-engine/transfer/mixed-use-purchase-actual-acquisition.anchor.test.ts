/**
 * 겸용주택 매매 취득 실거래가 안분 (법 §100²·§97①1호가목) — anchor 테스트 (R1)
 *
 * 계획: docs/02-design/features/transfer-mixed-use-purchase-actual-acquisition-166-6.plan.md §1(법제처 원문)
 * 설계: transfer-mixed-use-purchase-actual-acquisition-166-6.engine.design.md
 *
 * 검증 핵심: 겸용 매매에서 취득 실거래가가 확인되면(useActualAcquisition) 환산(§176의2)이 아니라
 * 총 취득 실거래가를 법 §100② 취득시 기준시가 비율로 주택분/상가분·토지/건물에 안분해 취득가액으로
 * 직접 사용(§163⑥ 개산공제 배제). 취득시 기준시가는 안분 비율 산출용(값 자체가 취득가액 아님).
 *
 * 수정 전(버그): 겸용 매매도 환산 강제 → housingPart.estimatedAcquisitionPrice = 1,031,250,000(환산).
 * 수정 후: 실가 안분 → 주택분 500,000,000 / 상가분 500,000,000(취득시 기준시가 500M:500M = 1:1).
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

/**
 * 겸용 매매 표준 케이스 — 취득시 기준시가 주택 5억 : 상가(건물 3억 + 토지 2M/㎡×100㎡=2억)=5억 → 1:1.
 * 총 취득 실거래가 10억 → 주택분 5억 / 상가분 5억.
 */
function purchaseBase(overrides?: Partial<MixedUseAssetInput>): MixedUseAssetInput {
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
    useActualAcquisition: true,
    acquisitionActualTotalPrice: 1_000_000_000,
    ...overrides,
  };
}

const run = (asset: MixedUseAssetInput) =>
  calcMixedUseTransferTax(TRANSFER_PRICE, TRANSFER_DATE, asset, RATES);

describe("겸용주택 매매 취득 실거래가 안분 (법 §100², R1)", () => {
  it("A1(P-1): 총 실거래가 10억 → 주택분 5억·상가분 5억 직접, route=section97_actual, 개산공제 0", () => {
    const r = run(purchaseBase());
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("section97_actual");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(500_000_000);
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(500_000_000);
    // 개산공제(§163⑥ 3%) 배제
    expect(r.housingPart.landAppraisalDed).toBe(0);
    expect(r.housingPart.buildingAppraisalDed).toBe(0);
    expect(r.commercialPart.landAppraisalDed).toBe(0);
    expect(r.commercialPart.buildingAppraisalDed).toBe(0);
    // 안분 불변식: 주택분 + 상가분 = 총 실거래가
    expect(
      r.housingPart.estimatedAcquisitionPrice + r.commercialPart.estimatedAcquisitionPrice,
    ).toBe(1_000_000_000);
  });

  it("A1': 비대칭 비율 — 취득시 주택 6억:상가 4억, 실거래가 10억 → 주택분 6억·상가분 4억", () => {
    // 상가 취득시 기준시가 = 건물 2억 + 토지 2M×100㎡=2억 = 4억. 주택 6억. total 10억 → 0.6:0.4.
    const r = run(
      purchaseBase({
        acquisitionStandardPrice: {
          housingPrice: 600_000_000,
          commercialBuildingPrice: 200_000_000,
          landPricePerSqm: 2_000_000,
        },
      }),
    );
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(600_000_000);
    expect(r.commercialPart.estimatedAcquisitionPrice).toBe(400_000_000);
  });

  it("A1-실비(매매실가 필요경비 안분): housing/commercialInheritedExpense → 취득시 토지/건물 40:60 안분(Σ=입력값)", () => {
    // 매매실가도 usesDeemedAcq 경로 — 개산공제 배제·필요경비는 취득시 기준시가 비율 안분.
    const r = run(
      purchaseBase({ housingInheritedExpense: 10_000_000, commercialInheritedExpense: 5_000_000 }),
    );
    expect(r.housingPart.landAppraisalDed).toBe(4_000_000);
    expect(r.housingPart.buildingAppraisalDed).toBe(6_000_000);
    expect(r.commercialPart.landAppraisalDed).toBe(2_000_000);
    expect(r.commercialPart.buildingAppraisalDed).toBe(3_000_000);
    expect(r.housingPart.landAppraisalDed + r.housingPart.buildingAppraisalDed).toBe(10_000_000);
    expect(r.commercialPart.landAppraisalDed + r.commercialPart.buildingAppraisalDed).toBe(5_000_000);
  });

  it("A2(회귀): 실가 미선택(환산 모드) → 현행 환산값 불변(주택분 1,031,250,000)", () => {
    const r = run(purchaseBase({ useActualAcquisition: false, acquisitionActualTotalPrice: undefined }));
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("section97_direct");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(1_031_250_000);
  });

  it("A3(회귀): 증여 §163⑨ 경로 불변(route=gift_direct, 주택분 5억)", () => {
    const r = run(
      purchaseBase({ useActualAcquisition: false, acquisitionActualTotalPrice: undefined, acquisitionByGift: true }),
    );
    expect(r.calculationRoute.acquisitionConversionRoute).toBe("gift_direct");
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(500_000_000);
  });

  it("가드 X-1: 실가 + 공익수용 → throw(미지원)", () => {
    expect(() =>
      run(purchaseBase({ transferCause: "public_expropriation" })),
    ).toThrow(/공익수용/);
  });

  it("가드 X-2: 실가 + 미공시(PHD) → throw(미지원)", () => {
    expect(() =>
      run(
        purchaseBase({
          usePreHousingDisclosure: true,
          preHousingDisclosure: {
            firstDisclosureDate: new Date("2021-01-01"),
            firstDisclosureHousingPrice: 400_000_000,
            landPricePerSqmAtAcquisition: 2_000_000,
            landPricePerSqmAtFirstDisclosure: 2_500_000,
            buildingStdPriceAtAcquisition: 100_000_000,
            buildingStdPriceAtFirstDisclosure: 120_000_000,
          } as MixedUseAssetInput["preHousingDisclosure"],
        }),
      ),
    ).toThrow(/미공시|PHD|지원하지/);
  });

  it("가드 X-3: 실가 + 보유 중 용도변경 → throw(미지원)", () => {
    expect(() =>
      run(
        purchaseBase({
          partialUsageChange: {
            direction: "house_to_commercial",
            usageChangeDate: new Date("2023-01-01"),
          } as MixedUseAssetInput["partialUsageChange"],
        }),
      ),
    ).toThrow(/용도변경|지원하지/);
  });
});
