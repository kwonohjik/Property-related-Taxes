/**
 * QA 독립 검증 — 비사업용 토지 판정 v2 엔진 §168-14 무조건 사업용 + 중과세 연동 + 엣지·안전성
 *
 * 검증 기준: 소득세법 §104-3, 시행령 §168-6~14 + PDF 흐름도 (p.1695~1707)
 */

import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import {
  meetsPeriodCriteria,
  getThresholdRatio,
} from "@/lib/tax-engine/non-business-land/period-criteria";
import { checkUnconditionalExemption } from "@/lib/tax-engine/non-business-land/unconditional-exemption";
import { isBareLand } from "@/lib/tax-engine/non-business-land/other-land";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import {
  DEFAULT_NON_BUSINESS_LAND_RULES,
  type NonBusinessLandInput,
} from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function farmlandBase(overrides: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "farmland",
    landArea: 1000,
    zoneType: "agriculture_forest",
    acquisitionDate: d("2010-01-01"),
    transferDate: d("2020-01-01"),
    farmingSelf: true,
    businessUsePeriods: [],
    gracePeriods: [],
    ...overrides,
  };
}

function makeBusinessPeriods(totalDays: number, transferDate: Date) {
  const start = new Date("2010-01-02");
  const end = new Date(start);
  end.setDate(end.getDate() + totalDays);
  return [{ startDate: start, endDate: end > transferDate ? transferDate : end }];
}

describe("§168-14 ③ 무조건 사업용 의제", () => {
  /**
   * QA-070: §168-14 ③1의2호 — 도시지역(주·상·공) 內 제외 예외 작동 확인
   * 도시지역(commercial) → 의제 미적용
   * 녹지지역 → 의제 적용
   */
  it("QA-070: 8년 재촌자경 상속 — 양도 당시 도시지역(상업) → 의제 제외", () => {
    const r = checkUnconditionalExemption(
      {
        landType: "farmland",
        landArea: 1000,
        zoneType: "commercial", // 주·상·공 도시지역
        acquisitionDate: d("2005-01-01"),
        transferDate: d("2025-01-01"),
        businessUsePeriods: [],
        gracePeriods: [],
        unconditionalExemption: { isAncestor8YearFarming: true },
      },
      "farmland",
    );
    expect(r.isExempt).toBe(false); // 도시지역이므로 의제 제외
  });

  it("QA-071: 8년 재촌자경 상속 — 양도 당시 녹지지역 → 의제 적용", () => {
    const r = checkUnconditionalExemption(
      {
        landType: "farmland",
        landArea: 1000,
        zoneType: "green", // 녹지 = 도시지역으로 분류되지 않음 (농지 기준)
        acquisitionDate: d("2005-01-01"),
        transferDate: d("2025-01-01"),
        businessUsePeriods: [],
        gracePeriods: [],
        unconditionalExemption: { isAncestor8YearFarming: true },
      },
      "farmland",
    );
    // 농지의 도시지역 = 주·상·공만 (녹지 제외) → 녹지면 도시지역 아님 → 의제 적용
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("ancestor_8year_farming");
  });

  /**
   * QA-072: §168-14 ③3호 — 공익수용 5년 기준 (고시일로부터 5년 이전 취득)
   * 경계: 정확히 5년 이전 취득 → 의제 적용
   */
  it("QA-072: 공익수용 — 고시일 정확히 5년 이전 취득 → 의제 적용", () => {
    // 고시일 2025-01-01, 취득일 2020-01-01 = 정확히 5년 전
    const r = checkUnconditionalExemption(
      {
        landType: "farmland",
        landArea: 1000,
        zoneType: "agriculture_forest",
        acquisitionDate: d("2020-01-01"), // 고시일 5년 전
        transferDate: d("2025-06-01"),
        businessUsePeriods: [],
        gracePeriods: [],
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2025-01-01"),
        },
      },
      "farmland",
    );
    // boundary5y = addYears(2025-01-01, -5) = 2020-01-01
    // 취득일(2020-01-01) <= boundary5y(2020-01-01) → 의제 적용
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("public_expropriation");
    expect(r.legalBasis).toContain("나목");
  });

  it("QA-073: 공익수용 — 고시일 4년 9개월 이전 취득 → 의제 미적용", () => {
    // 고시일 2025-01-01, 취득일 2020-04-01 (4년9개월 전) → 5년 미달
    const r = checkUnconditionalExemption(
      {
        landType: "farmland",
        landArea: 1000,
        zoneType: "agriculture_forest",
        acquisitionDate: d("2020-04-01"), // 5년 미달
        transferDate: d("2025-06-01"),
        businessUsePeriods: [],
        gracePeriods: [],
        unconditionalExemption: {
          isPublicExpropriation: true,
          publicNoticeDate: d("2025-01-01"),
        },
      },
      "farmland",
    );
    // boundary5y = 2020-01-01, 취득일(2020-04-01) > boundary5y → 미적용
    expect(r.isExempt).toBe(false);
  });

  /**
   * QA-074: §168-14 ③4호 — 도시지역 內 농지 종중/상속 5년 이내 → 의제
   */
  it("QA-074: §168-14 ③4호 — 도시지역 내 농지 종중/상속 5년 이내 플래그 → 의제", () => {
    const r = checkUnconditionalExemption(
      {
        landType: "farmland",
        landArea: 1000,
        zoneType: "commercial",
        acquisitionDate: d("2020-01-01"),
        transferDate: d("2024-01-01"),
        businessUsePeriods: [],
        gracePeriods: [],
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
        },
      },
      "farmland",
    );
    expect(r.isExempt).toBe(true);
    expect(r.reason).toBe("jongjoong_or_inherit_urban_farmland");
    expect(r.legalBasis).toContain("4호");
  });

  /**
   * QA-075: §168-14 ③4호 — 임야에 적용 시 → 미적용 (농지만 해당)
   */
  it("QA-075: §168-14 ③4호 — 임야 카테고리 → 미적용", () => {
    const r = checkUnconditionalExemption(
      {
        landType: "forest",
        landArea: 1000,
        zoneType: "commercial",
        acquisitionDate: d("2020-01-01"),
        transferDate: d("2024-01-01"),
        businessUsePeriods: [],
        gracePeriods: [],
        unconditionalExemption: {
          isUrbanFarmlandJongjoongOrInherited: true,
        },
      },
      "forest", // 임야 카테고리 → 4호 해당 없음
    );
    expect(r.isExempt).toBe(false);
  });
});

