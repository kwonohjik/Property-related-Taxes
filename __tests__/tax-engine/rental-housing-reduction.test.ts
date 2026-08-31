/**
 * 장기임대주택 양도소득세 감면 엔진 테스트
 *
 * 조세특례제한법 §97, §97의3, §97의4, §97의5
 */

import { describe, expect, it } from "vitest";
import {
  calculateRentalReduction,
  calculateEffectiveRentalPeriod,
  RENTAL_VACANCY_GRACE_MONTHS_97,
  RENTAL_VACANCY_GRACE_MONTHS_97_5,
  convertToStandardDeposit,
  determineApplicableLaw,
  getLongTermDeductionOverride,
  validateRentIncrease,
  type RentalReductionInput,
  type VacancyPeriod,
  type RentHistory,
} from "@/lib/tax-engine/rental-housing-reduction";
import type { LongTermRentalRuleSet } from "@/lib/tax-engine/schemas/rate-table.schema";

// ============================================================
// 테스트용 감면 규칙 픽스처
// ============================================================

const RULES: LongTermRentalRuleSet = {
  type: "long_term_rental_v2",
  subTypes: [
    {
      code: "public_construction",
      lawArticle: "97",
      mandatoryYears: 5,
      reductionRate: 1.0,
      maxOfficialPrice: { capital: 300_000_000, non_capital: null },
      rentIncreaseLimit: null,
    },
    {
      code: "long_term_private",
      lawArticle: "97-3",
      tiers: [
        { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 },
        { mandatoryYears: 10, reductionRate: 0.7, longTermDeductionRate: 0.7 },
      ],
      maxOfficialPrice: { capital: 600_000_000, non_capital: 300_000_000 },
      rentIncreaseLimit: 0.05,
    },
    {
      code: "public_support_private",
      lawArticle: "97-4",
      tiers: [
        { mandatoryYears: 8, reductionRate: 0.5, longTermDeductionRate: 0.5 },
        { mandatoryYears: 10, reductionRate: 0.7, longTermDeductionRate: 0.7 },
      ],
      maxOfficialPrice: { capital: 600_000_000, non_capital: 300_000_000 },
      rentIncreaseLimit: 0.05,
      fullReductionAfterMandatory: true,
    },
    {
      code: "public_purchase",
      lawArticle: "97-5",
      reductionRate: 1.0,
      conditions: { mustSellToPublicEntity: true },
    },
  ],
};

// 기본 입력 헬퍼
function makeInput(
  overrides: Partial<RentalReductionInput> = {},
): RentalReductionInput {
  return {
    isRegisteredLandlord: true,
    isTaxRegistered: true,
    registrationDate: new Date("2019-01-01"),
    rentalHousingType: "long_term_private",
    propertyType: "non_apartment",
    region: "capital",
    officialPriceAtStart: 500_000_000,
    rentalStartDate: new Date("2019-01-01"),
    transferDate: new Date("2028-01-01"),   // 9년 보유
    vacancyPeriods: [],
    rentHistory: [],
    calculatedTax: 10_000_000,
    ...overrides,
  };
}

// ============================================================
// 경과규정 분기 테스트
// ============================================================

describe("determineApplicableLaw", () => {
  it("2018-09-13 등록 → pre_2018_09_14", () => {
    expect(determineApplicableLaw(new Date("2018-09-13"))).toBe("pre_2018_09_14");
  });

  it("2018-09-14 등록 → post_2018_09_14", () => {
    expect(determineApplicableLaw(new Date("2018-09-14"))).toBe("post_2018_09_14");
  });

  it("2020-07-10 등록 → post_2018_09_14", () => {
    expect(determineApplicableLaw(new Date("2020-07-10"))).toBe("post_2018_09_14");
  });

  it("2020-07-11 등록 → post_2020_07_11", () => {
    expect(determineApplicableLaw(new Date("2020-07-11"))).toBe("post_2020_07_11");
  });

  it("2020-08-17 등록 → post_2020_07_11", () => {
    expect(determineApplicableLaw(new Date("2020-08-17"))).toBe("post_2020_07_11");
  });

  it("2020-08-18 등록 → post_2020_08_18", () => {
    expect(determineApplicableLaw(new Date("2020-08-18"))).toBe("post_2020_08_18");
  });
});

// ============================================================
// 유효 임대기간 계산 테스트
// ============================================================

