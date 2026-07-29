/**
 * 다주택 중과세 엔진 — 장기임대 유형·특수 배제·인구감소지역 특례 (MH-16~MH-22) 테스트
 *
 * Mock 규칙·헬퍼는 ../_helpers/multi-house-mock 에서 import.
 */

import { describe, it, expect } from "vitest";
import {
  countEffectiveHouses,
  isRegulatedAreaAtDate,
  determineMultiHouseSurcharge,
  isLongTermRentalHousingExempt,
  isSmallNewHouseSpecial,
  isTaxIncentiveRentalHousingExempt,
  classifyRegionCriteriaByCode,
  classifyPopulationDeclineArea,
  buildMultiHouseTaxSimulation,
  type HouseInfo,
  type PresaleRight,
  type MultiHouseSurchargeInput,
  type HouseCountExclusionRules,
  type RegulatedAreaHistory,
} from "@/lib/tax-engine/multi-house-surcharge";
import type { SurchargeSpecialRulesData } from "@/lib/tax-engine/schemas/rate-table.schema";
import {
  defaultRules,
  mockRegulatedHistory,
  suspensionActive,
  suspensionNone,
  makeHouse,
  makeInput,
} from "../_helpers/multi-house-mock";

describe("통합: regionCode 미제공 → isRegulatedFallback 사용", () => {
  it("regionCode 없음 + isRegulatedFallback=true → 조정 판정, 경고 발생", () => {
    const h1 = makeHouse("h1"); // regionCode 미제공
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true, // fallback=true
    );

    expect(result.isRegulatedAtTransfer).toBe(true);
    expect(result.warnings).toContain(
      "양도 주택의 regionCode 미제공 — isRegulatedArea 플래그 사용",
    );
  });
});

// ============================================================
// MH-16: 장기임대 유형별 판정 (A~I 세분화)
// ============================================================

describe("MH-16: 장기임대 마목(E형) 요건 충족 → 산정 제외", () => {
  const rulesWithLocal: HouseCountExclusionRules = {
    ...defaultRules,
    lowPriceThreshold: { capital: null, non_capital: 100_000_000, local: 300_000_000 },
  };

  it("마목(E) 요건 충족 주택 → 산정 제외 (long_term_rental)", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      rentalType: "E",
      isApartment: false, // 2021 등록 마목(장기일반 매입임대)은 아파트 등록 불가 — 요건충족 시나리오는 비아파트(makeHouse 기본 아파트 정정)
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2021-01-01"), // 2021 등록 → 10년 요건
      businessRegistrationDate: new Date("2021-01-01"),
      rentalPeriodYears: 10,
      rentalStartOfficialPrice: 500_000_000, // 6억 이하 (수도권)
      isCapitalArea: true,
      rentIncreaseUnder5Pct: true,
      isExcluded918Rule: false,
      isExcludedAfter20200711Apt: false,
      isExcludedShortToLongChange: false,
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("long_term_rental");
    expect(excluded[0].detail).toContain("마. 장기일반 매입임대");
  });

  it("마목(E) 임대기간 미달 (8년 미만) → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isLongTermRental: true,
      rentalType: "E",
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2020-01-01"), // 2020.8.18 이전 → 8년 요건
      businessRegistrationDate: new Date("2020-01-01"),
      rentalPeriodYears: 7, // 8년 미달
      rentalStartOfficialPrice: 500_000_000,
      isCapitalArea: true,
      rentIncreaseUnder5Pct: true,
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2024-06-01"),
      [],
      rulesWithLocal,
    );

    expect(count).toBe(2); // 요건 미달 → 포함
  });

  it("isLongTermRentalHousingExempt: 아목(H) 2025.6.4 이후 등록, 6년, 4억 이하 → true", () => {
    const house = makeHouse("h1", {
      isLongTermRental: true,
      rentalType: "H",
      isRegisteredRental: true,
      rentalRegistrationDate: new Date("2025-06-05"),
      businessRegistrationDate: new Date("2025-06-05"),
      rentalPeriodYears: 6,
      rentalStartOfficialPrice: 350_000_000, // 4억 이하 (수도권)
      isCapitalArea: true,
      isApartment: false,
      rentIncreaseUnder5Pct: true,
      isExcluded918Rule: false,
    });

    expect(isLongTermRentalHousingExempt(house, new Date("2026-01-01"))).toBe(true);
  });

  it("isLongTermRentalHousingExempt: 말소 완료 주택 → false (중과배제 불가)", () => {
    const house = makeHouse("h1", {
      isLongTermRental: true,
      rentalCancelledDate: new Date("2023-01-01"), // 양도일 이전 말소
    });

    expect(isLongTermRentalHousingExempt(house, new Date("2024-06-01"))).toBe(false);
  });
});