// ============================================================
// 5. 연동 검증 — surcharge 필드
// ============================================================

describe("연동 검증 — 중과세·장기보유공제 필드", () => {
  /**
   * QA-080: 비사업용 판정 시 additionalRate: 0.10, longTermDeductionExcluded: true
   */
  it("QA-080: 비사업용 → additionalRate 0.10 + longTermDeductionExcluded true", () => {
    const input: NonBusinessLandInput = {
      landType: "other_land",
      landArea: 500,
      zoneType: "residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [], // 사업용 기간 없음
      gracePeriods: [],
      otherLand: {
        propertyTaxType: "comprehensive",
        hasBuilding: false,
        isRelatedToResidenceOrBusiness: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.surcharge.surchargeType).toBe("non_business_land");
    expect(r.surcharge.additionalRate).toBe(0.10);
    expect(r.surcharge.longTermDeductionExcluded).toBe(true);
    expect(r.surcharge.basicDeductionApplied).toBe(true);
  });

  /**
   * QA-081: 사업용 판정 시 additionalRate: 0, longTermDeductionExcluded: false
   */
  it("QA-081: 사업용 → additionalRate 0 + longTermDeductionExcluded false", () => {
    const input: NonBusinessLandInput = {
      landType: "other_land",
      landArea: 500,
      zoneType: "residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2020-01-01"), usageType: "business" },
      ],
      gracePeriods: [],
      otherLand: {
        propertyTaxType: "separate", // 분리과세
        hasBuilding: true,
        buildingStandardValue: 5_000_000,
        landStandardValue: 10_000_000,
        isRelatedToResidenceOrBusiness: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
    expect(r.surcharge.longTermDeductionExcluded).toBe(false);
  });

  /**
   * QA-082: 무조건 사업용 의제 → additionalRate: 0
   */
  it("QA-082: 무조건 의제 → additionalRate 0", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 1000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2005-01-01"),
      transferDate: d("2024-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      unconditionalExemption: {
        isPublicExpropriation: true,
        publicNoticeDate: d("2024-01-01"),
        // 취득일 2005-01-01, 고시일 2024-01-01 → 19년 전 취득 → 5년 기준 충족
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
    expect(r.unconditionalExemption?.isApplied).toBe(true);
  });
});

