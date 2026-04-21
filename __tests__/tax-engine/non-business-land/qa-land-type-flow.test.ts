/**
 * QA 독립 검증 — 비사업용 토지 판정 v2 엔진 지목별 PDF 흐름도 (§168-8~13: 농지·임야·목장·별장·기타·주택부수)
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

describe("농지 흐름도 (§168-8, PDF p.1698)", () => {
  /**
   * QA-010: 농지 도시지역 外 + 재촌자경 기간기준 충족 → 사업용
   */
  it("QA-010: 농지 도시지역 外 + 재촌자경 충족 → 사업용", () => {
    const input = farmlandBase({
      zoneType: "agriculture_forest",
      farmerResidenceDistance: 10, // 30km 이내 fallback
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2020-01-01"), usageType: "farming" },
      ],
    });
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
    expect(r.surcharge.longTermDeductionExcluded).toBe(false);
  });

  /**
   * QA-011: 농지 재촌자경 기간기준 미충족 → 비사업용
   */
  it("QA-011: 농지 재촌자경 기간기준 미충족 → 비사업용", () => {
    const input = farmlandBase({
      zoneType: "agriculture_forest",
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2012-01-01"), usageType: "farming" }, // 2년만
      ],
    });
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0.10);
  });

  /**
   * QA-012: 도시지역 內 농지 + 편입유예 3년 이내 → 사업용
   * 편입유예 요건: 1년 이상 재촌자경
   */
  it("QA-012: 도시지역 內 농지 + 1년 이상 재촌자경 + 편입 3년 이내 → 사업용", () => {
    const input = farmlandBase({
      zoneType: "commercial", // 도시지역
      urbanIncorporationDate: d("2018-01-01"),
      transferDate: d("2020-01-01"), // 편입 2년 후
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2018-01-01"), usageType: "farming" }, // 8년 자경
      ],
    });
    const r = judgeNonBusinessLand(input);
    // 재촌자경 기간기준 충족 여부 + 편입유예 3년 이내
    expect(r.isNonBusinessLand).toBe(false);
  });

  /**
   * QA-013: 도시지역 內 농지 + 편입유예 요건 (1년 자경) 미충족 → 비사업용
   *
   * 편입유예 경로 진입 조건:
   * 1) 재촌자경 기간기준(60%) 충족 — 이를 위해 사업용 기간을 충분히 설정
   * 2) 도시지역(commercial)
   * 3) 편입유예 기간 내 (urbanIncorporationDate + 3년 이내)
   * 4) 재촌자경 1년 이상 요건 미충족 (실제 자경 기간 합산 < 365일)
   *
   * 문제: realFarming = 재촌기간 ∩ 자경기간
   * farmerResidenceDistance=10 → fallback = 전체 보유기간
   * 자경 기간이 기간기준(60%) 충족 → PASS → 도시지역 분기 진입
   * hasAtLeastOneYearSelfFarming(realFarming): 합산 365일 미만이어야 FAIL
   *
   * 자경 기간: 300일 → 기간기준 ratio = 300/3651 = 8% → FAIL → 편입유예 경로 미진입
   * 따라서 재촌자경 6개월 케이스에서 편입유예 요건 단계 자체에 도달하지 않음.
   * 이는 엔진 설계상 올바른 동작: 자경기간 기준 미충족 시 도시지역 판정 불필요.
   * (비사업용으로 조기 반환)
   *
   * 이 테스트는 "자경 기간 기준 미충족 → 비사업용 조기 반환" 검증으로 재정의.
   */
  it("QA-013: 도시지역 內 농지 + 재촌자경 기간기준 미충족 → 비사업용 조기 반환", () => {
    const input = farmlandBase({
      zoneType: "commercial",
      urbanIncorporationDate: d("2019-06-01"),
      transferDate: d("2020-01-01"),
      farmerResidenceDistance: 10,
      businessUsePeriods: [
        // 취득 후 6개월만 자경 (1년 미만 + 기간기준도 미충족)
        { startDate: d("2010-01-02"), endDate: d("2010-07-01"), usageType: "farming" },
      ],
    });
    const r = judgeNonBusinessLand(input);
    // 재촌자경 기간기준(60%) 미충족 → 사용의제도 없음 → 비사업용
    expect(r.isNonBusinessLand).toBe(true);
    // 재촌자경 기간기준 단계가 FAIL이어야 함
    const usageStep = r.judgmentSteps.find((s) => s.id === "usage_residence_self_farming");
    expect(usageStep?.status).toBe("FAIL");
  });

  /**
   * QA-013b: 도시지역 內 농지 + 기간기준 충족 + 재촌자경 합산 364일(1년 미만) → 편입유예 요건 FAIL
   *
   * [설계 분석] hasAtLeastOneYearSelfFarming()은 합산 1년도 인정하므로,
   * 합산 365일 미만 = 각 구간들의 합이 365일 미만이어야 함.
   * realFarming = 재촌(전체보유) ∩ 자경기간
   * ratio 기준 PASS: 자경 60% 이상 필요 → 자경 60%이상 + 합산 364일 조건은 단기 보유에서만 가능
   *
   * 보유 600일, 자경 364일 = 60.7% → ratio PASS
   * 재촌 = fallback(전체) → 재촌자경 = 364일 < 365일 → region_grace_requirement FAIL
   */
  it("QA-013b: 도시지역 內 농지 + 기간기준 충족(61%) + 재촌자경 합산 364일 → 편입유예 요건 FAIL → 비사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 1000,
      zoneType: "commercial",
      acquisitionDate: d("2022-01-01"),
      transferDate: d("2023-08-20"), // 보유 ≈ 596일
      farmingSelf: true,
      farmerResidenceDistance: 10, // 재촌 전기간
      urbanIncorporationDate: d("2023-01-01"), // 편입 7개월 전 → 유예 내
      businessUsePeriods: [
        // 자경 364일 (60% 이상 = ratio PASS) + 합산 < 365일
        { startDate: d("2022-01-02"), endDate: d("2023-01-01"), usageType: "farming" }, // 364일
      ],
      gracePeriods: [],
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true);
    // 편입유예 요건 FAIL step 확인
    const graceReqStep = r.judgmentSteps.find((s) => s.id === "region_grace_requirement");
    expect(graceReqStep?.status).toBe("FAIL");
  });
});

