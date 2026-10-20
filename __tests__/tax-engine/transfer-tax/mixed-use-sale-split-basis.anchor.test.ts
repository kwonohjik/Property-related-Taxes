/**
 * anchor: 겸용주택 일괄양도 — 양도가액 토지·건물 안분 기준(감정가액) + 상가건물 감가상각비 + 건물 귀속 양도비
 *
 * 계획서: `docs/00-pm/mixed-use-sale-split-basis.plan.md` §1(사례·목표값) · §4.2(안분 순서) · §9.2(대조군)
 * 사례: 교재 p.772 — 단층 겸용주택(주택 30㎡ / 상가 70㎡) + 부수토지 400㎡(도시지역 밖) 일괄양도.
 *
 * ── 안분 (Q-1 확정: 2차 = 양도시 기준시가 비율) ─────────────────────────
 *   1차 토지:건물 = 감정가액 150,000,000 : 100,000,000 (「부가가치세법 시행령」 §64①1호 단서)
 *        → 토지 120,000,000 / 건물 80,000,000
 *   2차 건물 = 나목 27,000,000 : 상가건물 63,000,000 = 30 : 70 → 상가건물 56,000,000
 *        토지 = 공시지가 동일 → 부수토지 면적 120 : 280 → 상가토지 84,000,000
 *
 * ── 목표값 (교재 해답) ─────────────────────────────────────────────────
 *   상가 건물: 양도 56,000,000 − 취득 46,750,000(70,000,000×70% − 감가상각 2,250,000) − 철거비 700,000
 *             = 8,550,000 · 장특 6%(3년) 513,000 → 8,037,000
 *   상가 토지: 양도 84,000,000 − 취득 35,000,000 = 49,000,000 · 장특 10%(5년) 4,900,000 → 44,100,000
 *   합계 52,137,000 · 주택분 60,000,000(≤12억) 비과세
 *
 * ── 입력 축 이름 (계획서 §4.2 — Step 1에서 타입에 추가) ─────────────────
 *   landAppraisalAtTransfer · buildingAppraisalAtTransfer · commercialBuildingDepreciation ·
 *   buildingDirectTransferExpense (`types/transfer-mixed-use-sale-split.types.ts`)
 *
 * 기준시가 입력은 「㎡당 기준시가 동일」 전제로 사례 총액에서 역산했다:
 *   양도시 건물 90,000,000 → 나목 27,000,000(30%) / 상가건물 63,000,000(70%) · 토지 100,000,000 / 400㎡ = 250,000/㎡
 *   개별주택가격 = 27,000,000 + 250,000 × 120㎡ = 57,000,000
 *   취득시 건물 60,000,000 → 나목 18,000,000 / 상가건물 42,000,000 · 토지 40,000,000 / 400㎡ = 100,000/㎡
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { makeMockRates } from "../_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const rates = makeMockRates();
const TRANSFER_DATE = new Date("2026-07-01");
const TOTAL = 200_000_000;

function caseAsset(extra: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 30,
    nonResidentialFloorArea: 70,
    buildingFootprintArea: 100,
    totalLandArea: 400,
    landAcquisitionDate: new Date("2020-12-01"),
    buildingAcquisitionDate: new Date("2023-03-20"),
    transferStandardPrice: {
      housingPrice: 57_000_000,
      housingBuildingPrice: 27_000_000,
      commercialBuildingPrice: 63_000_000,
      landPricePerSqm: 250_000,
    },
    acquisitionStandardPrice: {
      housingPrice: 0,
      housingBuildingPrice: 18_000_000,
      commercialBuildingPrice: 42_000_000,
      landPricePerSqm: 100_000,
      landPricePerSqmAtBuildingAcq: 100_000,
    },
    separateAcquisition: {
      landMode: "actual",
      buildingMode: "actual",
      landAcquisitionPrice: 50_000_000,
      buildingAcquisitionPrice: 70_000_000,
    },
    residencePeriodYears: 3,
    isMetropolitanArea: false,
    zoneType: "agriculture_forest",
    isOneHouseExempt: true,
    ...extra,
  };
}

/** 사례 전체 입력 — 감정가액 + 감가상각비 + 건물 귀속 양도비(철거비). */
const FULL: Partial<MixedUseAssetInput> = {
  landAppraisalAtTransfer: 150_000_000,
  buildingAppraisalAtTransfer: 100_000_000,
  commercialBuildingDepreciation: 2_250_000,
  buildingDirectTransferExpense: 1_000_000,
};

describe("겸용 일괄양도 안분 기준 — 사례 p.772 anchor", () => {
  it("[SB-0 대조군] 새 입력 없음 = 현행 기준시가 안분 그대로 (회귀 0 고정 — 계획서 §9.2)", () => {
    // 철거비를 공통 양도비로 넣은 현행 실측값(계획서 §3.3). 새 분기가 기본 경로로 새면 이것이 깨진다.
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, caseAsset({ transferExpense: 1_000_000 }), rates);
    expect(r.apportionment.housingTransferPrice).toBe(60_000_000);
    expect(r.commercialPart.landTransferPrice).toBe(73_684_210);
    expect(r.commercialPart.buildingTransferPrice).toBe(66_315_790);
    expect(r.commercialPart.incomeAmount).toBe(50_449_370);
  });

  it("[SB-1] 양도가액 — 감정가액 1차(토지:건물) → 기준시가 2차(주택:상가)", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, caseAsset({
      landAppraisalAtTransfer: FULL.landAppraisalAtTransfer,
      buildingAppraisalAtTransfer: FULL.buildingAppraisalAtTransfer,
    }), rates);
    expect(r.housingPart.isExempt).toBe(true);
    expect(r.apportionment.housingTransferPrice).toBe(60_000_000);
    expect(r.commercialPart.buildingTransferPrice).toBe(56_000_000);
    expect(r.commercialPart.landTransferPrice).toBe(84_000_000);
  });

  it("[SB-2] 취득가액 — 상가건물 감가상각비(§97③) 차감", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, caseAsset(FULL), rates);
    expect(r.commercialPart.buildingAcqPrice).toBe(46_750_000);
    expect(r.commercialPart.landAcqPrice).toBe(35_000_000);
  });

  it("[SB-3] 철거비 — 건물에 직접 귀속(§100② 후단 「공통되는」 반대해석) → 상가건물 700,000", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, caseAsset(FULL), rates);
    expect(r.commercialPart.buildingAppraisalDed).toBe(700_000);
    expect(r.commercialPart.landAppraisalDed).toBe(0);
  });

  it("[SB-4] 양도차익·장특·양도소득금액 = 52,137,000", () => {
    const r = calcMixedUseTransferTax(TOTAL, TRANSFER_DATE, caseAsset(FULL), rates);
    const c = r.commercialPart;
    expect(c.buildingTransferGain).toBe(8_550_000);
    expect(c.landTransferGain).toBe(49_000_000);
    expect(c.partLthd?.building.longTermRate).toBe(0.06);
    expect(c.partLthd?.building.longTermDeduction).toBe(513_000);
    expect(c.partLthd?.land.longTermRate).toBe(0.1);
    expect(c.partLthd?.land.longTermDeduction).toBe(4_900_000);
    expect(c.incomeAmount).toBe(52_137_000);
    expect(r.housingPart.incomeAmount).toBe(0);
  });
});