// ============================================================
// MH-17: ③ 조특법 감면 임대주택 → 3주택+ 중과배제
// ============================================================

describe("MH-17: ③ 조특법 감면 임대주택 → 3주택+ 중과배제", () => {
  it("양도 주택이 조특법 감면 임대주택 (국민주택 5년+) → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 6, // 5년 이상
      isNationalSizeHousing: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("tax_incentive_rental");
  });

  it("조특법 감면 임대주택이지만 임대기간 4년 → 요건 미달, 중과 적용", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isTaxIncentiveRental: true,
      rentalPeriodYears: 4, // 5년 미달
      isNationalSizeHousing: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
  });

  it("isTaxIncentiveRentalHousingExempt: 국민주택 5년 충족 → true", () => {
    const house = makeHouse("h1", {
      isTaxIncentiveRental: true,
      rentalPeriodYears: 5,
      isNationalSizeHousing: true,
    });
    expect(isTaxIncentiveRentalHousingExempt(house)).toBe(true);
  });
});

// ============================================================
// MH-18: ⑬ 소형 신축/미분양 특례 → 산정 배제
// ============================================================

describe("MH-18: ⑬ 소형 신축/미분양 특례", () => {
  it("소형 신축주택(60㎡, 비아파트, 3억 이하 비수도권) → 산정 배제", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2025-03-01"), // 2024.1.10~2027.12.31
      completionDate: new Date("2025-03-01"), // 가목 3호 준공일 윈도우 내
      isApartment: false,
      exclusiveArea: 55,           // 60㎡ 이하
      acquisitionPrice: 250_000_000, // 비수도권 3억 이하
      isCapitalArea: false,
      region: "non_capital",
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2026-01-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded[0].reason).toBe("small_new_house");
  });

  it("아파트 소형신축 → 특례 제외 (아파트는 해당 안 됨)", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      acquisitionDate: new Date("2025-03-01"),
      isApartment: true, // 아파트 → 특례 불가
      exclusiveArea: 55,
      acquisitionPrice: 250_000_000,
      isCapitalArea: false,
      region: "non_capital",
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2026-01-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 산정 포함
  });

  it("isSmallNewHouseSpecial: 비수도권 준공 후 미분양 (85㎡, 6억 이하) → true", () => {
    const house = makeHouse("h1", {
      acquisitionDate: new Date("2024-06-01"), // 2024.1.10~2025.12.31
      isApartment: false,
      exclusiveArea: 80,
      acquisitionPrice: 550_000_000, // 6억 이하
      isCapitalArea: false,
      region: "non_capital",
      isUnsoldNewHouse: true,
    });

    expect(isSmallNewHouseSpecial(house)).toBe(true);
  });

  it("isSmallNewHouseSpecial: acquisitionPrice 미제공 → false", () => {
    const house = makeHouse("h1", {
      acquisitionDate: new Date("2025-03-01"),
      isApartment: false,
      exclusiveArea: 55,
      // acquisitionPrice 없음
    });

    expect(isSmallNewHouseSpecial(house)).toBe(false);
  });
});

// ============================================================
// MH-19: ⑧ 저당권 실행 취득 3년 이내 → 3주택+ 중과배제
// ============================================================

