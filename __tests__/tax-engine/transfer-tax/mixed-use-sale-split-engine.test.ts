/**
 * 엔진 통합: 겸용 일괄양도 안분 기준 — Step 2 동작 고정 (계획서 `docs/00-pm/mixed-use-sale-split-basis.plan.md` §4.2 · R-1 · R-2 · Q-8 · Q-9)
 *
 * 기준시가는 사례 p.772 역산값(anchor `mixed-use-sale-split-basis.anchor.test.ts`와 같다):
 *   양도시 — 주택토지 30,000,000 · 주택건물(나목) 27,000,000 · 상가토지 70,000,000 · 상가건물 63,000,000
 *   취득시 — 주택토지 12,000,000 · 주택건물 18,000,000 · 상가토지 28,000,000 · 상가건물 42,000,000
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2026-07-01");
const TOTAL = 200_000_000;

const BASE: MixedUseAssetInput = {
  isMixedUseHouse: true,
  residentialFloorArea: 30,
  nonResidentialFloorArea: 70,
  buildingFootprintArea: 100,
  totalLandArea: 400,
  landAcquisitionDate: new Date("2020-12-01"),
  buildingAcquisitionDate: new Date("2023-03-20"),
  transferStandardPrice: {
    housingPrice: 57_000_000, housingBuildingPrice: 27_000_000, commercialBuildingPrice: 63_000_000, landPricePerSqm: 250_000,
  },
  acquisitionStandardPrice: {
    housingPrice: 0, housingBuildingPrice: 18_000_000, commercialBuildingPrice: 42_000_000,
    landPricePerSqm: 100_000, landPricePerSqmAtBuildingAcq: 100_000,
  },
  separateAcquisition: { landMode: "actual", buildingMode: "actual", landAcquisitionPrice: 50_000_000, buildingAcquisitionPrice: 70_000_000 },
  residencePeriodYears: 3,
  isMetropolitanArea: false,
  zoneType: "agriculture_forest",
  isOneHouseExempt: true,
};

/** 총액 모델 · 환산 — 토지·건물 같은 날 취득(파트 모델 아님). 취득시 개별주택가격 = 가목 12,000,000 + 나목 18,000,000. */
function conversionAsset(extra: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  const { separateAcquisition: _drop, ...rest } = BASE;
  void _drop;
  return {
    ...rest,
    landAcquisitionDate: new Date("2020-12-01"),
    buildingAcquisitionDate: new Date("2020-12-01"),
    acquisitionStandardPrice: { ...BASE.acquisitionStandardPrice, housingPrice: 30_000_000 },
    ...extra,
  };
}

const APPRAISAL = { landAppraisalAtTransfer: 150_000_000, buildingAppraisalAtTransfer: 100_000_000 };

