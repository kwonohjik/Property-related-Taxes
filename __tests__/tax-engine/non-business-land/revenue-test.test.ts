/**
 * §168의11② 수입금액비율 테스트 — judgeOtherLand revenue step
 *
 * Pre-Do: 현재 judgeOtherLand가 input.revenueTest를 안 읽음 → revenue 제공해도 비사업용(미판정).
 * 본 anchor는 비율 ≥ 율 시 사업용 전환 + revenueTestDetail 산출을 단언(R1 현재 FAIL).
 *
 * 법령: §168의11②(max(당해비율, (당해+직전)/(당해+직전))) + §83의4 율(주차장3%·블록20%·정비학원10%).
 */
import { describe, it, expect } from "vitest";

import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land";
import { mapAssetToNblInput } from "@/lib/tax-engine/non-business-land/form-mapper";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type {
  NonBusinessLandInput,
  RevenueTestInput,
} from "@/lib/tax-engine/non-business-land/types";

function otherLandInput(revenueTest?: RevenueTestInput): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 1000,
    zoneType: "residential",
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2026-06-01"),
    businessUsePeriods: [],
    gracePeriods: [],
    otherLand: {
      propertyTaxType: "comprehensive", // 종합합산 → revenue 없으면 비사업용
      hasBuilding: true,
      buildingStandardValue: 100_000_000, // 토지 2% 초과 → 나대지 아님
      landStandardValue: 1_000_000_000,
      isRelatedToResidenceOrBusiness: false,
    },
    revenueTest,
  };
}

describe("[NBL-REVENUE] §168의11② 수입금액비율", () => {
  it("R0 revenueTest 미제공 → 종합합산 비사업용 (baseline)", () => {
    const r = judgeNonBusinessLand(otherLandInput(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.revenueTestDetail).toBeUndefined();
  });

  it("R1 주차장운영업 비율 5% ≥ 3% → 사업용 전환", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 50_000_000,
        currentLandValue: 1_000_000_000,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isNonBusinessLand).toBe(false); // 현재 true (FAIL — revenue 미판정)
    expect(r.revenueTestDetail?.pass).toBe(true);
    expect(r.revenueTestDetail?.threshold).toBe(0.03);
    expect(r.revenueTestDetail?.actualRatio).toBeCloseTo(0.05, 5);
  });

  it("R2 블록제조업 비율 10% < 20% → 미달 비사업용", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "block_stone_pipe_mfg",
        currentRevenue: 100_000_000,
        currentLandValue: 1_000_000_000,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.revenueTestDetail?.pass).toBe(false);
    expect(r.revenueTestDetail?.threshold).toBe(0.20);
  });

  it("R3 2기간 max — 당해 8% / 합산 11% → max 11% ≥ 10% 사업용", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "vehicle_repair_academy",
        currentRevenue: 80_000_000,
        currentLandValue: 1_000_000_000, // 당해 비율 8%
        priorRevenue: 140_000_000,
        priorLandValue: 1_000_000_000, // 합산 (80+140)/(1000+1000)=11%
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.ratioCurrent).toBeCloseTo(0.08, 5);
    expect(r.revenueTestDetail?.ratioCombined).toBeCloseTo(0.11, 5);
    expect(r.revenueTestDetail?.actualRatio).toBeCloseTo(0.11, 5); // max
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("R5 입력경로 — nblRevenue* asset → mapAssetToNblInput → revenueTest → 사업용", () => {
    const asset = {
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "residential",
      acquisitionArea: "1000",
      nblOtherPropertyTaxType: "comprehensive",
      nblRevenueBusinessType: "parking_operation",
      nblRevenueCurrentRevenue: "50,000,000",
      nblRevenueCurrentLandValue: "1,000,000,000",
    };
    const input = mapAssetToNblInput(asset, {
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2026-06-01"),
      parseDate: () => undefined,
      parseNumber: (s) => {
        const n = parseFloat(String(s).replace(/,/g, ""));
        return Number.isFinite(n) ? n : undefined;
      },
    });
    expect(input?.revenueTest?.businessType).toBe("parking_operation");
    expect(input?.revenueTest?.currentRevenue).toBe(50_000_000);

    const r = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.revenueTestDetail?.pass).toBe(true);
  });
});