describe("MH-19: ⑧ 저당권 실행 취득 3년 이내 → 3주택+ 중과배제", () => {
  it("양도 주택이 저당권 실행 취득 2년 경과 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isMortgageExecution: true,
      acquisitionDate: new Date("2022-06-01"), // 취득 2년 경과
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2024-07-01"), // 취득 2년 경과
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("mortgage_execution_3years");
  });

  it("저당권 실행 취득 3년 초과 → 배제 안 됨 (중과 적용)", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isMortgageExecution: true,
      acquisitionDate: new Date("2021-01-01"), // 3년 초과
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(true);
  });

  it("저당권 실행이지만 2주택 → 3주택+ 전용 배제 미적용, 유예 없으면 중과", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isMortgageExecution: true,
      acquisitionDate: new Date("2023-01-01"), // 취득 1년 경과
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    // 2주택 → ⑧ 배제 미적용 (3주택+ 전용)
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-20: ④⑤⑥⑨ 특수 용도 주택 → 3주택+ 중과배제
// ============================================================

describe("MH-20: ④⑤⑥⑨ 특수용도 주택 → 3주택+ 중과배제", () => {
  it("④ 사원용 주택 10년 이상 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isEmployeeHousing: true,
      freeProvisionYears: 12,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("employee_housing_10years");
  });

  it("⑤ 조특법 특례 주택 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isTaxSpecialExemption: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("tax_special_exemption");
  });

  it("⑥ 문화재 주택 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isCulturalHeritage: true,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("cultural_heritage");
  });

  it("⑨ 어린이집 5년 이상 → 중과 배제", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isDayCareCenter: true,
      dayCareOperationYears: 7,
    });
    const h2 = makeHouse("h2");
    const h3 = makeHouse("h3");

    const input = makeInput([h1, h2, h3], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    expect(result.surchargeApplicable).toBe(false);
    expect(result.exclusionReasons[0].type).toBe("daycare_center_5years");
  });

  it("④⑤⑥⑨ 모두 2주택에서는 미적용 → 중과 적용", () => {
    const h1 = makeHouse("h1", {
      regionCode: "11680",
      isEmployeeHousing: true,
      freeProvisionYears: 12,
      isTaxSpecialExemption: true,
      isCulturalHeritage: true,
      isDayCareCenter: true,
      dayCareOperationYears: 10,
    });
    const h2 = makeHouse("h2");

    const input = makeInput([h1, h2], {
      sellingHouseId: "h1",
      transferDate: new Date("2026-05-10"),
    });

    const result = determineMultiHouseSurcharge(
      input,
      defaultRules,
      mockRegulatedHistory,
      suspensionNone,
      true,
    );

    // 2주택 → 3주택+ 전용 배제 미적용
    expect(result.surchargeApplicable).toBe(true);
    expect(result.surchargeType).toBe("multi_house_2");
  });
});

// ============================================================
// MH-21: 유예 경과조치 판정 — §167의3①12의2 가·나·다목 (2026-07-24 법령정합 재작성)
//
// ⚠️ 이 describe는 확정 시행령 나·다목 원문(계약·허가 4/2요건)에 맞춰 전면 재작성됐다.
// 구 조건A/B/C 모델(조건C=토지허가+임차인 무기한 배제)은 원문에 근거가 없어 제거(G3).
// 아래 뒤집힌 기대값(조건C 무기한 배제 → 과세)은 anchor 갱신 사유 — plan §7 참조:
// docs/02-design/features/transfer-surcharge-transition-na-da.plan.md
// ============================================================