describe("Step 2 — 양도가액 주입", () => {
  it("[E-1] Q-8 파트별 환산: 상가토지 84,000,000×28/70 · 상가건물 56,000,000×42/63 (합계 환산 후 분할이 아니다)", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset(APPRAISAL), rates);
    const c = r.commercialPart;
    expect(c.landTransferPrice).toBe(84_000_000);
    expect(c.buildingTransferPrice).toBe(56_000_000);
    expect(c.landAcqPrice).toBe(33_600_000);
    expect(c.buildingAcqPrice).toBe(37_333_333);
    expect(c.estimatedAcquisitionPrice).toBe(70_933_333);
    // 대조 — 합계 환산(140,000,000 × 70,000,000 / 133,000,000 = 73,684,210)이었다면 값이 달랐다.
    expect(c.estimatedAcquisitionPrice).not.toBe(73_684_210);
  });

  it("[E-1h] Q-8 주택분도 파트별 환산 — 주택토지 36,000,000×12/30 · 주택건물 24,000,000×18/27, 표시용 환산 합계도 같은 값", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset(APPRAISAL), rates);
    expect(r.housingPart.landAcqPrice).toBe(14_400_000);
    expect(r.housingPart.buildingAcqPrice).toBe(16_000_000);
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(30_400_000);
  });

  it("[E-2] R-2 공통 양도비 = 4파트 양도가액 비율 — 상가토지 420,000 · 상가건물 280,000", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, ...APPRAISAL, transferExpense: 1_000_000 }, rates);
    expect(r.commercialPart.landAppraisalDed).toBe(420_000);
    expect(r.commercialPart.buildingAppraisalDed).toBe(280_000);
  });

  it("[E-3] 계약서 구분가액(30% 이내) — 토지 110,000,000 → 상가 77,000,000 / 건물 90,000,000 → 상가 63,000,000", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, landTransferPrice: 110_000_000, buildingTransferPrice: 90_000_000 }, rates);
    expect(r.saleSplit?.basis).toBe("declared");
    expect(r.saleSplit?.deemedUnclear?.deemed).toBe(false);
    expect(r.commercialPart.landTransferPrice).toBe(77_000_000);
    expect(r.commercialPart.buildingTransferPrice).toBe(63_000_000);
    expect(r.apportionment.housingTransferPrice).toBe(60_000_000);
  });

  it("[E-4] R-1 구분가액 30% 이상 이탈 + 감정 없음 → 현행 기준시가 경로 그대로 + 사유 echo", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, landTransferPrice: 180_000_000, buildingTransferPrice: 20_000_000 }, rates);
    expect(r.saleSplit).toBeUndefined();
    expect(r.saleSplitFallback?.reason).toBe("deemed_to_std");
    expect(r.saleSplitFallback?.deemedUnclear?.deemed).toBe(true);
    // SB-0 대조군과 같은 현행 경로 값
    expect(r.commercialPart.landTransferPrice).toBe(73_684_210);
    expect(r.commercialPart.buildingTransferPrice).toBe(66_315_790);
  });

  it("[E-5] Q-9 공익수용 + 안분 입력 → 차단 (총액 모델 — 파트 모델은 기존 X-가드가 수용을 먼저 막는다)", () => {
    expect(() =>
      calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({ ...APPRAISAL, transferCause: "public_expropriation" }), rates),
    ).toThrow(/겸용주택 양도가액 안분: 공익수용/);
    // 안분 입력이 없으면 수용 경로는 종전 그대로 계산된다(가드는 새 입력에만 걸린다).
    expect(() =>
      calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({ transferCause: "public_expropriation" }), rates),
    ).not.toThrow(/겸용주택 양도가액 안분/);
  });

  it("[E-6] 지분 양도 — 12억 판정 분모(물건 전체 주택분)도 같은 비율: 400,000,000 × 60,000,000/200,000,000", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, ...APPRAISAL, totalPropertyTransferPrice: 400_000_000 }, rates);
    expect(r.apportionment.wholeHousingTransferPrice).toBe(120_000_000);
  });

  /**
   * 사례 기준시가는 주택:상가가 토지·건물 모두 30:70이라 1차 basis가 무엇이든 주택분 합계가 같다 — 주택 쪽 주입과
   * R-2(공통 양도비 비율)를 바꿔도 아무 테스트도 깨지지 않았다(mutation P-7·P-9 생존). 개별주택가격 60,000,000 ·
   * 나목 20,000,000이면 주택분 기준시가가 토지 36,000,000 / 건물 24,000,000(가목 30,000,000:나목 20,000,000 비례)이 되어 비율이 갈린다.
   *   4파트: 주택토지 40,754,716 · 주택건물 22,068,965 · 상가토지 79,245,284 · 상가건물 57,931,035
   *   공통 양도비 1,000,000 → 주택 314,118(203,773 / 110,345) · 상가 685,882(396,226 / 289,656)
   *   (기준시가 비율이었다면 상가 몫 689,120)
   */
  it("[E-8] 주택:상가 비율이 1차 basis에 따라 갈리는 기준시가 — 주택 주입·R-2 공통 양도비", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, {
      ...BASE, ...APPRAISAL, transferExpense: 1_000_000,
      transferStandardPrice: { ...BASE.transferStandardPrice, housingPrice: 60_000_000, housingBuildingPrice: 20_000_000 },
    }, rates);
    expect(r.apportionment.housingTransferPrice).toBe(62_823_681);
    expect(r.housingPart.landTransferPrice).toBe(40_754_716);
    expect(r.housingPart.buildingTransferPrice).toBe(22_068_965);
    expect(r.commercialPart.landAppraisalDed).toBe(396_226);
    expect(r.commercialPart.buildingAppraisalDed).toBe(289_656);
    expect(r.housingPart.landAppraisalDed).toBe(203_773);
    expect(r.housingPart.buildingAppraisalDed).toBe(110_345);
  });

  it("[E-7] echo — 1차 토지·건물과 4파트가 결과에 남는다(표시 계층 재계산 금지)", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, ...APPRAISAL }, rates);
    expect(r.saleSplit?.basis).toBe("appraisal");
    expect(r.saleSplit?.landBuilding).toEqual({ land: 120_000_000, building: 80_000_000 });
    expect(r.saleSplit?.parts.commercialBuilding).toBe(56_000_000);
  });
});

