// 장기임대 §97 시리즈 — evaluator 단위 anchor
// 케이스 인벤토리: docs/02-design/features/transfer-rental-reduction.engine.design.md
// (조문별 파일 분리 설계였으나 단위 evaluator는 단일 파일로 통합 — 케이스 매핑 주석 유지)
import { describe, it, expect } from "vitest";
import { evaluateRental973 } from "@/lib/tax-engine/transfer-reductions/rental-97-3";
import { evaluateRental974, getRental974AdditionalRate } from "@/lib/tax-engine/transfer-reductions/rental-97-4";
import { evaluateRental975 } from "@/lib/tax-engine/transfer-reductions/rental-97-5";
import { evaluateRental97Main } from "@/lib/tax-engine/transfer-reductions/rental-97-main";
import { evaluateRental972 } from "@/lib/tax-engine/transfer-reductions/rental-97-2";
import type { Rental97EvaluationInput } from "@/lib/tax-engine/transfer-reductions/types";

// §97의3 적격 기본 입력 (케이스 #9 기반)
function base973(overrides?: Partial<Rental97EvaluationInput>): Rental97EvaluationInput {
  return {
    id: "rental_97_3",
    transferDate: new Date("2024-06-01"),
    acquisitionDate: new Date("2014-01-01"),
    registrationDate: new Date("2014-01-01"),
    rentalStartDate: new Date("2014-01-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    officialPriceAtStart: 400_000_000,
    isNationalHousingScale: true,
    region: "capital",
    // D9-07 — propertyType(아파트 여부)·rentalHousingType은 evaluateRental973이 읽지
    // 않는 사문 필드였다(구별력 0 실측). 엔진 입력 타입에서 제거했다.
    isConvertedFromShortTerm: false,
    ...overrides,
  };
}

describe("§97의3 evaluateRental973", () => {
  it("케이스 #9: 10년 임대·요건 전부 충족 → overrideRate 0.7·ratio 1", () => {
    const r = evaluateRental973(base973());
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "overrideRate" in r) {
      expect(r.overrideRate).toBe(0.7);
      expect(r.rentalGainRatio).toBe(1);
      expect(r.eligibleRentalYears).toBeGreaterThanOrEqual(10);
    }
  });

  it("케이스 #10: 9년 임대 + 2022.12.31 이전 등록 → 8년 50% 경과규정 적용 (R-1)", () => {
    const r = evaluateRental973(base973({
      acquisitionDate: new Date("2015-07-01"),
      rentalStartDate: new Date("2015-07-01"),
      registrationDate: new Date("2015-07-01"),
    }));
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "overrideRate" in r) {
      expect(r.overrideRate).toBe(0.5); // 8~10년 구간 → 50%
      expect(r.eligibleRentalYears).toBeGreaterThanOrEqual(8);
      expect(r.eligibleRentalYears).toBeLessThan(10);
    }
  });

  it("케이스 #10b: 9년 임대 + 2023.1.1 이후 등록 → 기간 미달 불적용 (8년 유형 폐지, R-1)", () => {
    const r = evaluateRental973(base973({
      acquisitionDate: new Date("2023-06-01"),
      rentalStartDate: new Date("2023-06-01"),
      registrationDate: new Date("2023-06-01"),
      transferDate: new Date("2032-05-01"),
    }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "RENTAL_PERIOD_SHORT")).toBe(true);
    }
  });

  it("케이스 #11: 임대료 위반 신고 → 불적용", () => {
    const r = evaluateRental973(base973({ rentIncreaseViolated: true }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "RENT_INCREASE_VIOLATED")).toBe(true);
    }
  });

  it("케이스 #12: 2020.7.11 이후 단기→장기 변경 → 제외", () => {
    const r = evaluateRental973(base973({ isConvertedFromShortTerm: true }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "CONVERTED_FROM_SHORT_TERM")).toBe(true);
    }
  });

  it("케이스 #14: 기준시가 한도 초과 (수도권 6억 초과) → 불적용 (령 §97의3③4호)", () => {
    const r = evaluateRental973(base973({ officialPriceAtStart: 650_000_000 }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "OFFICIAL_PRICE_EXCEEDED")).toBe(true);
    }
  });

  it("수도권 밖 한도 3억 — 4억 입력 → 불적용", () => {
    const r = evaluateRental973(base973({ region: "non_capital", officialPriceAtStart: 400_000_000 }));
    expect(r.isEligible).toBe(false);
  });

  it("국민주택규모 미확인 → 불적용 (령 §97의3③2호)", () => {
    const r = evaluateRental973(base973({ isNationalHousingScale: false }));
    expect(r.isEligible).toBe(false);
  });

  it("임대개시 > 취득 + 기준시가 3점 미입력 → 안분 불가 불적용 (silent 안분 금지)", () => {
    const r = evaluateRental973(
      base973({ acquisitionDate: new Date("2010-01-01"), stdPriceAtAcquisition: undefined, stdPriceAtTransfer: undefined }),
    );
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "MISSING_PRORATION_PRICES")).toBe(true);
    }
  });
});