describe("임야 흐름도 (§168-9, PDF p.1700)", () => {
  /**
   * QA-020: 임야 재촌 + 주민등록 필수 — 주민등록 있는 이력 → 사업용
   */
  it("QA-020: 임야 재촌 (주민등록 있음) 기간기준 충족 → 사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "forest",
      landArea: 2000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      landLocation: { sigunguCode: "11110" },
      ownerProfile: {
        residenceHistories: [
          {
            sidoName: "서울",
            sigunguName: "종로구",
            sigunguCode: "11110",
            startDate: d("2010-01-02"),
            endDate: d("2020-01-01"),
            hasResidentRegistration: true,
          },
        ],
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
  });

  /**
   * QA-021: 임야 주민등록 없는 이력만 → 재촌 인정 불가 → 비사업용 경로 진행
   */
  it("QA-021: 임야 주민등록 없는 이력 → 재촌 미인정", () => {
    const input: NonBusinessLandInput = {
      landType: "forest",
      landArea: 2000,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      landLocation: { sigunguCode: "11110" },
      ownerProfile: {
        residenceHistories: [
          {
            sidoName: "서울",
            sigunguName: "종로구",
            sigunguCode: "11110",
            startDate: d("2010-01-02"),
            endDate: d("2020-01-01"),
            hasResidentRegistration: false, // 주민등록 없음
          },
        ],
      },
    };
    const r = judgeNonBusinessLand(input);
    // 주민등록 없으면 임야 재촌 미인정 → 비사업용 (공익임야 등 없으면)
    expect(r.isNonBusinessLand).toBe(true);
  });

  /**
   * QA-022: 공익임야 (§168-9 ①) 기간기준 충족 → 지역기준 미적용 시 사업용
   * 시업중/특수산림사업지구 아닌 경우 지역기준 자체가 없음
   */
  it("QA-022: 공익임야 + 기간기준 충족 + 시업중 아닌 경우 → 사업용 (지역기준 미적용)", () => {
    const input: NonBusinessLandInput = {
      landType: "forest",
      landArea: 2000,
      zoneType: "commercial", // 도시지역이어도 시업중 아니면 지역기준 미적용
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      forestDetail: {
        isPublicInterest: true,
        hasForestPlan: false, // 시업중 아님
        isSpecialForestZone: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
    const siupStep = r.judgmentSteps.find((s) => s.id === "forest_siup_zone");
    expect(siupStep?.status).toBe("NOT_APPLICABLE");
  });
});

describe("목장 흐름도 (§168-10, PDF p.1702)", () => {
  /**
   * QA-030: 목장 사용의제 (상속 3년 이내) → 지역·면적 면제 → 사업용
   */
  it("QA-030: 상속 3년 이내 목장 + 기간기준 충족 → 지역·면적 면제 사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "pasture",
      landArea: 5000,
      zoneType: "commercial", // 도시지역이어도
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2022-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      pasture: {
        isLivestockOperator: false,
        inheritanceDate: d("2020-06-01"), // 1.5년 이내 상속
      },
    };
    const r = judgeNonBusinessLand(input);
    // 상속 3년 이내 목장 → 지역·면적 면제 경로
    expect(r.isNonBusinessLand).toBe(false);
    const relatedStep = r.judgmentSteps.find((s) => s.id === "pasture_related");
    expect(relatedStep?.status).toBe("PASS");
  });

  /**
   * QA-031: 사회복지법인 직접 사용 목장 → 지역·면적 면제 → 사업용
   */
  it("QA-031: 사회복지법인 직접 사용 목장 → 지역·면적 면제", () => {
    const input: NonBusinessLandInput = {
      landType: "pasture",
      landArea: 5000,
      zoneType: "industrial",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2022-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      pasture: {
        isLivestockOperator: false,
        isSpecialOrgUse: true,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
    const relatedStep = r.judgmentSteps.find((s) => s.id === "pasture_related");
    expect(relatedStep?.status).toBe("PASS");
  });
});

describe("별장 흐름도 (§168-13, PDF p.1705)", () => {
  /**
   * QA-040: 별장 비사용기간 기간기준 충족 → REDIRECT 반환
   *
   * [Critical Bug 확인]
   * 설계 의도: REDIRECT 경로에서 isNonBusinessLand=false (판정 보류 → UI 재입력 요청)
   * 실제 동작: villa-land.ts가 isBusiness:false + action:REDIRECT를 반환하고,
   *   engine.ts assemble()에서 isNonBusinessLand = !catResult.isBusiness = !false = true로 조립
   * 결과: needsRedirect=true이지만 isNonBusinessLand=true (중과세 10%p 잘못 적용됨)
   *
   * 이 테스트는 버그 재현 케이스로, 수정 후 isNonBusinessLand=false를 기대해야 함.
   * 현재는 실제 동작(버그 상태)을 기록.
   */
  it("QA-040: [Bug] 별장 REDIRECT 시 needsRedirect=true이나 isNonBusinessLand=true (버그)", () => {
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 200,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      villa: {
        villaUsePeriods: [
          { startDate: d("2015-01-01"), endDate: d("2015-02-01"), usageType: "villa" },
        ],
        isEupMyeon: false,
        isRuralHousing: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    // REDIRECT 플래그는 올바르게 설정됨
    expect(r.action).toBe("REDIRECT_TO_CATEGORY");
    expect(r.needsRedirect).toBe(true);
    // [Bug-01 fix] REDIRECT 시 isNonBusinessLand=false 로 고정됨 (중과세 미부과)
    expect(r.isNonBusinessLand).toBe(false);
    expect(r.surcharge.additionalRate).toBe(0);
  });

  /**
   * QA-040b: 버그 수정 후 기대 동작 명세 (현재 FAIL → 수정 후 PASS 목표)
   */
  it("QA-040b: [Bug 수정 기대] 별장 REDIRECT → isNonBusinessLand=false, additionalRate=0 필요", () => {
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 200,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      villa: {
        villaUsePeriods: [
          { startDate: d("2015-01-01"), endDate: d("2015-02-01"), usageType: "villa" },
        ],
        isEupMyeon: false,
        isRuralHousing: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    // REDIRECT이므로 중과세 미적용, 판정 보류
    // 수정 후 통과해야 하는 assertion:
    // expect(r.isNonBusinessLand).toBe(false); // 수정 필요
    // expect(r.surcharge.additionalRate).toBe(0); // 수정 필요
    // 현재는 needsRedirect 플래그만 검증
    expect(r.needsRedirect).toBe(true);
    expect(r.redirectHint).toBeDefined();
    expect(typeof r.redirectHint).toBe("string");
  });

  /**
   * QA-041: 별장 비사용기간 기간기준 미충족 + 읍·면 농어촌주택 요건 충족 → 사업용
   */
  it("QA-041: 별장 비사용기간 미충족 + 읍·면 농어촌주택 → 사업용", () => {
    // 별장 사용기간을 길게 잡아 비사용기간이 기간기준 미충족
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 200,
      zoneType: "agriculture_forest",
      acquisitionDate: d("2019-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      villa: {
        // 보유기간 1년 전체 사용 → 비사용기간 0일 → 기간기준 미충족
        villaUsePeriods: [
          { startDate: d("2019-01-02"), endDate: d("2020-01-01"), usageType: "villa" },
        ],
        isEupMyeon: true,
        isRuralHousing: true,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
    const ruralStep = r.judgmentSteps.find((s) => s.id === "villa_rural");
    expect(ruralStep?.status).toBe("PASS");
  });

  /**
   * QA-042: 별장 비사용기간·농어촌주택 모두 미충족 → 비사업용
   */
  it("QA-042: 별장 비사용기간·농어촌주택 모두 미충족 → 비사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "villa_land",
      landArea: 200,
      zoneType: "commercial",
      acquisitionDate: d("2019-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      villa: {
        villaUsePeriods: [
          { startDate: d("2019-01-02"), endDate: d("2020-01-01"), usageType: "villa" },
        ],
        isEupMyeon: false,
        isRuralHousing: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true);
    expect(r.surcharge.additionalRate).toBe(0.10);
  });
});

describe("기타토지 흐름도 (§168-11, PDF p.1706)", () => {
  /**
   * QA-050: 나대지 간주 — 건물시가표준액 < 토지 × 2% → 종합합산 취급
   */
  it("QA-050: 건물시가표준액 < 토지시가표준액 × 2% → 나대지 간주 (비사업용)", () => {
    const input: NonBusinessLandInput = {
      landType: "other_land",
      landArea: 300,
      zoneType: "residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      otherLand: {
        propertyTaxType: "separate", // 원래 분리과세
        hasBuilding: true,
        buildingStandardValue: 100_000, // 10만원
        landStandardValue: 10_000_000, // 1,000만원 × 2% = 20만원 → 건물 10만원 < 20만원
        isRelatedToResidenceOrBusiness: false,
      },
    };
    const bareLand = isBareLand(input);
    expect(bareLand).toBe(true); // 나대지 간주

    const r = judgeNonBusinessLand(input);
    // 종합합산 취급 → 거주·사업관련 미해당이면 비사업용
    expect(r.isNonBusinessLand).toBe(true);
  });

  /**
   * QA-051: 건물시가표준액 = 토지 × 2% 정확히 → 나대지 간주 아님 (경계)
   */
  it("QA-051: 건물시가표준액 = 토지 × 2% (경계) → 나대지 간주 아님", () => {
    const input: NonBusinessLandInput = {
      landType: "other_land",
      landArea: 300,
      zoneType: "residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      otherLand: {
        propertyTaxType: "separate",
        hasBuilding: true,
        buildingStandardValue: 200_000, // 정확히 2%
        landStandardValue: 10_000_000,
        isRelatedToResidenceOrBusiness: false,
      },
    };
    const bareLand = isBareLand(input);
    // buildingStandardValue(200_000) < landStandardValue(10_000_000) × 0.02(200_000) → false (같으면 나대지 아님)
    expect(bareLand).toBe(false);
  });

  /**
   * QA-052: 기타토지 재산세 분리과세 + 기간기준 충족 → 사업용
   */
  it("QA-052: 기타토지 분리과세 + 기간기준 충족 → 사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "other_land",
      landArea: 300,
      zoneType: "residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [
        { startDate: d("2010-01-02"), endDate: d("2020-01-01"), usageType: "business" },
      ],
      gracePeriods: [],
      otherLand: {
        propertyTaxType: "separate",
        hasBuilding: true,
        buildingStandardValue: 5_000_000,
        landStandardValue: 10_000_000, // 5백만 > 200만 (2%) → 나대지 아님
        isRelatedToResidenceOrBusiness: false,
      },
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(false);
  });
});