describe("calculateEffectiveRentalPeriod", () => {
  it("공실 없음 — 총 기간 그대로", () => {
    // 2019-01-01 ~ 2027-01-01 = 정확히 8년
    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-01-01"),
      [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    expect(years).toBe(8);
  });

  it("🔴 5개월 공실 → §97 유예 3월 초과 → 구간 전체 차감 (LR-08a, D1-03 정정)", () => {
    // 2019-01-01 ~ 2027-12-01 (8년 11개월) — 5개월(151일) 공실
    // 종전 anchor는 「6개월 미만이라 차감 없음」을 단언했다. 조특칙 §44의 유예는 3월이므로
    // 5개월 공실은 산입 대상이 아니고 구간 전체가 차감된다.
    // ⚠️ 종전 단언 `toBeGreaterThanOrEqual(8)`은 151일을 깎아도 참이라 구별력이 0이었다
    //    (180→90 뮤테이션 실측에서 이 테스트는 통과했다). 정확한 값으로 고정한다.
    const vp: VacancyPeriod[] = [
      { startDate: new Date("2022-01-01"), endDate: new Date("2022-06-01") }, // 151일
    ];
    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-12-01"),
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    // 총 3256일 − 151일 = 3105일 → 8년 6개월 남짓 → 8년
    expect(years).toBe(8);
  });

  it("§97의5는 같은 5개월 공실을 차감하지 않는다 — 유예 6개월 (조특령 §97의5①1호)", () => {
    const vp: VacancyPeriod[] = [
      { startDate: new Date("2022-01-01"), endDate: new Date("2022-06-01") },
    ];
    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-12-01"),
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97_5,
    );
    expect(years).toBe(8);
    // 두 조문이 같은 8년이 되는 구간이므로, 구별력은 아래 경계 테스트가 담당한다.
  });

  it("7개월 공실(213일) → 6개월 이상 → 차감 (LR-08b)", () => {
    // 2019-01-01 ~ 2027-12-01 ≈ 3256일 — 7개월 공실(213일) 차감 → 3043일 ≈ 8.33년
    const vp: VacancyPeriod[] = [
      { startDate: new Date("2022-01-01"), endDate: new Date("2022-08-01") }, // 212일 — 7개월 이상
    ];
    const totalDays =
      (new Date("2027-12-01").getTime() - new Date("2019-01-01").getTime()) / 86400000;
    const vpDays =
      (new Date("2022-08-01").getTime() - new Date("2022-01-01").getTime()) / 86400000;
    expect(vpDays).toBeGreaterThanOrEqual(180); // 6개월 이상 차감 확인

    const years = calculateEffectiveRentalPeriod(
      new Date("2019-01-01"),
      new Date("2027-12-01"),
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    // 차감 후 유효기간 재검증
    const effectiveDays = totalDays - vpDays;
    expect(years).toBe(Math.floor(effectiveDays / 365));
  });
});

// ============================================================
// 환산보증금 + 임대료 증액 검증 테스트
// ============================================================

describe("convertToStandardDeposit", () => {
  it("전세 — 보증금 그대로 반환", () => {
    const rent: RentHistory = {
      contractDate: new Date("2020-01-01"),
      monthlyRent: 0,
      deposit: 300_000_000,
      contractType: "jeonse",
    };
    expect(convertToStandardDeposit(rent, 0.04)).toBe(300_000_000);
  });

  it("월세 — 환산보증금 = 보증금 + (월세×12/전환율)", () => {
    const rent: RentHistory = {
      contractDate: new Date("2020-01-01"),
      monthlyRent: 1_000_000,
      deposit: 100_000_000,
      contractType: "monthly",
    };
    // 100,000,000 + floor(1,000,000 * 12 / 0.04) = 100,000,000 + 300,000,000 = 400,000,000
    expect(convertToStandardDeposit(rent, 0.04)).toBe(400_000_000);
  });
});

describe("validateRentIncrease", () => {
  it("5.00% 정확히 → 위반 없음 (LR-09a)", () => {
    const history: RentHistory[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 0,
        deposit: 210_000_000, // 5% 증가
        contractType: "jeonse",
      },
    ];
    const result = validateRentIncrease(history, 0.04);
    expect(result.isAllValid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("5.01% → 위반 (LR-09b)", () => {
    const history: RentHistory[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 0,
        deposit: 210_020_001, // 5.01% 초과
        contractType: "jeonse",
      },
    ];
    const result = validateRentIncrease(history, 0.04);
    expect(result.isAllValid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].increaseRate).toBeGreaterThan(0.05);
  });

  it("전·월세 전환 비교 (LR-10) — 전세→반전세 5% 이내", () => {
    // 전세 200백만원 → 보증금 100백만 + 월세 40만원 (전환율 4%)
    // 환산보증금 = 100,000,000 + floor(400,000 * 12 / 0.04) = 100,000,000 + 120,000,000 = 220,000,000
    // 증액률 = (220,000,000 - 200,000,000) / 200,000,000 = 10% → 위반
    const history: RentHistory[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 400_000,
        deposit: 100_000_000,
        contractType: "semi_jeonse",
      },
    ];
    const result = validateRentIncrease(history, 0.04);
    expect(result.isAllValid).toBe(false);
    expect(result.violations[0].increaseRate).toBeCloseTo(0.1, 5);
  });
});

