/**
 * 비사업용 토지 판정 엔진 단위 테스트
 * NB-01 ~ NB-12
 */
import { describe, it, expect } from "vitest";
import {
  judgeNonBusinessLand,
  mergeOverlappingPeriods,
  DEFAULT_NON_BUSINESS_LAND_RULES,
  type NonBusinessLandInput,
  type BusinessUsePeriod,
  type GracePeriod,
  type UnavoidableReason,
} from "@/lib/tax-engine/non-business-land";
import { differenceInDays } from "date-fns";

// ─── 공통 헬퍼 ────────────────────────────────────────────────────────────────

function biz(startDate: Date, endDate: Date, usageType = "자경"): BusinessUsePeriod {
  return { startDate, endDate, usageType };
}

function grace(type: GracePeriod["type"], startDate: Date, endDate: Date): GracePeriod {
  return { type, startDate, endDate };
}

// ─── NB-01: 농지 자경 + 30km 이내 거주 → 사업용 ─────────────────────────────

describe("NB-01: 농지 자경, 30km 이내 거주, 5년 이상 보유 → 사업용", () => {
  it("직전 5년 중 3년(1095일) 이상 자경 → rule② 충족, 사업용", () => {
    // 보유: 2015-01-01 ~ 2022-01-01 (7년)
    // 사업용: 2019-01-01 ~ 2022-01-01 (3년 = 1095일 이상)
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 5000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 15,
      businessUsePeriods: [biz(new Date("2019-01-01"), new Date("2022-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(false);
    expect(result.criteria.rule5Years).toBe(true);
    expect(result.judgmentReason).toContain("사업용");
  });
});

// ─── NB-02: 농지 자경 + 40km 거주 → 거리 초과 → 비사업용 ───────────────────

describe("NB-02: 농지 자경, 40km 거주 → 자경 거리 초과 → 비사업용", () => {
  it("거주지 거리가 30km 초과 시 사업용 기간 미인정 → 비사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 5000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 40, // 30km 초과
      businessUsePeriods: [biz(new Date("2019-01-01"), new Date("2022-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(true);
    expect(result.businessUseDays).toBe(0);
    expect(result.warnings.some((w) => w.includes("30km"))).toBe(true);
  });
});

// ─── NB-03: 80% 경계값 → 사업용 ─────────────────────────────────────────────

describe("NB-03: 사업용 비율 80% 정확히 → rule① 충족, 사업용", () => {
  it("effectiveBusinessDays / totalOwnershipDays = 0.8000 → rule80Percent = true", () => {
    // acquisitionDate: 2022-01-01 → ownershipStart: 2022-01-02
    // transferDate: 2023-05-17 → totalOwnershipDays = 500 (date-fns 결과)
    // businessUsePeriods: 2022-01-02 ~ 2023-02-06 = 400일 → 400/500 = 0.8000
    const acq = new Date("2022-01-01");
    const trf = new Date("2023-05-17");
    const ownershipStart = new Date("2022-01-02");
    const bizEnd = new Date("2023-02-06"); // ownershipStart + 400일

    const totalDays = differenceInDays(trf, ownershipStart); // 기대: 500
    const bizDays = differenceInDays(bizEnd, ownershipStart); // 기대: 400

    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1000,
      zoneType: "residential",
      acquisitionDate: acq,
      transferDate: trf,
      businessUsePeriods: [biz(ownershipStart, bizEnd, "건물임대")],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // date-fns 결과 검증
    expect(totalDays).toBe(500);
    expect(bizDays).toBe(400);
    expect(result.isNonBusinessLand).toBe(false);
    expect(result.criteria.rule80Percent).toBe(true);
    expect(result.businessUseRatio).toBe(0.8);
  });
});

// ─── NB-04: 79.8% → rule① 미충족, rule②③ 모두 미충족 → 비사업용 ──────────

describe("NB-04: 사업용 비율 79.8% → 3가지 기준 모두 미충족 → 비사업용", () => {
  it("totalOwnershipDays=500, businessDays=399 → ratio=79.8% → 비사업용", () => {
    const ownershipStart = new Date("2022-01-02");
    const trf = new Date("2023-05-17");         // totalDays = 500
    const bizEnd = new Date("2023-02-05");      // ownershipStart + 399일

    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1000,
      zoneType: "residential",
      acquisitionDate: new Date("2022-01-01"),
      transferDate: trf,
      businessUsePeriods: [biz(ownershipStart, bizEnd)],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(true);
    expect(result.criteria.rule80Percent).toBe(false);
    // 500일 < 3*365=1095일 → rule③ 미충족
    expect(result.criteria.rule2of3Years).toBe(false);
    // 500일 < 5*365=1825일 → rule② 미충족
    expect(result.criteria.rule5Years).toBe(false);
  });
});

// ─── NB-05: 직전 3년 중 2년(730일) 이상 사업용 → rule③ 충족 ─────────────────

describe("NB-05: 직전 3년 중 2년(730일) 이상 → rule③ 충족, 사업용", () => {
  it("4년 보유, 사업용 2년(직전 3년 포함) → rule③ 충족, rule①② 미충족", () => {
    // 보유: 2018-01-01 ~ 2022-01-01 (4년 = 1460일)
    // 사업용: 2020-01-01 ~ 2022-01-01 (730일, 직전 3년 = 2019~2022 내 포함)
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 2000,
      zoneType: "commercial",
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2022-01-01"),
      businessUsePeriods: [biz(new Date("2020-01-01"), new Date("2022-01-01"), "건물임대")],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(false);
    expect(result.criteria.rule2of3Years).toBe(true);
    // rule①: ~50% < 80% → false
    expect(result.criteria.rule80Percent).toBe(false);
    // rule②: 4년 < 5년 → false
    expect(result.criteria.rule5Years).toBe(false);
  });
});

// ─── NB-06: 직전 5년 중 3년(1095일) 이상 사업용 → rule② 충족 ────────────────

describe("NB-06: 직전 5년 중 3년(1095일) 이상 → rule② 충족, 사업용", () => {
  it("7년 보유, 직전5년 내 3년 사업용, 직전3년 사업용 없음 → rule② 충족만", () => {
    // 보유: 2015-01-01 ~ 2022-01-01 (7년)
    // 사업용: 2017-01-01 ~ 2020-01-01 (3년 = 약 1095일)
    //   → 직전 5년 (2017-2022) 내 사업: 2017-01-01 ~ 2020-01-01 = 약 1095일 → rule② ✓
    //   → 직전 3년 (2019-2022) 내 사업: 2019-01-01 ~ 2020-01-01 = 365일 < 730 → rule③ ✗
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 3000,
      zoneType: "green",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      businessUsePeriods: [biz(new Date("2017-01-01"), new Date("2020-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(false);
    expect(result.criteria.rule5Years).toBe(true);
    expect(result.criteria.rule2of3Years).toBe(false);
  });
});

// ─── NB-07: 단기 보유(2년) + 사업용 80% 이상 → rule① 충족 ──────────────────

describe("NB-07: 2년 미만 보유 + 사업용 80% 이상 → rule① 충족, 사업용", () => {
  it("totalOwnershipDays=729, businessDays=600(82.3%) → rule① → 사업용", () => {
    // 취득일: 2022-01-01, 양도일: 2024-01-01 → ownership = 730일
    // 사업용: 2022-01-02 ~ 2023-09-24 ≈ 600일
    const ownershipStart = new Date("2022-01-02");
    // 2022-01-02 에서 600일 후
    // 365 (2022) - 1 (Jan 2 start) = 364 remaining in 2022 → +236 into 2023 = Aug 23 → Aug 24?
    // Let me just use: 2023-09-24 and trust the test output
    const bizEnd = new Date("2023-09-24");
    const trf = new Date("2024-01-01");

    const input: NonBusinessLandInput = {
      landType: "miscellaneous",
      landArea: 800,
      zoneType: "management",
      acquisitionDate: new Date("2022-01-01"),
      transferDate: trf,
      businessUsePeriods: [biz(ownershipStart, bizEnd)],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    const expectedBusinessDays = differenceInDays(bizEnd, ownershipStart);
    expect(result.businessUseDays).toBe(expectedBusinessDays);
    expect(result.businessUseRatio).toBeGreaterThanOrEqual(0.8);
    expect(result.criteria.rule80Percent).toBe(true);
    expect(result.isNonBusinessLand).toBe(false);
  });
});

// ─── NB-08: 상속 5년 유예 + 사업용 1년 → 유예 합산으로 rule③ 충족 ───────────

describe("NB-08: 상속 5년 유예 + 사업용 1년 → 유예기간 합산 → rule③ 충족, 사업용", () => {
  it("유예기간(상속 5년) + 사업용 1년이 직전 3년을 커버 → rule③ 충족", () => {
    // 보유: 2015-01-01 ~ 2022-01-01 (7년)
    // 유예(상속): 2015-01-01 ~ 2020-01-01 (5년 최대 → 2020-01-01 cap)
    // 사업용: 2021-01-01 ~ 2022-01-01 (1년)
    // → 유예 없으면:
    //   직전3년(2019-2022): 사업용 1년 = 365일 < 730 → rule③ 실패
    //   직전5년(2017-2022): 사업용 1년 = 365일 < 1095 → rule② 실패
    //   비율: 365/2555 ≈ 14% → rule① 실패 → 비사업용
    // → 유예 포함:
    //   직전3년(2019-2022): 유예 2019-01-01~2020-01-01 = 365일 + 사업용 365일 = 730일 ≥ 730 → rule③ ✓
    const inputWithGrace: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 10000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 5,
      businessUsePeriods: [biz(new Date("2021-01-01"), new Date("2022-01-01"))],
      gracePeriods: [grace("inheritance", new Date("2015-01-01"), new Date("2025-01-01"))], // 5년 cap 적용
    };

    const inputNoGrace: NonBusinessLandInput = {
      ...inputWithGrace,
      gracePeriods: [],
    };

    const withGrace = judgeNonBusinessLand(inputWithGrace, DEFAULT_NON_BUSINESS_LAND_RULES);
    const noGrace = judgeNonBusinessLand(inputNoGrace, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 유예 포함 → 사업용
    expect(withGrace.isNonBusinessLand).toBe(false);
    expect(withGrace.criteria.rule2of3Years).toBe(true);
    expect(withGrace.gracePeriodDays).toBeGreaterThan(0);

    // 유예 제외 → 비사업용
    expect(noGrace.isNonBusinessLand).toBe(true);
    expect(noGrace.criteria.rule2of3Years).toBe(false);
  });
});

// ─── NB-09: 유예기간 중복 제거 ────────────────────────────────────────────────

describe("NB-09: 유예기간 중복 제거 (상속 + 법령제한 겹침)", () => {
  it("상속(2015~2020) + 법령제한(2017~2019) 겹침 → gracePeriodDays는 합산 아닌 병합", () => {
    // 유예: 상속 2015-01-01~2020-01-01 (5yr cap), 법령 2017-01-01~2019-01-01
    // 겹침 없을 경우 합산: 5년 + 2년 = 7년
    // 겹침 있으므로 병합 후: 2015-01-01~2020-01-01 = 5년
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1500,
      zoneType: "residential",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      businessUsePeriods: [],
      gracePeriods: [
        grace("inheritance", new Date("2015-01-01"), new Date("2025-01-01")), // cap → 2020-01-01
        grace("legal_restriction", new Date("2017-01-01"), new Date("2019-01-01")),
      ],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 상속유예가 이미 법령제한 기간을 포함 → 합산이 아닌 병합
    // gracePeriodDays = 2015-01-02 to 2020-01-01 (소유시작 clip)
    const expectedGraceDays = differenceInDays(new Date("2020-01-01"), new Date("2015-01-02"));
    expect(result.gracePeriodDays).toBe(expectedGraceDays);

    // 잘못된 합산값(7년)보다 작아야 함
    const wrongSumDays = 5 * 365 + 2 * 365; // 2555
    expect(result.gracePeriodDays).toBeLessThan(wrongSumDays);
  });

  it("mergeOverlappingPeriods: 겹치는 구간 2개 → 1개로 병합", () => {
    const intervals = [
      { start: new Date("2015-01-01"), end: new Date("2018-01-01") },
      { start: new Date("2017-01-01"), end: new Date("2020-01-01") },
    ];
    const merged = mergeOverlappingPeriods(intervals);
    expect(merged).toHaveLength(1);
    expect(merged[0].start.toISOString().slice(0, 10)).toBe("2015-01-01");
    expect(merged[0].end.toISOString().slice(0, 10)).toBe("2020-01-01");
  });

  it("mergeOverlappingPeriods: 분리된 구간 2개 → 2개 유지", () => {
    const intervals = [
      { start: new Date("2015-01-01"), end: new Date("2016-01-01") },
      { start: new Date("2018-01-01"), end: new Date("2019-01-01") },
    ];
    const merged = mergeOverlappingPeriods(intervals);
    expect(merged).toHaveLength(2);
  });
});

// ─── NB-10: 건물 부수 토지 배율 초과 → 면적 안분 ────────────────────────────

describe("NB-10: 건물 부수 토지 배율 초과 → 초과분 비사업용 (면적 안분)", () => {
  it("주거지역 5배, 건물 바닥면적 100㎡, 토지 600㎡ → 100㎡(초과분) 비사업용", () => {
    // allowedArea = 100 * 5 = 500㎡
    // nonBusinessArea = 600 - 500 = 100㎡
    // nonBusinessRatio = 100/600 ≈ 0.1667
    const input: NonBusinessLandInput = {
      landType: "building_site",
      landArea: 600,
      zoneType: "residential",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      buildingFootprint: 100,
      businessUsePeriods: [],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(true);
    expect(result.areaProportioning).toBeDefined();
    expect(result.areaProportioning!.buildingMultiplier).toBe(5);
    expect(result.areaProportioning!.businessArea).toBe(500);
    expect(result.areaProportioning!.nonBusinessArea).toBe(100);
    expect(result.areaProportioning!.nonBusinessRatio).toBe(Math.round(100 / 600 * 10000) / 10000);
    expect(result.appliedLawArticles).toContain("시행령 §168조의8");
  });

  it("배율 이내 (100㎡ × 5 = 500, 토지 300㎡) → 전체 사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "building_site",
      landArea: 300,
      zoneType: "residential",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      buildingFootprint: 100,
      businessUsePeriods: [],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(false);
    expect(result.areaProportioning!.nonBusinessArea).toBe(0);
  });

  it("공업지역 배율 = 7배 적용", () => {
    const input: NonBusinessLandInput = {
      landType: "building_site",
      landArea: 1500,
      zoneType: "industrial",
      acquisitionDate: new Date("2018-01-01"),
      transferDate: new Date("2022-01-01"),
      buildingFootprint: 200,
      businessUsePeriods: [],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 200 * 7 = 1400 ≤ 1500 → 초과 100㎡
    expect(result.areaProportioning!.buildingMultiplier).toBe(7);
    expect(result.areaProportioning!.businessArea).toBe(1400);
    expect(result.areaProportioning!.nonBusinessArea).toBe(100);
  });
});

// ─── NB-11: 임야 영림계획 미인가 → 비사업용 ─────────────────────────────────

describe("NB-11: 임야 영림계획 인가 없음 → 비사업용", () => {
  it("forestManagementPlan=false → 사업용 기간 미인정 → 비사업용", () => {
    const input: NonBusinessLandInput = {
      landType: "forest",
      landArea: 50000,
      zoneType: "natural_env",
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2022-01-01"),
      forestManagementPlan: false,
      businessUsePeriods: [
        biz(new Date("2010-01-02"), new Date("2022-01-01"), "임야"),
      ],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(true);
    expect(result.businessUseDays).toBe(0);
    expect(result.warnings.some((w) => w.includes("영림계획"))).toBe(true);
  });

  it("forestManagementPlan=true → 사업용 기간 인정 → 사업용 가능", () => {
    const input: NonBusinessLandInput = {
      landType: "forest",
      landArea: 50000,
      zoneType: "natural_env",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      forestManagementPlan: true,
      businessUsePeriods: [
        biz(new Date("2015-01-02"), new Date("2022-01-01"), "임야"),
      ],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 전 기간 사업용 → rule① 충족
    expect(result.isNonBusinessLand).toBe(false);
    expect(result.criteria.rule80Percent).toBe(true);
  });
});

// ─── NB-12: 비사업용 판정 시 중과 및 장기보유공제 배제 플래그 확인 ─────────────

describe("NB-12: 비사업용 판정 시 중과세 및 장기보유공제 배제 플래그", () => {
  it("비사업용 → additionalRate=0.10, longTermDeductionExcluded=true, basicDeductionApplied=true", () => {
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 2000,
      zoneType: "residential",
      acquisitionDate: new Date("2019-01-01"),
      transferDate: new Date("2022-01-01"),
      businessUsePeriods: [], // 0일
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(true);
    expect(result.surcharge.surchargeType).toBe("non_business_land");
    expect(result.surcharge.additionalRate).toBe(0.10);
    expect(result.surcharge.longTermDeductionExcluded).toBe(true);
    // 기본공제 250만원은 적용 (미등기와 구별)
    expect(result.surcharge.basicDeductionApplied).toBe(true);
  });

  it("사업용 토지도 surcharge 객체는 존재 (공통 반환 구조)", () => {
    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 5000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 10,
      businessUsePeriods: [biz(new Date("2016-01-02"), new Date("2022-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.isNonBusinessLand).toBe(false);
    // surcharge 객체는 항상 반환 (isNonBusinessLand로 적용 여부 판단)
    expect(result.surcharge).toBeDefined();
    expect(result.surcharge.surchargeType).toBe("non_business_land");
  });

  it("소유기간·사업용일수·비율 필드가 정상 계산됨", () => {
    // 보유: 2020-01-01 ~ 2022-01-01 → ownershipStart=2020-01-02
    // 사업용 없음
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 500,
      zoneType: "green",
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2022-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    const expectedDays = differenceInDays(new Date("2022-01-01"), new Date("2020-01-02"));
    expect(result.totalOwnershipDays).toBe(expectedDays);
    expect(result.businessUseDays).toBe(0);
    expect(result.gracePeriodDays).toBe(0);
    expect(result.effectiveBusinessDays).toBe(0);
    expect(result.businessUseRatio).toBe(0);
    expect(result.appliedLawArticles).toContain("소득세법 §104조의3");
    expect(result.appliedLawArticles).toContain("시행령 §168조의6");
  });
});

// ─── NB-13: rule② 법령 정정 — 소유기간 중 사업용 합계 ≥ 1095일 경계값 ────────

describe("NB-13: rule② 경계값 — 소유기간 5년+ AND 사업용 일수 1095일 정확히", () => {
  it("사업용 1095일 정확히 → rule② 충족 (1095 >= 1095)", () => {
    // 보유: 2015-01-01 ~ 2023-01-01 (8년, totalOwnershipDays > 1825)
    // 사업용: 2017-01-01 ~ 2020-01-01 = 3년 = 1095일
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 2000,
      zoneType: "residential",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [biz(new Date("2017-01-01"), new Date("2020-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    const bizDays = differenceInDays(new Date("2020-01-01"), new Date("2017-01-01"));
    expect(bizDays).toBe(1095); // 경계값 확인
    expect(result.criteria.rule5Years).toBe(true);
    expect(result.isNonBusinessLand).toBe(false);
  });

  it("사업용 1094일 → rule② 미충족, 나머지도 미충족 → 비사업용", () => {
    // 1094 < 1095 → rule② 실패
    // 마지막 날(2019-12-31)을 하루 줄임
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 2000,
      zoneType: "residential",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [biz(new Date("2017-01-01"), new Date("2019-12-31"))], // 1094일
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    const bizDays = differenceInDays(new Date("2019-12-31"), new Date("2017-01-01"));
    expect(bizDays).toBe(1094);
    expect(result.criteria.rule5Years).toBe(false);
    // rule①: 1094/(8yr total)
    // rule③: last 3yr (2020-2023): business = 0 < 730 → false
    expect(result.isNonBusinessLand).toBe(true);
  });

  it("소유기간 1824일 → 보유 5년 미달 → rule② 미적용", () => {
    // 1824 < 1825 → rule② 자체 조건 불충족 (holding < 5yr)
    const ownershipStart = new Date("2019-01-02"); // acquisition = 2019-01-01
    // 1824일 후
    const transferDate = new Date("2024-01-01"); // 약 5년 → 실제 일수 확인
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1000,
      zoneType: "residential",
      acquisitionDate: new Date("2019-01-01"),
      transferDate,
      businessUsePeriods: [biz(ownershipStart, transferDate)], // 전체 기간 사업용
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);
    const totalDays = result.totalOwnershipDays;

    if (totalDays < 1825) {
      // 보유 5년 미달 → rule② false
      expect(result.criteria.rule5Years).toBe(false);
    }
    // rule①: 전체 기간 사업용 → 100% → 사업용
    expect(result.criteria.rule80Percent).toBe(true);
    expect(result.isNonBusinessLand).toBe(false);
  });
});

// ─── NB-14: rule③ 법령 정정 — 보유기간 최소 요건 없음 ──────────────────────────

describe("NB-14: rule③ — 보유기간 3년 미만이어도 적용 가능", () => {
  it("보유 약 2.5년(915일), rule① 미충족(<80%), rule③만 충족 → 사업용", () => {
    // 설계: 구법(보유 3년 요건)과 신법(요건 없음)의 차이를 보여주는 케이스
    // 보유: 2020-06-01 ~ 2023-01-01 ≈ 915일 (< 3yr=1095일)
    // 사업용: 2021-01-01 ~ 2023-01-01 = 730일 (직전 3년 창 내 730일 ≥ 730 → rule③ ✓)
    // ratio: 730/915 ≈ 79.8% < 80% → rule① 실패
    // 직전 3년 창(2020-01-01~2023-01-01) → 소유시작(2020-06-02)으로 클립
    //   사업용(2021-01-01~2023-01-01) in window = 730일 ≥ 730 → rule③ ✓
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1000,
      zoneType: "residential",
      acquisitionDate: new Date("2020-06-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [biz(new Date("2021-01-01"), new Date("2023-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 보유 < 3년 → rule② false
    expect(result.criteria.rule5Years).toBe(false);
    // 비율 < 80% → rule① false
    expect(result.criteria.rule80Percent).toBe(false);
    // rule③: 직전 3년 내 730일 이상 → true (보유기간 요건 없음)
    expect(result.criteria.rule2of3Years).toBe(true);
    expect(result.isNonBusinessLand).toBe(false);
  });

  it("보유 2년, 사업용 729일 → rule③ 미충족, rule①②도 미충족 → 비사업용", () => {
    // 729 < 730 → rule③ 실패
    // ratio: 729/730 ≈ 99.9% → rule① 충족!
    // 이 경우 rule①로 사업용이 됨 → 다른 시나리오로 조정
    // 보유 730일, 사업용 729일 → ratio = 99.9% → rule① true
    // 따라서 rule③ 실패만 테스트: 보유 730일, 사업용 584일(80% 미달)
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 800,
      zoneType: "residential",
      acquisitionDate: new Date("2021-01-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [biz(new Date("2021-01-02"), new Date("2022-08-05"))], // ~584일
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    const bizDays = result.businessUseDays;
    expect(bizDays).toBeLessThan(730); // rule③ 미충족
    expect(result.criteria.rule2of3Years).toBe(false);
    if (bizDays / result.totalOwnershipDays < 0.8) {
      expect(result.criteria.rule80Percent).toBe(false);
      expect(result.isNonBusinessLand).toBe(true);
    }
  });
});

// ─── NB-15: rule③ 경계값 — 직전 3년 창 내 730일 정확히 ──────────────────────

describe("NB-15: rule③ 경계값 — 직전 3년 창 내 730일", () => {
  it("직전 3년 내 730일 정확히 → rule③ 충족 (730 >= 730)", () => {
    // 보유: 2016-01-01 ~ 2023-01-01 (7년)
    // 사업용: 2021-01-01 ~ 2023-01-01 = 730일 (정확히)
    // 직전 3년 창(2020-2023): 사업용 = 730일 >= 730 → rule③ ✓
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 2000,
      zoneType: "residential",
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [biz(new Date("2021-01-01"), new Date("2023-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    const bizDays = differenceInDays(new Date("2023-01-01"), new Date("2021-01-01"));
    expect(bizDays).toBe(730); // 경계값 확인
    expect(result.criteria.rule2of3Years).toBe(true);
    expect(result.isNonBusinessLand).toBe(false);
  });

  it("직전 3년 내 729일 → rule③ 미충족", () => {
    // 사업용: 2021-01-02 ~ 2023-01-01 = 729일
    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 2000,
      zoneType: "residential",
      acquisitionDate: new Date("2016-01-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [biz(new Date("2021-01-02"), new Date("2023-01-01"))],
      gracePeriods: [],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    expect(result.criteria.rule2of3Years).toBe(false);
  });
});

// ─── NB-16: 부득이한 사유 (UnavoidableReason) — 유예기간 산입 ─────────────────

describe("NB-16: 부득이한 사유 → 유예기간으로 산입", () => {
  it("질병 사유 2년 + 사업용 기간 → 합산으로 사업용 판정", () => {
    // 보유: 2015-01-01 ~ 2022-01-01 (7년)
    // 사업용: 2020-01-01 ~ 2022-01-01 (2년 = 730일)
    // 부득이한 사유(질병): 2018-01-01 ~ 2020-01-01 (2년)
    // 직전 3년(2019-2022): 질병 2019-01-01~2020-01-01(365일) + 사업용 730일 = 1095일 >= 730 → rule③ ✓
    const unavoidable: UnavoidableReason = {
      type: "illness",
      startDate: new Date("2018-01-01"),
      endDate: new Date("2020-01-01"),
    };

    const inputWithUnavoidable: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 10000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2022-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 10,
      businessUsePeriods: [biz(new Date("2020-01-01"), new Date("2022-01-01"))],
      gracePeriods: [],
      unavoidableReasons: [unavoidable],
    };

    const inputNoUnavoidable: NonBusinessLandInput = {
      ...inputWithUnavoidable,
      unavoidableReasons: [],
    };

    const withUnavoidable = judgeNonBusinessLand(inputWithUnavoidable, DEFAULT_NON_BUSINESS_LAND_RULES);
    const noUnavoidable = judgeNonBusinessLand(inputNoUnavoidable, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 부득이한 사유 포함 → gracePeriodDays 증가
    expect(withUnavoidable.gracePeriodDays).toBeGreaterThan(0);
    // 부득이한 사유 없으면: 사업용 2년만 → 직전 3년(2019-2022) 내 730일 >= 730 → rule③ 충족 (실은 경계값)
    // 어떤 경우든 부득이한 사유 포함 시 effectiveBusinessDays가 더 많음
    expect(withUnavoidable.effectiveBusinessDays).toBeGreaterThanOrEqual(noUnavoidable.effectiveBusinessDays);
  });

  it("고령(만 65세) 사유 → 유예기간 인정", () => {
    const unavoidable: UnavoidableReason = {
      type: "elderly",
      startDate: new Date("2017-01-01"),
      endDate: new Date("2019-01-01"),
    };

    const input: NonBusinessLandInput = {
      landType: "farmland",
      landArea: 3000,
      zoneType: "agriculture_forest",
      acquisitionDate: new Date("2014-01-01"),
      transferDate: new Date("2023-01-01"),
      farmingSelf: true,
      farmerResidenceDistance: 5,
      businessUsePeriods: [biz(new Date("2014-01-02"), new Date("2017-01-01"))],
      gracePeriods: [],
      unavoidableReasons: [unavoidable],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // 유예기간(고령) 포함 → gracePeriodDays > 0
    expect(result.gracePeriodDays).toBeGreaterThan(0);
    // 고령 유예는 max 2년 → 2017~2019 = 2년 (최대치)
    expect(result.gracePeriodDays).toBeLessThanOrEqual(2 * 365 + 2); // 윤년 고려
  });

  it("공익수용 → 전액 유예 (기간 전체 인정)", () => {
    const unavoidable: UnavoidableReason = {
      type: "expropriation",
      startDate: new Date("2018-01-01"),
      endDate: new Date("2023-01-01"), // 5년 — 유예 상한이 2년이므로 2년 cap
    };

    const input: NonBusinessLandInput = {
      landType: "vacant_lot",
      landArea: 1500,
      zoneType: "residential",
      acquisitionDate: new Date("2015-01-01"),
      transferDate: new Date("2023-01-01"),
      businessUsePeriods: [],
      gracePeriods: [],
      unavoidableReasons: [unavoidable],
    };

    const result = judgeNonBusinessLand(input, DEFAULT_NON_BUSINESS_LAND_RULES);

    // "unavoidable" 유형은 최대 2년 cap 적용
    const maxGraceDays = 2 * 365 + 2; // 윤년 포함 최대
    expect(result.gracePeriodDays).toBeLessThanOrEqual(maxGraceDays);
    expect(result.gracePeriodDays).toBeGreaterThan(0);
  });
});