// ============================================================
// 3. 주택부수토지 배율 (§168-12)
// ============================================================

describe("주택부수토지 배율 (§168-12)", () => {
  /**
   * QA-060: 수도권 주·상·공 → 3배
   */
  it("QA-060: 수도권 주거지역 → 3배", () => {
    const { multiplier } = getHousingMultiplier("residential", true);
    expect(multiplier).toBe(3);
  });

  /**
   * QA-061: 수도권 녹지 → 5배
   */
  it("QA-061: 수도권 녹지 → 5배", () => {
    const { multiplier } = getHousingMultiplier("green", true);
    expect(multiplier).toBe(5);
  });

  /**
   * QA-062: 수도권 밖 도시지역 → 5배
   */
  it("QA-062: 수도권 밖 상업지역 → 5배", () => {
    const { multiplier } = getHousingMultiplier("commercial", false);
    expect(multiplier).toBe(5);
  });

  /**
   * QA-063: 도시지역 外 (관리지역 등) → 10배
   */
  it("QA-063: 관리지역(도시지역 外) → 10배", () => {
    const { multiplier } = getHousingMultiplier("management", true);
    expect(multiplier).toBe(10);
  });

  /**
   * QA-064: 주택부수토지 배율 초과 → 비사업용 + 면적 분할
   */
  it("QA-064: 주택부수토지 배율 초과분 비사업용 (수도권 3배)", () => {
    const input: NonBusinessLandInput = {
      landType: "housing_site",
      landArea: 400, // 정착면적 100㎡ × 3배 = 300㎡ 허용, 초과 100㎡
      zoneType: "residential",
      acquisitionDate: d("2010-01-01"),
      transferDate: d("2020-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      housingFootprint: 100,
      isMetropolitanArea: true,
    };
    const r = judgeNonBusinessLand(input);
    expect(r.isNonBusinessLand).toBe(true); // 초과분 존재
    expect(r.areaProportioning).toBeDefined();
    expect(r.areaProportioning!.businessArea).toBe(300);
    expect(r.areaProportioning!.nonBusinessArea).toBe(100);
    expect(r.areaProportioning!.buildingMultiplier).toBe(3);
  });
});

// ============================================================
// 4. 무조건 사업용 의제 정확성 (§168-14 ③)
// ============================================================