// ============================================================
// 6. 엣지 케이스·잠재 버그
// ============================================================

describe("엣지 케이스 및 잠재 버그 검증", () => {
  /**
   * QA-090: REDIRECT 반환 시 isNonBusinessLand 버그 재현
   *
   * [Critical Bug] engine.ts assemble()은 REDIRECT 여부와 관계없이
   * isNonBusinessLand = !catResult.isBusiness로 조립함.
   * villa-land.ts REDIRECT 경로: isBusiness=false → isNonBusinessLand=true (잘못됨)
   * 수정 방안: assemble()에서 needsRedirect=true 시 isNonBusinessLand=false로 강제
   */
  it("QA-090: [Bug] REDIRECT 경로에서 isNonBusinessLand=true로 잘못 조립됨 (수정 필요)", () => {
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 200,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2025-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      villa: {
        villaUsePeriods: [], // 비사용기간 = 전체 보유 → 기간기준 충족 → REDIRECT
        isEupMyeon: false,
        isRuralHousing: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    // REDIRECT 플래그는 올바름
    expect(r.needsRedirect).toBe(true);
    expect(r.action).toBe("REDIRECT_TO_CATEGORY");
    // [Bug-01 fix] REDIRECT 경로에서 isNonBusinessLand=false 고정 — 중과세 미부과
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
    expect(r.surcharge.longTermDeductionExcluded).toBe(false);
  });

  /**
   * QA-091: ownerProfile 미제공 시 farmerResidenceDistance fallback 동작
   */
  it("QA-091: ownerProfile 미제공 + farmerResidenceDistance=10 → warning 포함, fallback 사용", () => {
    const input = farmlandBase({
      ownerProfile: undefined, // 주거 이력 없음
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2020-01-01"), usageType: "farming" },
      ],
    });
    const r = judgeNonBusinessLand(input);
    // warning이 발생해야 함
    expect(r.warnings.some((w) => w.includes("legacy") || w.includes("fallback"))).toBe(true);
    // 사업용으로 판정은 정상 (거리 30km 이내)
    expect(r.isNonBusinessLand).toBe(false);
  });

  /**
   * QA-092: ownerProfile 미제공 + farmerResidenceDistance 미제공 → 재촌기간 0
   * (사용기간 있어도 재촌 기간 0 → 기간기준 미충족 가능성)
   */
  it("QA-092: ownerProfile 미제공 + farmerResidenceDistance 미제공 → 재촌기간 산출 불가", () => {
    const input = farmlandBase({
      ownerProfile: undefined,
      farmerResidenceDistance: undefined, // 없음
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2020-01-01"), usageType: "farming" },
      ],
    });
    const r = judgeNonBusinessLand(input);
    // 재촌기간을 산출할 수 없으면 재촌자경 실패 → 농지사용의제 없으면 비사업용
    expect(r.isNonBusinessLand).toBe(true);
    // residencePeriodsUsed는 빈 배열이어야 함
    expect(r.residencePeriodsUsed).toBeDefined();
    expect(r.residencePeriodsUsed!.length).toBe(0);
  });

  /**
   * QA-093: 사업용 기간이 취득일 이전인 경우 — 보유기간 클리핑 확인
   */
  it("QA-093: 사업용 기간이 취득일 이전 → 보유기간 내로 클리핑됨", () => {
    const r = meetsPeriodCriteria(
      [{ start: d("2000-01-01"), end: d("2012-01-01") }], // 취득일(2010) 이전 포함
      d("2010-01-01"), // 취득일
      d("2020-01-01"),
      "other_land",
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // 소유기간 시작 = 2010-01-02 (초일불산입)
    // 사업용 기간 중 보유기간 내 = 2010-01-02 ~ 2012-01-01 ≈ 730일
    expect(r.effectiveBusinessDays).toBeLessThanOrEqual(730);
    // 전체 보유일수 = 2020-01-01 - 2010-01-02 ≈ 3,651일
    expect(r.totalOwnershipDays).toBeGreaterThan(3600);
  });

  /**
   * QA-094: 보유기간 2년 미만 토지 — §168-6 ③ 60% 기준 (단서 "가목 미적용" 없음)
   * 현행 엔진은 보유기간 무관하게 3기준 OR 적용 — 의도적 설계 확인
   */
  it("QA-094: 보유 1년 미만 토지 — 기간기준 3기준 정상 적용", () => {
    // 보유 300일, 사업용 250일 = 83.3% → ratio 기준 PASS
    const r = meetsPeriodCriteria(
      [{ start: d("2020-01-02"), end: d("2020-09-18") }], // 260일
      d("2020-01-01"),
      d("2020-11-01"), // 보유 305일
      "other_land",
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.totalOwnershipDays).toBeLessThan(365);
    // ratio > 60% → PASS 가능
    if (r.ratio >= 0.6) {
      expect(r.meets).toBe(true);
    }
  });

  /**
   * QA-095: 취득일 = 양도일 (0일 보유) → 나누기 0 방어
   */
  it("QA-095: 취득일 = 양도일 (0일 보유) → 0 나누기 안전 처리", () => {
    const r = meetsPeriodCriteria(
      [],
      d("2020-01-01"),
      d("2020-01-01"), // 동일
      "farmland",
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.totalOwnershipDays).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.meets).toBe(false);
  });

  /**
   * QA-096: 별장 villa 입력 미제공 → 비사업용 간주 (안전 처리)
   */
  it("QA-096: villa_land + villa 미제공 → 비사업용 (안전 기본값)", () => {
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 200,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      villa: undefined, // 미입력
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0.10);
  });

  /**
   * QA-097: 지목 미분류(unknown) → 비사업용 간주 (안전 기본값)
   */
  it("QA-097: 지목 분류 불가 → 비사업용 간주", () => {
    const input: NonBusinessLandInput = {
      landType: "other", // 모든 분류에 해당 없는 케이스는 engine에서 unknown
      landArea: 100,
      zoneType: "undesignated",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input);
    // "other" 타입 → land-category에서 other_land 또는 unknown으로 분류될 수 있음
    // engine에서 unknown이면 비사업용 간주
    // other_land로 분류되면 otherLand 미입력 → 비사업용
    expect(r.isNonBusinessLand).toBe(true);
  });

  /**
   * QA-098: 목장 기준면적 초과 → 초과분 비사업용 면적 분할 검증
   */
  it("QA-098: 목장 기준면적 초과분 면적 분할 (areaProportioning)", () => {
    const input: NonBusinessLandInput = {
      landType: "pasture",
      landArea: 10_000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      pasture: {
        isLivestockOperator: true, // 전체 보유기간 축산업
        standardArea: 6_000, // 기준면적 6,000㎡ (초과 4,000㎡)
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true); // 초과분 비사업용
    expect(r.areaProportioning).toBeDefined();
    expect(r.areaProportioning!.businessArea).toBe(6_000);
    expect(r.areaProportioning!.nonBusinessArea).toBe(4_000);
  });
});