describe("MH-21: 유예 경과조치 판정 (가·나·다목)", () => {
  // 기본 셋업: 2주택, h1=강남구(4개월 지역), h2=성남분당(6개월 지역, 2025-10-16 신규지정)
  function make2HouseInput(
    transferDate: Date,
    gracePeriod?: MultiHouseSurchargeInput["gracePeriod"],
    sellingHouseId: "h1" | "h2" = "h1",
  ): MultiHouseSurchargeInput {
    const h1 = makeHouse("h1", { regionCode: "11680" }); // 강남구 (4개월 지역)
    const h2 = makeHouse("h2", { regionCode: "41135" }); // 성남 분당구 (6개월 지역)
    return makeInput([h1, h2], {
      sellingHouseId,
      transferDate,
      gracePeriod,
    });
  }

  it("가목: 양도일 ≤ 2026-05-09 → 가목 우선 게이트로 배제(계약·허가 조건 무관)", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-05-09")),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("gracePeriod 미제공 + 유예 종료 이후 양도 → 중과 적용 (기존 회귀)", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-05-10")), // 2026.5.9 초과
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("다목: 계약 2026-04-01(≤5-09)+계약금증빙, 4개월 지역, 양도 2026-08-01 → 배제", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    // 계약+4개월 = 2026-08-01 ≥ 양도일 → 배제
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("다목: 계약 2026-04-01, 4개월 지역, 양도 2026-08-02 → 계약+4개월 초과 → 과세", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-08-02"), {
        contractDate: new Date("2026-04-01"),
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("다목: 계약일이 2026-05-09 이후(다목1 위반) → 과세", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-07-01"), {
        contractDate: new Date("2026-05-15"), // 2026.5.9 이후 계약
        isLandPermitTarget: false,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("G3 회귀: 조건C 잔존 세션(허가구역+임차인, isLandPermitTarget 미제공) → 과세로 전환", () => {
    // 구법: isLandPermitArea+hasTenantInResidence → 무기한 배제. 확정 시행령 나·다목 원문에
    // 임차인 조항 없음(G3) → 조건C 삭제, isLandPermitTarget 미제공 시 나/다 어느쪽도 판정 불가 → 과세.
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-01-01"),
        isLandPermitArea: true,
        hasTenantInResidence: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("다목: 6개월 지역(성남분당) — 계약 2026-04-01, 양도 2026-10-01 → 배제", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(
        new Date("2026-10-01"),
        {
          contractDate: new Date("2026-04-01"),
          isLandPermitTarget: false,
          depositReceiptConfirmed: true,
        },
        "h2",
      ),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    // 계약+6개월 = 2026-10-01 ≥ 양도일 → 배제
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("나목: 신청 2026-05-01(≤5-09)·허가·증빙 O, 계약 2026-06-01(5-10 이후), 양도 2026-09-09 → 절대기한 배제", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-09-09"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(true);
    expect(result.surchargeApplicable).toBe(false);
  });

  it("나목: 위와 동일하나 양도 2026-09-10 → 절대기한(9-09) 초과 → 과세", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-09-10"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("나목: 허가 신청일이 2026-05-10 이후(나목1 위반) → 과세", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-10"),
        permitGranted: true,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });

  it("나목: 허가 미수령(나목2 위반) → 과세", () => {
    const result = determineMultiHouseSurcharge(
      make2HouseInput(new Date("2026-08-01"), {
        contractDate: new Date("2026-06-01"),
        isLandPermitTarget: true,
        permitApplicationDate: new Date("2026-05-01"),
        permitGranted: false,
        depositReceiptConfirmed: true,
      }),
      defaultRules,
      mockRegulatedHistory,
      suspensionActive,
      true,
    );
    expect(result.isSurchargeSuspended).toBe(false);
    expect(result.surchargeApplicable).toBe(true);
  });
});

// ============================================================
// MH-22: ⑭ 인구감소지역 세컨드홈 특례 → 주택 수 산정 배제
// ============================================================

describe("MH-22: ⑭ 인구감소지역 세컨드홈 → 주택 수 산정 배제", () => {
  it("인구감소지역 + 세컨드홈 등록 → 산정 배제 (effectiveCount -1)", () => {
    const h1 = makeHouse("h1", { region: "capital" }); // 일반 주택
    const h2 = makeHouse("h2", {
      region: "non_capital",
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: true,
    });

    const { count, excluded } = countEffectiveHouses(
      [h1, h2],
      new Date("2025-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(1);
    expect(excluded).toHaveLength(1);
    expect(excluded[0].reason).toBe("population_decline_second_home");
    expect(excluded[0].detail).toContain("§167의3①12 다·라목");
  });

  it("인구감소지역이지만 세컨드홈 미등록 → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isPopulationDeclineArea: true,
      isSecondHomeRegistered: false, // 미등록
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2025-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 포함됨
  });

  it("세컨드홈 등록이지만 인구감소지역 아님 → 산정 포함", () => {
    const h1 = makeHouse("h1");
    const h2 = makeHouse("h2", {
      isPopulationDeclineArea: false, // 인구감소지역 아님
      isSecondHomeRegistered: true,
    });

    const { count } = countEffectiveHouses(
      [h1, h2],
      new Date("2025-06-01"),
      [],
      defaultRules,
    );

    expect(count).toBe(2); // 포함됨
  });
});

// ============================================================
// MH-23: 2주택 배제 — ③ 부득이한 사유 + ⑩ 소형 저가주택
// ============================================================