// §97의5 적격 기본 입력 (케이스 #19 — C-1)
function base975(overrides?: Partial<Rental97EvaluationInput>): Rental97EvaluationInput {
  return {
    id: "rental_97_5",
    transferDate: new Date("2029-02-01"),
    acquisitionDate: new Date("2018-10-01"),
    registrationDate: new Date("2018-12-01"),
    rentalStartDate: new Date("2018-12-01"),
    isTaxRegistered: true,
    rentIncreaseViolated: false,
    // 임대개시(12/1) > 취득(10/1) — 안분 3점: 개시=취득 기준시가 동일 → ratio 1
    stdPriceAtAcquisition: 300_000_000,
    stdPriceAtRentalStart: 300_000_000,
    stdPriceAtTransfer: 600_000_000,
    // CA-01 — §97의5①3호가 준용하는 조특령 §97의3③2호(국민주택규모)·4호(기준시가 6억/3억).
    // 종전 픽스처는 면적·기준시가·소재지 없이 `isEligible=true`를 단언해
    // 이 결함에 대한 회귀 테스트가 **0건**이었다(리뷰 지적).
    isNationalHousingScale: true,
    officialPriceAtStart: 300_000_000,
    region: "capital",
    calculatedTax: 50_000_000,
    ...overrides,
  };
}

describe("§97의5 evaluateRental975", () => {
  it("C-1 (케이스 #19): 3개월 내 등록·10년+ 임대 → 산출세액 5천만 전액 감면", () => {
    const r = evaluateRental975(base975());
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "reductionAmount" in r) {
      expect(r.reductionAmount).toBe(50_000_000);
      expect(r.isFullExemption).toBe(true);
    }
  });

  it("C-2 (케이스 #20): 취득 후 3개월 초과 등록 (2019.2.1) → 불적용", () => {
    const r = evaluateRental975(base975({ registrationDate: new Date("2019-02-01") }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "REGISTRATION_AFTER_3_MONTHS")).toBe(true);
    }
  });

  it("케이스 #21: 9년 임대 → 기간 미달 불적용", () => {
    const r = evaluateRental975(base975({ transferDate: new Date("2027-06-01") }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "RENTAL_PERIOD_SHORT")).toBe(true);
    }
  });

  it("시한 외 — 2019년 취득(계약·등록 fallback 2019) → 불적용", () => {
    const r = evaluateRental975(
      base975({
        acquisitionDate: new Date("2019-03-01"),
        registrationDate: new Date("2019-04-01"),
        rentalStartDate: new Date("2019-04-01"),
        transferDate: new Date("2030-06-01"),
      }),
    );
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "OUT_OF_PERIOD")).toBe(true);
    }
  });
});

describe("§97 본문/단서 evaluateRental97Main", () => {
  const baseMain = (overrides?: Partial<Rental97EvaluationInput>): Rental97EvaluationInput => ({
    id: "rental_97_main",
    transferDate: new Date("2005-06-01"),
    acquisitionDate: new Date("1995-03-01"),
    rentalStartDate: new Date("1996-01-01"),
    constructionYear: 1993,
    isNationalHousing: true,
    // D1-01 — 조특령 §97① 주체 요건(5호 이상). 종전 픽스처엔 이 필드가 없어
    // 「1호만 임대」도 50%·100% 감면을 받았고 이 anchor가 그 결함을 고정하고 있었다.
    hasMin5RentalUnits: true,
    calculatedTax: 10_000_000,
    ...overrides,
  });

  it("케이스 #1: 본문 — 1993 신축·5년+ 임대 → 50% 감면 5,000,000", () => {
    const r = evaluateRental97Main(baseMain());
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "reductionAmount" in r) {
      expect(r.reductionRate).toBe(0.5);
      expect(r.reductionAmount).toBe(5_000_000);
      expect(r.isFullExemption).toBe(false);
    }
  });

  it("케이스 #4: 단서 (c) 10년+ 임대 → 100% 면제", () => {
    const r = evaluateRental97Main(
      baseMain({ id: "rental_97_proviso", provisoCase: "c_10years", transferDate: new Date("2007-06-01") }),
    );
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "reductionAmount" in r) {
      expect(r.reductionRate).toBe(1.0);
      expect(r.reductionAmount).toBe(10_000_000);
    }
  });

  it("케이스 #3: 단서 (b) 매입임대 — 1995.1.1 이전 취득 → 불적용", () => {
    const r = evaluateRental97Main(
      baseMain({ id: "rental_97_proviso", provisoCase: "b_purchase", acquisitionDate: new Date("1994-06-01") }),
    );
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "PURCHASE_BEFORE_1995")).toBe(true);
    }
  });

  it("케이스 #5: 임대개시 2001.1.1 → 시한 외", () => {
    const r = evaluateRental97Main(baseMain({ rentalStartDate: new Date("2001-01-01"), transferDate: new Date("2008-06-01") }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "OUT_OF_PERIOD")).toBe(true);
    }
  });
});