describe("Step 3 — 상가건물 감가상각비(§97③) · 건물 귀속 양도비", () => {
  it("[E-9] 기준시가 안분 모드에서도 동작 — 감가상각·철거비는 안분 방식과 무관한 취득·경비 축", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, {
      ...BASE, commercialBuildingDepreciation: 2_250_000, buildingDirectTransferExpense: 1_000_000,
    }, rates);
    expect(r.saleSplit).toBeUndefined();
    expect(r.commercialPart.buildingTransferPrice).toBe(66_315_790); // 현행 기준시가 안분 그대로
    expect(r.commercialPart.buildingAcqPrice).toBe(46_750_000);
    expect(r.commercialPart.buildingAppraisalDed).toBe(700_000);
    expect(r.commercialPart.landAppraisalDed).toBe(0);
  });

  it("[E-10] 실가 총액 모델(같은 날 취득) — 상가건물 취득가액에서 차감", () => {
    const withDep = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
      useActualAcquisition: true, acquisitionActualTotalPrice: 120_000_000, commercialBuildingDepreciation: 2_250_000,
    }), rates);
    const without = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
      useActualAcquisition: true, acquisitionActualTotalPrice: 120_000_000,
    }), rates);
    expect(without.commercialPart.buildingAcqPrice - withDep.commercialPart.buildingAcqPrice).toBe(2_250_000);
    expect(withDep.commercialPart.landAcqPrice).toBe(without.commercialPart.landAcqPrice);
  });

  it("[E-11] 감가상각비가 취득가액보다 크면 취득가액 0에서 멈춘다(음수 금지)", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, { ...BASE, commercialBuildingDepreciation: 999_000_000 }, rates);
    expect(r.commercialPart.buildingAcqPrice).toBe(0);
  });

  it("[E-12] 환산 + 건물 귀속 양도비 — 개산공제 경로에서는 반영되지 않고, §97②2호 단서(나목) 비교에는 들어간다", () => {
    const small = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({ buildingDirectTransferExpense: 1_000_000 }), rates);
    expect(small.necessaryExpenseProviso?.chosen).toBe("estimated");
    // 가목 = 환산 105,263,157(200,000,000 × 100,000,000 / 190,000,000) + 개산공제 3,000,000 = 108,263,157
    const big = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({ buildingDirectTransferExpense: 200_000_000 }), rates);
    expect(big.necessaryExpenseProviso).toEqual({ estimatedSide: 108_263_157, directSide: 200_000_000, chosen: "direct" });
    expect(big.commercialPart.buildingAppraisalDed).toBe(140_000_000); // 27,000,000 : 63,000,000
    expect(big.commercialPart.landAppraisalDed).toBe(0);
  });

  it("[E-13] Q-2·Q-9 범위 밖 조합(공익수용) + 감가상각비 → 차단", () => {
    expect(() =>
      calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
        commercialBuildingDepreciation: 1_000_000, transferCause: "public_expropriation",
      }), rates),
    ).toThrow(/겸용주택 감가상각비·건물 귀속 양도비: 공익수용/);
  });
});