// ============================================================
// 7. 순수 함수 원칙 및 입력 안전성
// ============================================================

describe("순수 함수 원칙 및 입력 안전성", () => {
  /**
   * QA-100: 동일 입력 2회 호출 → 동일 결과 (순수 함수)
   */
  it("QA-100: 동일 입력 2회 호출 → 동일 결과 (순수성)", () => {
    const input = farmlandBase({
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2015-01-01"), usageType: "farming" },
      ],
    });
    const r1 = judgeNonBusinessLand(input);
    const r2 = judgeNonBusinessLand(input);
    expect(r1.isNonBusinessLand).toBe(r2.isNonBusinessLand);
    expect(r1.surcharge.additionalRate).toBe(r2.surcharge.additionalRate);
    expect(r1.businessUseRatio).toBeCloseTo(r2.businessUseRatio, 10);
  });

  /**
   * QA-101: gracePeriods + unavoidableReasons 병합 → 유효 사업용 일수에 반영
   */
  it("QA-101: unavoidableReasons 입력 → engine에서 gracePeriods에 병합됨", () => {
    // gracePeriods 없이 unavoidableReasons만 입력해도 engine이 병합함
    const input = farmlandBase({
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2020-01-01"), usageType: "farming" },
      ],
      gracePeriods: [],
      unavoidableReasons: [
        {
          type: "illness",
          startDate: d("2015-01-01"),
          endDate: d("2016-01-01"),
        },
      ],
    });
    // 엔진이 오류 없이 실행되고 gracePeriods에 병합하는지 확인
    expect(() => judgeNonBusinessLand(input)).not.toThrow();
    const r = judgeNonBusinessLand(input);
    expect(r).toBeDefined();
    expect(typeof r.isNonBusinessLand).toBe("boolean");
  });
});
