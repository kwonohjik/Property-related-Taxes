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

  // ── §168의11③3호 연환산 (Pre-Do anchor) ──────────────────────────
  it("A1 당해 183일 연환산(2026 평년 365) → 비율 4.99% ≥ 3% 사업용", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 25_000_000,
        currentLandValue: 1_000_000_000,
        currentBusinessDays: 183,
        currentTaxYear: 2026,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // floor(25,000,000 × 365 ÷ 183) = 49,863,387
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(49_863_387);
    expect(r.revenueTestDetail?.annualizationApplied).toBe(true);
    expect(r.revenueTestDetail?.ratioCurrent).toBeCloseTo(0.049863, 5);
    expect(r.revenueTestDetail?.pass).toBe(true);
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("A1b 당해 183일 연환산(2024 윤년 366) → 분자 366 적용", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 25_000_000,
        currentLandValue: 1_000_000_000,
        currentBusinessDays: 183,
        currentTaxYear: 2024, // 윤년
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // floor(25,000,000 × 366 ÷ 183) = 50,000,000 (366/183=2 정확)
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(50_000_000);
    expect(r.revenueTestDetail?.ratioCurrent).toBeCloseTo(0.05, 5);
  });

  it("A2 영위 = 해당연도 총일수(365) → 환산 미적용 raw 그대로", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 40_000_000,
        currentLandValue: 1_000_000_000,
        currentBusinessDays: 365,
        currentTaxYear: 2026,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(40_000_000);
    expect(r.revenueTestDetail?.annualizationApplied).toBe(false);
    expect(r.revenueTestDetail?.ratioCurrent).toBeCloseTo(0.04, 5);
  });

  it("A3 환산 당해가 ②에도 반영 — mineral_spring 직전 full-year", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "mineral_spring",
        currentRevenue: 25_000_000,
        currentLandValue: 1_000_000_000,
        currentBusinessDays: 183,
        currentTaxYear: 2026, // 당해 환산 49,863,387
        priorRevenue: 120_000_000,
        priorLandValue: 1_000_000_000, // 직전 full-year(미환산)
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // ② = (49,863,387 + 120,000,000) / 2,000,000,000 = 0.0849317
    expect(r.revenueTestDetail?.ratioCombined).toBeCloseTo(0.084932, 5);
    expect(r.revenueTestDetail?.actualRatio).toBeCloseTo(0.084932, 5);
    expect(r.revenueTestDetail?.pass).toBe(true);
    expect(r.isNonBusinessLand).toBe(false);
  });

  it("A4 직전 환산(200일·2025 365)이 ②를 뒤집어 사업용", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "vehicle_repair_academy",
        currentRevenue: 40_000_000,
        currentLandValue: 1_000_000_000, // ① = 4% (미달)
        priorRevenue: 100_000_000,
        priorLandValue: 1_000_000_000,
        priorBusinessDays: 200,
        priorTaxYear: 2025,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // 직전 환산 floor(100,000,000 × 365 ÷ 200) = 182,500,000
    expect(r.revenueTestDetail?.annualizedPriorRevenue).toBe(182_500_000);
    // ② = (40,000,000 + 182,500,000) / 2,000,000,000 = 0.111250 ≥ 0.10
    expect(r.revenueTestDetail?.ratioCombined).toBeCloseTo(0.11125, 5);
    expect(r.revenueTestDetail?.pass).toBe(true);
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

  it("A5 매퍼 경로 — 양도일 2026-07-02에서 당해 영위일수 183 자동도출 + 연환산", () => {
    const asset = {
      nblUseDetailedJudgment: true,
      nblLandType: "other_land",
      nblZoneType: "residential",
      acquisitionArea: "1000",
      nblOtherPropertyTaxType: "comprehensive",
      nblRevenueBusinessType: "parking_operation",
      nblRevenueCurrentRevenue: "25,000,000",
      nblRevenueCurrentLandValue: "1,000,000,000",
    };
    const input = mapAssetToNblInput(asset, {
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2026-07-02"), // 1.1~7.2 초일산입 = 183일
      parseDate: (s: string) => {
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? undefined : d;
      },
      parseNumber: (s) => {
        const n = parseFloat(String(s).replace(/,/g, ""));
        return Number.isFinite(n) ? n : undefined;
      },
    });
    expect(input?.revenueTest?.currentBusinessDays).toBe(183);
    expect(input?.revenueTest?.currentTaxYear).toBe(2026);

    const r = judgeNonBusinessLand(input!, DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(49_863_387);
    expect(r.revenueTestDetail?.pass).toBe(true);
    expect(r.isNonBusinessLand).toBe(false);
  });

  // ── §168의11③1호 간주임대료 (Pre-Do anchor) ──────────────────────
  it("D1 간주임대료 — 보증금 10억·임대 365일·2026·31/1000 → 간주 31,000,000", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 0,
        currentLandValue: 1_000_000_000,
        currentDeposit: 1_000_000_000,
        currentRentDays: 365,
        currentTaxYear: 2026,
        currentDeemedRate: { num: 31, den: 1000 },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.deemedRentCurrent).toBe(31_000_000);
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(31_000_000); // 직접0 + 간주
    expect(r.revenueTestDetail?.ratioCurrent).toBeCloseTo(0.031, 5);
    expect(r.revenueTestDetail?.pass).toBe(true);
  });

  it("D1b 간주 + 연환산 결합 — 임대183·영위183·2026 → 이중 floor 30,999,998", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 0,
        currentLandValue: 1_000_000_000,
        currentDeposit: 1_000_000_000,
        currentRentDays: 183,
        currentTaxYear: 2026,
        currentDeemedRate: { num: 31, den: 1000 },
        currentBusinessDays: 183,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.deemedRentCurrent).toBe(15_542_465); // 원 단위 floor
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(30_999_998); // 환산 floor
  });

  it("D2 윤년 — 임대366·2024(366)·31/1000 → 간주 31,000,000 (연일수 약분)", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "parking_operation",
        currentRevenue: 0,
        currentLandValue: 1_000_000_000,
        currentDeposit: 1_000_000_000,
        currentRentDays: 366,
        currentTaxYear: 2024,
        currentDeemedRate: { num: 31, den: 1000 },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.deemedRentCurrent).toBe(31_000_000);
  });

  // ── §168의11③2호 공통수입 안분 (Pre-Do anchor) ────────────────────
  it("E1 당해 공통수입 안분 — 공통 1억 × 6억/(6억+4억) = 60,000,000", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "vehicle_repair_academy",
        currentRevenue: 0,
        currentLandValue: 600_000_000,
        commonRevenue: 100_000_000,
        otherLandValue: 400_000_000,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.commonApportionedCurrent).toBe(60_000_000);
    expect(r.revenueTestDetail?.annualizedCurrentRevenue).toBe(60_000_000);
    expect(r.revenueTestDetail?.ratioCurrent).toBeCloseTo(0.1, 5); // 60M/600M
    expect(r.revenueTestDetail?.pass).toBe(true); // 0.10 ≥ 0.10
  });

  it("E2 직전 공통수입 안분 — 직전 공통 8천만 × 5억/(5억+5억) = 40,000,000 → ②", () => {
    const r = judgeNonBusinessLand(
      otherLandInput({
        businessType: "vehicle_repair_academy",
        currentRevenue: 40_000_000,
        currentLandValue: 1_000_000_000,
        priorRevenue: 0,
        priorLandValue: 500_000_000,
        priorCommonRevenue: 80_000_000,
        priorOtherLandValue: 500_000_000,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.revenueTestDetail?.commonApportionedPrior).toBe(40_000_000);
    // ② = (40,000,000 + 40,000,000) / (1,000,000,000 + 500,000,000) = 0.053333
    expect(r.revenueTestDetail?.ratioCombined).toBeCloseTo(0.053333, 5);
  });
});