describe("Step 7 취득가액 리뷰 후속 — F-1 · anchor 부재 분기", () => {
  /**
   * F-1 — 파트 직접 경비(상가분 실비)가 있어도 건물 귀속 양도비를 버리지 않는다.
   *   상가분 실비 300,000 → 취득시 토지 28,000,000 : 건물 42,000,000 → 토지 120,000 / 건물 180,000
   *   건물 = 180,000 + 철거비 상가몫 700,000 = 880,000
   *   건물 차익 56,000,000 − 46,750,000 − 880,000 = 8,370,000 · 장특 6% 502,200 → 7,867,800
   *   토지 차익 84,000,000 − 35,000,000 − 120,000 = 48,880,000 · 장특 10% 4,888,000 → 43,992,000
   *   합계 51,859,800 (수정 전 52,517,800 — 철거비 소실)
   */
  it("[E-14] F-1 파트 모델 — 사례 + 상가분 실비 300,000 → 51,859,800", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, {
      ...BASE, ...APPRAISAL, commercialBuildingDepreciation: 2_250_000, buildingDirectTransferExpense: 1_000_000,
      commercialInheritedExpense: 300_000,
      // 파트 모델에서 경비를 선언하면 취득시 개별주택가격이 필수다(`mixedPartAcqNeeds`) — 가목 12,000,000 + 나목 18,000,000
      acquisitionStandardPrice: { ...BASE.acquisitionStandardPrice, housingPrice: 30_000_000 },
    }, rates);
    expect(r.commercialPart.buildingAppraisalDed).toBe(880_000);
    expect(r.commercialPart.landAppraisalDed).toBe(120_000);
    expect(r.commercialPart.incomeAmount).toBe(51_859_800);
  });

  it("[E-15] F-1 총액 모델(실가) — 상가분 실비가 있어도 철거비 상가몫 700,000이 건물에 더해진다", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
      useActualAcquisition: true, acquisitionActualTotalPrice: 120_000_000,
      commercialInheritedExpense: 300_000, buildingDirectTransferExpense: 1_000_000,
    }), rates);
    expect(r.commercialPart.buildingAppraisalDed).toBe(880_000);
    expect(r.commercialPart.landAppraisalDed).toBe(120_000);
  });

  it("[E-16] 새 안분 × 상속 취득(§163⑨ 신고가액) — 양도가액 주입은 같다", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
      ...APPRAISAL, acquisitionByInheritance: true, housingInheritedValue: 30_000_000, commercialInheritedValue: 70_000_000,
    }), rates);
    expect(r.saleSplit?.basis).toBe("appraisal");
    expect(r.commercialPart.landTransferPrice).toBe(84_000_000);
    expect(r.commercialPart.buildingTransferPrice).toBe(56_000_000);
  });

  it("[E-17] 새 안분 × 감정가액 취득(총액 안분) — 취득가액은 파트별 환산이 아니라 총액 안분", () => {
    const withSplit = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
      ...APPRAISAL, useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 120_000_000,
    }), rates);
    const without = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({
      useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 120_000_000,
    }), rates);
    expect(withSplit.commercialPart.buildingTransferPrice).toBe(56_000_000);
    // 양도가액 안분만 달라지고 취득가액(취득시 기준시가 비율 안분)은 같다
    expect(withSplit.commercialPart.landAcqPrice).toBe(without.commercialPart.landAcqPrice);
    expect(withSplit.commercialPart.buildingAcqPrice).toBe(without.commercialPart.buildingAcqPrice);
  });

  it("[E-18] 새 안분 × 12억 초과 — 고가주택 판정·안분은 합성한 주택분 양도가액(1,500,000,000)으로 한다", () => {
    const r = calcMixedUseTransferTax(5_000_000_000, TRANSFER_DATE, {
      ...BASE, landAppraisalAtTransfer: 3_750_000_000, buildingAppraisalAtTransfer: 2_500_000_000,
    }, rates);
    expect(r.apportionment.housingTransferPrice).toBe(1_500_000_000);
    const h = r.housingPart;
    expect(h.isExempt).toBe(false);
    expect(h.proratedTaxableGain).toBeGreaterThan(0);
    expect(h.proratedTaxableGain).toBeLessThan(h.landTransferGain + h.buildingTransferGain);
  });

  it("[E-19] 새 안분 × 환산 × §97②2호 단서 나목 채택 — 취득가액 0 · 4파트 경비 합 = 공통 양도비", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, conversionAsset({ ...APPRAISAL, transferExpense: 200_000_000 }), rates);
    expect(r.necessaryExpenseProviso?.chosen).toBe("direct");
    const h = r.housingPart;
    const c = r.commercialPart;
    expect(h.landAcqPrice + h.buildingAcqPrice + c.landAcqPrice + c.buildingAcqPrice).toBe(0);
    expect(h.landAppraisalDed + h.buildingAppraisalDed + c.landAppraisalDed + c.buildingAppraisalDed).toBe(200_000_000);
  });
});