// ============================================================
// LR-01 ~ LR-06: 유형별 감면율 테스트
// ============================================================

describe("LR-01: 공공건설임대 100% 감면", () => {
  it("5년 이상 임대 — 100% 감면 적용", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "public_construction",
        region: "capital",
        officialPriceAtStart: 200_000_000,
        // D1-04 — §97① 본문은 「2000.12.31 이전에 임대를 개시하여」다.
        // 종전 픽스처(2015 임대개시·신축연도 없음)는 시한 외인데도 100%를 단언해
        // **결함을 고정**하고 있었다.
        rentalStartDate: new Date("1998-01-01"),
        transferDate: new Date("2005-06-01"), // 7년
        constructionYear: 1990, // §97①1호
        calculatedTax: 5_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.reductionRate).toBe(1.0);
    expect(result.reductionAmount).toBe(5_000_000); // 100%
  });
});

describe("LR-02: 장기일반민간 8년 50% 감면", () => {
  it("8년 이상 임대 — 50% 감면 (2018.9.14 이후 등록)", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "long_term_private",
        registrationDate: new Date("2019-01-01"),
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"), // 8년 5개월
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.reductionRate).toBe(0.5);
    expect(result.reductionAmount).toBe(5_000_000);
  });
});

describe("LR-03: 장기일반민간 10년 70% 감면 (2020.7.11 이후 등록)", () => {
  it("2020.7.11 이후 등록 → 의무 10년 → 70% 감면", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "long_term_private",
        registrationDate: new Date("2020-07-11"),
        rentalStartDate: new Date("2020-07-11"),
        transferDate: new Date("2031-01-01"), // 10년 6개월
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.mandatoryPeriodYears).toBe(10);
    expect(result.reductionRate).toBe(0.7);
    expect(result.reductionAmount).toBe(7_000_000);
  });
});

describe("LR-04: 공공지원민간임대 8년 50% 감면", () => {
  it("8년 이상 임대 — 50% 감면", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "public_support_private",
        registrationDate: new Date("2019-01-01"),
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
        calculatedTax: 8_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.reductionRate).toBe(0.5);
    expect(result.reductionAmount).toBe(4_000_000);
  });
});

describe("LR-05: 공공매입임대 100% 감면", () => {
  it("공공매입 — 100% 감면 (경고 포함)", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "public_purchase",
        calculatedTax: 3_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.reductionRate).toBe(1.0);
    expect(result.reductionAmount).toBe(3_000_000);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================
// LR-07: 의무기간 경계값
// ============================================================

describe("LR-07: 의무임대기간 경계값", () => {
  it("8년 정확히 충족 → 감면 적용", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "long_term_private",
        registrationDate: new Date("2019-01-01"),
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-01-01"), // 정확히 8년 (365*8=2920일)
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.effectiveRentalYears).toBeGreaterThanOrEqual(8);
  });

  it("7년 11개월 → 8년 미충족 → 감면 불가", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "long_term_private",
        registrationDate: new Date("2019-01-01"),
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2026-12-01"), // 7년 11개월
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons.some((r) => r.code === "RENTAL_PERIOD_SHORT")).toBe(true);
  });
});

// ============================================================
// LR-11: 기준시가 요건 (수도권 6억원)
// ============================================================