describe("§97의2 evaluateRental972", () => {
  const base972 = (overrides?: Partial<Rental97EvaluationInput>): Rental97EvaluationInput => ({
    id: "rental_97_2",
    transferDate: new Date("2006-06-01"),
    acquisitionDate: new Date("2000-03-01"),
    contractDate: new Date("2000-02-01"),
    rentalStartDate: new Date("2000-04-01"),
    rental972Type: "purchase",
    isNationalHousing: true,
    // D1-07 — §97의2①2호 「취득 당시 입주된 사실이 없는 주택만 해당한다」.
    // 종전 픽스처엔 없어 취득 당시 임차인이 있던 주택도 100% 면제를 받았다.
    isUnoccupiedAtAcquisition: true,
    // D1-02 — 조특령 §97의2① 주체 요건. 종전 픽스처엔 이 필드가 없어 「신축 1호만 임대」도
    // 100% 면제를 받았고, 이 anchor가 그 결함을 고정(characterize)하고 있었다.
    hasNewRentalPlus2Units: true,
    calculatedTax: 20_000_000,
    ...overrides,
  });

  it("케이스 #7: 매입임대 2000년 계약·5년+ 임대 → 100% 면제 (F-1: 세액 단계)", () => {
    const r = evaluateRental972(base972());
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "reductionAmount" in r) {
      expect(r.reductionAmount).toBe(20_000_000);
      expect(r.isFullExemption).toBe(true);
    }
  });

  it("케이스 #8: 임대 4년 → 기간 미달 불적용", () => {
    const r = evaluateRental972(base972({ transferDate: new Date("2004-06-01") }));
    expect(r.isEligible).toBe(false);
    if (!r.isEligible) {
      expect(r.ineligibleReasons.some((x) => x.code === "RENTAL_PERIOD_SHORT")).toBe(true);
    }
  });
});

describe("§97의4 evaluateRental974 (⚠️ R-3 — 추가율 표 원문 미확정·UI 비활성 상태)", () => {
  it("추가율 표: 6년 2% / 7년 4% / 8년 6% / 9년 8% / 10년+ 10% / 5년 0%", () => {
    expect(getRental974AdditionalRate(5)).toBe(0);
    expect(getRental974AdditionalRate(6)).toBe(0.02);
    expect(getRental974AdditionalRate(7)).toBe(0.04);
    expect(getRental974AdditionalRate(8)).toBe(0.06);
    expect(getRental974AdditionalRate(9)).toBe(0.08);
    expect(getRental974AdditionalRate(10)).toBe(0.10);
    expect(getRental974AdditionalRate(15)).toBe(0.10);
  });

  it("케이스 #15·#16: 8년 임대 → additionalRate 0.06", () => {
    const r = evaluateRental974({
      id: "rental_97_4",
      transferDate: new Date("2024-06-01"),
      acquisitionDate: new Date("2016-01-01"),
      registrationDate: new Date("2016-03-01"),
      rentalStartDate: new Date("2016-03-01"),
      isTaxRegistered: true,
      rentIncreaseViolated: false,
      // D2-04 — 조특령 §97의4① → 소령 §167의3①2호 가목·다목 대상 요건.
      // 종전 픽스처엔 없어 기준시가 한도를 넘는 주택도 §97의4를 적용받았다.
      rental974Category: "purchase_a",
      officialPriceAtStart: 500_000_000,
    });
    expect(r.isEligible).toBe(true);
    if (r.isEligible && "additionalRate" in r) {
      expect(r.additionalRate).toBe(0.06);
    }
  });

  it("케이스 #17: 5년 임대 → 미달 불적용", () => {
    const r = evaluateRental974({
      id: "rental_97_4",
      transferDate: new Date("2021-06-01"),
      acquisitionDate: new Date("2016-01-01"),
      registrationDate: new Date("2016-03-01"),
      rentalStartDate: new Date("2016-03-01"),
      isTaxRegistered: true,
      rentIncreaseViolated: false,
    });
    expect(r.isEligible).toBe(false);
  });
});