describe("LR-11: 기준시가 요건", () => {
  it("수도권 6억원 이하 → 요건 충족", () => {
    const result = calculateRentalReduction(
      makeInput({
        region: "capital",
        officialPriceAtStart: 600_000_000, // 정확히 6억
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
      }),
      RULES,
    );
    expect(result.ineligibleReasons.some((r) => r.code === "OFFICIAL_PRICE_EXCEEDED")).toBe(false);
  });

  it("수도권 6억 1원 초과 → 요건 미충족 (LR-11)", () => {
    const result = calculateRentalReduction(
      makeInput({
        region: "capital",
        officialPriceAtStart: 600_000_001, // 6억 1원 초과
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
      }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons.some((r) => r.code === "OFFICIAL_PRICE_EXCEEDED")).toBe(true);
  });

  it("비수도권 3억원 이하 → 요건 충족", () => {
    const result = calculateRentalReduction(
      makeInput({
        region: "non_capital",
        officialPriceAtStart: 300_000_000,
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
      }),
      RULES,
    );
    expect(result.ineligibleReasons.some((r) => r.code === "OFFICIAL_PRICE_EXCEEDED")).toBe(false);
  });

  it("비수도권 3억 1원 초과 → 요건 미충족", () => {
    const result = calculateRentalReduction(
      makeInput({
        region: "non_capital",
        officialPriceAtStart: 300_000_001,
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
      }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons.some((r) => r.code === "OFFICIAL_PRICE_EXCEEDED")).toBe(true);
  });
});

// ============================================================
// LR-12 ~ LR-14: 경과규정 분기
// ============================================================

describe("LR-12: 등록일 2018.9.13 vs 2018.9.14", () => {
  it("2018-09-13 등록 → pre 구법 — 감면 처리", () => {
    const result = calculateRentalReduction(
      makeInput({
        registrationDate: new Date("2018-09-13"),
        rentalStartDate: new Date("2018-09-13"),
        transferDate: new Date("2027-01-01"),
      }),
      RULES,
    );
    expect(result.applicableLawVersion).toBe("pre_2018_09_14");
  });

  it("2018-09-14 등록 → post_2018_09_14", () => {
    const result = calculateRentalReduction(
      makeInput({
        registrationDate: new Date("2018-09-14"),
        rentalStartDate: new Date("2018-09-14"),
        transferDate: new Date("2027-01-01"),
      }),
      RULES,
    );
    expect(result.applicableLawVersion).toBe("post_2018_09_14");
  });
});

describe("LR-13: 등록일 2020.7.10 vs 2020.7.11 — 의무기간 차이", () => {
  it("2020-07-10 등록 → 8년 의무", () => {
    const result = calculateRentalReduction(
      makeInput({
        registrationDate: new Date("2020-07-10"),
        rentalStartDate: new Date("2020-07-10"),
        transferDate: new Date("2029-01-01"), // 8년 6개월
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(true);
    expect(result.mandatoryPeriodYears).toBe(8);
    expect(result.reductionRate).toBe(0.5);
  });

  it("2020-07-11 등록 → 10년 의무 → 8년만으론 부족", () => {
    const result = calculateRentalReduction(
      makeInput({
        registrationDate: new Date("2020-07-11"),
        rentalStartDate: new Date("2020-07-11"),
        transferDate: new Date("2029-01-01"), // 8년 6개월 (10년 미충족)
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.mandatoryPeriodYears).toBe(10);
    expect(result.ineligibleReasons.some((r) => r.code === "RENTAL_PERIOD_SHORT")).toBe(true);
  });
});

describe("LR-14: 2020.8.18 이후 아파트 장기일반 등록 불가", () => {
  it("아파트 + 2020-08-18 이후 등록 → 불가 사유", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "long_term_private",
        propertyType: "apartment",
        registrationDate: new Date("2020-08-18"),
        rentalStartDate: new Date("2020-08-18"),
        transferDate: new Date("2031-01-01"),
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(
      result.ineligibleReasons.some(
        (r) => r.code === "APARTMENT_RESTRICTED_POST_2020_08_18",
      ),
    ).toBe(true);
  });

  it("비아파트 + 2020-08-18 이후 등록 → 허용", () => {
    const result = calculateRentalReduction(
      makeInput({
        rentalHousingType: "long_term_private",
        propertyType: "non_apartment",
        registrationDate: new Date("2020-08-18"),
        rentalStartDate: new Date("2020-08-18"),
        transferDate: new Date("2031-01-01"),
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(
      result.ineligibleReasons.some(
        (r) => r.code === "APARTMENT_RESTRICTED_POST_2020_08_18",
      ),
    ).toBe(false);
  });
});

// ============================================================
// LR-15: 임대사업자 미등록 → 감면 완전 배제
// ============================================================

describe("LR-15: 임대사업자 미등록", () => {
  it("지자체 미등록 → 감면 불가", () => {
    const result = calculateRentalReduction(
      makeInput({ isRegisteredLandlord: false }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.reductionAmount).toBe(0);
    expect(result.ineligibleReasons.some((r) => r.code === "NOT_REGISTERED_LANDLORD")).toBe(true);
  });

  it("세무서 미등록 → 감면 불가", () => {
    const result = calculateRentalReduction(
      makeInput({ isTaxRegistered: false }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.ineligibleReasons.some((r) => r.code === "NOT_TAX_REGISTERED")).toBe(true);
  });
});

// ============================================================
// LR-16: 임대료 증액 위반 → 감면 전액 배제
// ============================================================

describe("LR-16: 임대료 증액 위반 시 감면 전액 배제", () => {
  it("5.01% 증액 위반 → 감면 불가", () => {
    const rentHistory: RentHistory[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 0,
        deposit: 212_000_000, // 6% 증가 — 위반
        contractType: "jeonse",
      },
    ];
    const result = calculateRentalReduction(
      makeInput({
        rentHistory,
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
        calculatedTax: 10_000_000,
      }),
      RULES,
    );
    expect(result.isEligible).toBe(false);
    expect(result.reductionAmount).toBe(0);
    expect(result.ineligibleReasons.some((r) => r.code === "RENT_INCREASE_VIOLATION")).toBe(true);
    expect(result.rentIncreaseValidation.isAllValid).toBe(false);
  });
});

// ============================================================
// LR-17: 장기보유공제 특례율
// ============================================================

describe("getLongTermDeductionOverride", () => {
  it("LR-17: 8년 충족 → 장기보유공제 특례율 50%", () => {
    const result = getLongTermDeductionOverride(
      makeInput({
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
        rentHistory: [], // 위반 없음
      }),
      RULES,
    );
    expect(result.hasOverride).toBe(true);
    expect(result.overrideRate).toBe(0.5);
  });

  it("2020.7.11 이후 등록 → 10년 충족 시 70%", () => {
    const result = getLongTermDeductionOverride(
      makeInput({
        registrationDate: new Date("2020-07-11"),
        rentalStartDate: new Date("2020-07-11"),
        transferDate: new Date("2031-01-01"),
        rentHistory: [],
      }),
      RULES,
    );
    expect(result.hasOverride).toBe(true);
    expect(result.overrideRate).toBe(0.7);
  });

  it("공공건설임대 → 장기보유공제 특례 없음 (0)", () => {
    const result = getLongTermDeductionOverride(
      makeInput({ rentalHousingType: "public_construction" }),
      RULES,
    );
    expect(result.hasOverride).toBe(false);
  });

  it("임대사업자 미등록 → 특례 없음", () => {
    const result = getLongTermDeductionOverride(
      makeInput({ isRegisteredLandlord: false }),
      RULES,
    );
    expect(result.hasOverride).toBe(false);
  });

  it("임대료 위반 → 특례 없음", () => {
    const rentHistory: RentHistory[] = [
      {
        contractDate: new Date("2019-01-01"),
        monthlyRent: 0,
        deposit: 200_000_000,
        contractType: "jeonse",
      },
      {
        contractDate: new Date("2021-01-01"),
        monthlyRent: 0,
        deposit: 215_000_000, // 7.5% 위반
        contractType: "jeonse",
      },
    ];
    const result = getLongTermDeductionOverride(
      makeInput({ rentHistory }),
      RULES,
    );
    expect(result.hasOverride).toBe(false);
  });

  it("아파트 + 2020.8.18 이후 → 특례 없음", () => {
    const result = getLongTermDeductionOverride(
      makeInput({
        propertyType: "apartment",
        registrationDate: new Date("2020-08-18"),
        rentalStartDate: new Date("2020-08-18"),
        transferDate: new Date("2031-01-01"),
        rentHistory: [],
      }),
      RULES,
    );
    expect(result.hasOverride).toBe(false);
  });
});

// ============================================================
// LR-18: 감면 한도 (조특법 §133)
// ============================================================

describe("LR-18: 감면 한도 적용", () => {
  it("감면액 1억 이하 → 한도 미적용", () => {
    const result = calculateRentalReduction(
      makeInput({
        calculatedTax: 100_000_000, // 산출세액 1억
        rentalStartDate: new Date("2019-01-01"),
        transferDate: new Date("2027-06-01"),
      }),
      RULES,
    );
    // 50% 감면 = 5000만원 < 1억 → 한도 미적용
    expect(result.reductionAmount).toBe(50_000_000);
    expect(result.isLimitApplied).toBe(false);
  });

  it("🔴 §97 시리즈에는 §133 한도가 걸리지 않는다 (D1-05 정정)", () => {
    /**
     * 종전 anchor는 「1억 + 초과분×50% = 2억」을 단언하며 **결함을 고정**하고 있었다.
     * 조특법 §133①은 「제33조, 제43조, 제66조부터 제69조까지, …」, ②는 「제77조,
     * 제77조의2 또는 제77조의3」을 열거한다 — **§97·§97의3·§97의4·§97의5는 없다**.
     * 산식도 달랐다: §133①1호는 **하드 캡**이지 「초과분의 50%는 감면」이 아니다.
     *
     * 또한 종전 입력(2015 임대개시)은 §97① 본문의 「2000.12.31 이전 임대개시」 요건에
     * 미달한다 — D1-04로 이제 배제된다. 조문에 맞는 입력으로 바꿔 전액 감면을 고정한다.
     */
    const result = calculateRentalReduction(
      makeInput({
        calculatedTax: 300_000_000, // 산출세액 3억
        rentalHousingType: "public_construction",
        region: "capital",
        officialPriceAtStart: 200_000_000,
        rentalStartDate: new Date("1998-01-01"),
        transferDate: new Date("2005-06-01"),
        constructionYear: 1990, // §97①1호
      }),
      RULES,
    );
    expect(result.isLimitApplied).toBe(false);
    expect(result.reductionAmount).toBe(300_000_000);
  });

  it("🔴 2015 임대개시는 §97① 본문 시한 외로 배제된다 (D1-04)", () => {
    const result = calculateRentalReduction(
      makeInput({
        calculatedTax: 300_000_000,
        rentalHousingType: "public_construction",
        region: "capital",
        officialPriceAtStart: 200_000_000,
        rentalStartDate: new Date("2015-01-01"),
        transferDate: new Date("2021-01-01"),
        constructionYear: 2015,
      }),
      RULES,
    );
    expect(result.isEligible, "5년 임대만으로 100% 면제가 되면 안 된다").toBe(false);
    expect(result.reductionAmount).toBe(0);
  });
});

// ============================================================
// 임대 의무기간 8년 ±1일 달력 경계 (P1-2 회귀)
// ============================================================

describe("calculateEffectiveRentalPeriod — 8년 경계 (P1-2 회귀)", () => {
  // 2016-01-01 취득, 8년 의무기간: 2024-01-01이 딱 8년째

  it("2016-01-01 임대 시작 → 2024-01-01 종료(양도일): 정확히 8년 → 의무기간 충족", () => {
    // differenceInYears(2024-01-01, 2016-01-01) = 8
    const years = calculateEffectiveRentalPeriod(
      new Date("2016-01-01"),
      new Date("2024-01-01"),
      [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    expect(years).toBe(8);
  });

  it("2016-01-01 임대 시작 → 2023-12-31 종료(양도일): 7년 364일 → 의무기간 미충족", () => {
    // differenceInYears(2023-12-31, 2016-01-01) = 7
    const years = calculateEffectiveRentalPeriod(
      new Date("2016-01-01"),
      new Date("2023-12-31"),
      [],
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    expect(years).toBe(7);
  });

  it("공실 1일 차감 후 잔여 임대일로 8년 경계 재계산 (P1-2: addDays 기반)", () => {
    // 2016-01-01 시작, 2024-01-02 종료 (8년 + 1일)
    // 공실 1일 차감 → 실제 임대일 = 8년 정확히
    const vp: VacancyPeriod[] = [
      {
        startDate: new Date("2020-06-01"),
        endDate: new Date("2020-06-02"), // 1일 공실 — 유예 이내라 차감 대상 아님
      },
    ];
    const years = calculateEffectiveRentalPeriod(
      new Date("2016-01-01"),
      new Date("2024-01-02"), // 8년 + 1일
      vp,
      RENTAL_VACANCY_GRACE_MONTHS_97,
    );
    // 1일 공실은 3월 유예 이내라 차감 없음 → 8년 + 1일 → 8년
    expect(years).toBe(8);
  });
});
