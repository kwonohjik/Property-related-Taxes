/**
 * 사례 32 — 신축 건물 단기양도 §114조의2 5% 가산세 anchor 테스트
 *
 * 예제 PDF #32: 갑씨 서울 성북구 석관동 248-3
 *   토지 취득: 2008-03-17
 *   건물 신축 완공(사용승인): 2018-03-31 (영 §162①4호 빠른 날)
 *   양도: 2023-02-19 / 총 1,620,000,000원
 *   → 건물 보유기간 4년 10개월 19일 (~4.88년) < 5년 → §114조의2 ① 가산세 발동
 *
 * 입력값 역산 (BigInt 정밀 검산 — anchor 전수 만족):
 *   totalStd   = 205 × 5,514,000 + transferBuildingStdPrice
 *              = 1,130,370,000 + 259,072,400 = 1,389,442,400
 *   transferBuildingStdPrice = 259,072,400
 *     → INT(1,620,000,000 × 1,130,370,000 / 1,389,442,400) = 1,317,938,332 ✓
 *   acquisitionBuildingStdPrice = 228,146,480
 *     → INT(302,061,668 × 228,146,480 / 259,072,400) = 266,004,044 ✓
 *     → INT(228,146,480 × 0.03) = 6,844,394 ✓
 *
 * anchor 총 21개 (toBe() 정확 매칭):
 *   본 사례 17개 + 5년 경계 가드 3개 + buildingAcquisitionCause=purchase 가드 1개
 *   (마이그레이션: isSelfBuilt → buildingAcquisitionCause 분리, 2026-05-10)
 *
 * 정책 적용:
 *   feedback_estimated_deduction_separation.md — usedEstimatedAcquisition anchor (#16, #17)
 *   feedback_transfer_year_tax_rate.md — anchor는 양도소득금액까지만, 산출세액 이후 회귀만
 */

import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ============================================================
// 잠금 입력값 (BigInt 정밀 역산 확정)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const LAND_ACQUISITION_DATE = new Date("2008-03-17"); // 토지 취득일
const BUILDING_ACQUISITION_DATE = new Date("2018-03-31"); // ★ 건물 취득일 (영 §162①4호 빠른 날)

const TOTAL_TRANSFER_PRICE = 1_620_000_000;
const LAND_AREA = 205;
const BUILDING_AREA = 271.28;
const BUILDING_FOOTPRINT_AREA = 135.64; // 271.28 ÷ 2층 균등 추정

// 양도시점 기준시가
const TRANSFER_LAND_PRICE_PER_SQM = 5_514_000; // 2022년
// 역산: INT(1,620,000,000 × 1,130,370,000 / totalStd) = 1,317,938,332
// totalStd = 1,389,442,400 → buildingStd = 1,389,442,400 - 1,130,370,000 = 259,072,400
const TRANSFER_BUILDING_STD_PRICE = 259_072_400;

// 취득시점 기준시가
const ACQUISITION_LAND_PRICE_PER_SQM = 3_920_000; // 2007년
// 역산: INT(302,061,668 × acqBld / 259,072,400) = 266,004,044
//      + INT(acqBld × 0.03) = 6,844,394
// → acqBld = 228,146,480
const ACQUISITION_BUILDING_STD_PRICE = 228_146_480;

const CASE_32_BASE_INPUT = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: LAND_ACQUISITION_DATE,
  buildingAcquisitionDate: BUILDING_ACQUISITION_DATE, // ★ 건물 취득일 (영 §162①4호 빠른 날)
  buildingAcquisitionCause: "newConstruction" as const, // ★ 신축취득 (isSelfBuilt 라우트 헬퍼에서 도출)
  landArea: LAND_AREA,
  buildingArea: BUILDING_AREA,
  buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
  transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
  transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
  acquisitionLandPricePerSqm: ACQUISITION_LAND_PRICE_PER_SQM,
  acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
  // 일반 주거지역 + 수도권 (성북구) → 배율 3배
  zoneType: "general_residential",
  isMetropolitan: true,
};

// ============================================================
// Step 1 — 양도가 안분 (시행령 §166⑥) anchor
// ============================================================

describe("사례 32: 양도가 안분 (§166⑥) — 토지·건물 취득일 분리", () => {
  const out = buildGeneralBuildingAssetCards(CASE_32_BASE_INPUT);

  it("anchor #1 — 토지 양도가 = 1,317,938,332", () => {
    // 토지기준시가 = 205 × 5,514,000 = 1,130,370,000
    // 전체기준시가 = 1,130,370,000 + 259,072,400 = 1,389,442,400
    // 토지 = INT(1,620,000,000 × 1,130,370,000 / 1,389,442,400)
    expect(out.allocation.land).toBe(1_317_938_332);
  });

  it("anchor #2 — 건물 양도가 = 302,061,668", () => {
    // 1,620,000,000 − 1,317,938,332 = 302,061,668 (잔액 보정)
    expect(out.allocation.building).toBe(302_061_668);
  });

  it("토지+건물 합계 = 1,620,000,000 (이중 floor 오차 0)", () => {
    expect(out.allocation.land + out.allocation.building).toBe(1_620_000_000);
  });
});

// ============================================================
// Step 2 — 환산취득가 (시행령 §176의2②) anchor
// ============================================================

describe("사례 32: 환산취득가 (§176의2②)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_32_BASE_INPUT);

  it("anchor #3 — 토지 환산취득가 = 936,945,640", () => {
    // 취득시 토지기준시가 = 205 × 3,920,000 = 803,600,000
    // 토지환산 = INT(1,317,938,332 × 803,600,000 / 1,130,370,000)
    expect(out.acquisition.land).toBe(936_945_640);
  });

  it("anchor #4 — 건물 환산취득가 = 266,004,044", () => {
    // 건물환산 = INT(302,061,668 × 228,146,480 / 259,072,400)
    expect(out.acquisition.building).toBe(266_004_044);
  });
});

// ============================================================
// Step 3 — 개산공제 (시행령 §163⑥, 등기 3%) anchor
// ============================================================

describe("사례 32: 개산공제 (§163⑥)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_32_BASE_INPUT);

  it("anchor #5 — 토지 개산공제 = 24,108,000", () => {
    // INT(205 × 3,920,000 × 0.03) = INT(803,600,000 × 0.03) = 24,108,000
    expect(out.estimatedDeduction.land).toBe(24_108_000);
  });

  it("anchor #6 — 건물 개산공제 = 6,844,394", () => {
    // INT(228,146,480 × 0.03) = 6,844,394
    expect(out.estimatedDeduction.building).toBe(6_844_394);
  });
});

// ============================================================
// 양도차익 anchor
// ============================================================

describe("사례 32: 양도차익", () => {
  const out = buildGeneralBuildingAssetCards(CASE_32_BASE_INPUT);

  it("anchor #7 — 토지 양도차익 = 356,884,692", () => {
    // 1,317,938,332 − 936,945,640 − 24,108,000 = 356,884,692
    const gain = out.allocation.land - out.acquisition.land - out.estimatedDeduction.land;
    expect(gain).toBe(356_884_692);
  });

  it("anchor #8 — 건물 양도차익 = 29,213,230", () => {
    // 302,061,668 − 266,004,044 − 6,844,394 = 29,213,230
    const gain = out.allocation.building - out.acquisition.building - out.estimatedDeduction.building;
    expect(gain).toBe(29_213_230);
  });
});

// ============================================================
// 건물 카드 acquisitionDate 분리 — 토지·건물 취득일 다름 검증
// ============================================================

describe("사례 32: 자산 카드 acquisitionDate 분리", () => {
  const out = buildGeneralBuildingAssetCards(CASE_32_BASE_INPUT);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("토지 카드 acquisitionDate = 2008-03-17 (토지 취득일)", () => {
    expect(landCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2008-03-17");
  });

  it("건물 카드 acquisitionDate = 2018-03-31 (영 §162①4호 빠른 날)", () => {
    expect(buildingCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2018-03-31");
  });

  it("anchor #16 — 토지 카드 usedEstimatedAcquisition = true (정책 #4 회귀 가드)", () => {
    // feedback_estimated_deduction_separation.md: estimatedBase·estimatedDeduction 누락 방지
    expect(landCard?.usedEstimatedAcquisition).toBe(true);
  });

  it("anchor #17 — 건물 카드 usedEstimatedAcquisition = true (정책 #4 회귀 가드)", () => {
    expect(buildingCard?.usedEstimatedAcquisition).toBe(true);
  });

  it("건물 카드 isSelfBuilt = true (가산세 발동 정보)", () => {
    expect(buildingCard?.isSelfBuilt).toBe(true);
  });

  it("토지 카드 isSelfBuilt = false (토지는 §114조의2 대상 아님)", () => {
    expect(landCard?.isSelfBuilt).toBeFalsy();
  });
});

// ============================================================
// 통합 계산 — LTHD + 양도소득금액 합계 + §114조의2 가산세
// ============================================================

describe("사례 32: 통합 계산 (calculateGeneralBuildingTransfer) — 양도소득금액 + 가산세", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_32_BASE_INPUT,
    2023, 0, [], makeMockRates(),
  );

  const properties = result.aggregated.properties;
  const landProp = properties.find((p) => p.propertyId === "land");
  const buildingProp = properties.find((p) => p.propertyId === "building");

  it("자산 카드 2장 생성 (전체 사업용 — 허용 405.92㎡ > 205㎡)", () => {
    // 수평투영 135.64 × 3배(수도권 일반주거) = 406.92㎡ > 205㎡ → 전체 사업용
    expect(landProp).toBeDefined();
    expect(buildingProp).toBeDefined();
    expect(properties.find((p) => p.propertyId === "land_nbl")).toBeUndefined();
  });

  it("anchor #9 — 토지 LTHD (14년 28%) = 99,927,713", () => {
    // 토지 보유기간: 2008-03-17 → 2023-02-19 = 약 14년 11개월 → 14년 → 28%
    // 356,884,692 × 28% = 99,927,713 (floor)
    const landBreakdown = result.aggregated.properties.find((p) => p.propertyId === "land");
    expect(landBreakdown?.longTermHoldingDeduction).toBe(99_927_713);
  });

  it("anchor #10 — 건물 LTHD (4년 8%) = 2,337,058", () => {
    // 건물 보유기간: 2018-03-31 → 2023-02-19 = 약 4년 10개월 → 4년 → 8%
    // 29,213,230 × 8% = 2,337,058 (floor)
    const buildingBreakdown = result.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.longTermHoldingDeduction).toBe(2_337_058);
  });

  it("anchor #11 — 토지 양도소득금액 = 256,956,979", () => {
    // 356,884,692 − 99,927,713 = 256,956,979
    // PerPropertyBreakdown.income = transferGain - longTermHoldingDeduction (차손 통산 전)
    const landBreakdown = result.aggregated.properties.find((p) => p.propertyId === "land");
    expect(landBreakdown?.income).toBe(256_956_979);
  });

  it("anchor #12 — 건물 양도소득금액 = 26,876,172", () => {
    // 29,213,230 − 2,337,058 = 26,876,172
    const buildingBreakdown = result.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.income).toBe(26_876_172);
  });

  it("anchor #13 — 양도소득금액 합계 = 283,833,151", () => {
    // 256,956,979 + 26,876,172 = 283,833,151
    // income = transferGain - longTermHoldingDeduction (통산 전 양도소득금액)
    const totalIncome = result.aggregated.properties.reduce(
      (sum, p) => sum + (p.income ?? 0), 0,
    );
    expect(totalIncome).toBe(283_833_151);
  });

  it("anchor #14 — §114조의2 가산세 = 13,300,202 (건물 환산취득가 266,004,044 × 5%)", () => {
    // applyRate(266,004,044, 0.05) = floor(266,004,044 × 0.05) = 13,300,202
    const buildingBreakdown = result.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.penaltyTax).toBe(13_300_202);
  });

  it("anchor #15 — 토지 카드 penaltyTax = 0 (§114조의2 ①은 건물 한정)", () => {
    const landBreakdown = result.aggregated.properties.find((p) => p.propertyId === "land");
    expect(landBreakdown?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 5년 기산점 경계 가드 (소득세법 §114조의2 ① "5년 이내")
// "이내" = 당일 포함 해석. addYears(constructionDate, 5)로 5년 시점 산정 후
// transferDate > fifthAnniversary 이면 미적용 (즉 정확히 5년 정각 양도는 발동).
// 윤년 안전: 2020-02-29 + 5년 = 2025-02-28 등 월말 경계 date-fns가 표준화.
// ============================================================

describe("사례 32: §114조의2 5년 경계 가드", () => {
  it("anchor #18 — 만 5년 −1일 (2018-03-31 → 2023-03-30) → 가산세 발동", () => {
    const result18 = calculateGeneralBuildingTransfer(
      {
        ...CASE_32_BASE_INPUT,
        buildingAcquisitionDate: new Date("2018-03-31"),
        transferDate: new Date("2023-03-30"),
      },
      2023, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result18.aggregated.properties.find((p) => p.propertyId === "building");
    expect((buildingBreakdown?.penaltyTax ?? 0)).toBeGreaterThan(0);
  });

  it("anchor #19 — 만 5년 정각 (2018-03-31 → 2023-03-31) → 가산세 발동", () => {
    // "5년 이내"는 당일 포함 해석 (사용자 지침, 후속 PR 4번 반영).
    // addYears(2018-03-31, 5) = 2023-03-31. transferDate == fifthAnniversary 이면 발동.
    const result19 = calculateGeneralBuildingTransfer(
      {
        ...CASE_32_BASE_INPUT,
        buildingAcquisitionDate: new Date("2018-03-31"),
        transferDate: new Date("2023-03-31"),
      },
      2023, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result19.aggregated.properties.find((p) => p.propertyId === "building");
    expect((buildingBreakdown?.penaltyTax ?? 0)).toBeGreaterThan(0);
  });

  it("anchor #20 — 만 5년 +1일 (2018-03-31 → 2023-04-01) → 가산세 미발동", () => {
    const result20 = calculateGeneralBuildingTransfer(
      {
        ...CASE_32_BASE_INPUT,
        buildingAcquisitionDate: new Date("2018-03-31"),
        transferDate: new Date("2023-04-01"),
      },
      2023, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result20.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.penaltyTax ?? 0).toBe(0);
  });

  it("anchor #21 — 윤년 경계 (2020-02-29 → 2025-02-28) → 가산세 발동 (당일 포함)", () => {
    // date-fns addYears(2020-02-29, 5) = 2025-02-28 (월말 보정).
    // 365.25 분모 방식은 1826/365.25 = 4.9986 → 발동, 새 방식도 == → 발동 (동일).
    // 이 anchor는 향후 코드 변경 시 윤년 경계가 깨지지 않도록 보호.
    const result21 = calculateGeneralBuildingTransfer(
      {
        ...CASE_32_BASE_INPUT,
        buildingAcquisitionDate: new Date("2020-02-29"),
        transferDate: new Date("2025-02-28"),
      },
      2025, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result21.aggregated.properties.find((p) => p.propertyId === "building");
    expect((buildingBreakdown?.penaltyTax ?? 0)).toBeGreaterThan(0);
  });

  it("anchor #22 — 윤년 경계 +1일 (2020-02-29 → 2025-03-01) → 가산세 미발동", () => {
    // addYears(2020-02-29, 5) = 2025-02-28 → transferDate 2025-03-01 > → 미적용.
    const result22 = calculateGeneralBuildingTransfer(
      {
        ...CASE_32_BASE_INPUT,
        buildingAcquisitionDate: new Date("2020-02-29"),
        transferDate: new Date("2025-03-01"),
      },
      2025, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result22.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// buildingAcquisitionCause = "purchase" 가드 (일반 매입 건물 — 가산세 미적용)
// ============================================================

describe("사례 32: buildingAcquisitionCause=purchase → 가산세 0", () => {
  it("anchor #21 — buildingAcquisitionCause: purchase 시 penaltyTax = 0", () => {
    const result21 = calculateGeneralBuildingTransfer(
      { ...CASE_32_BASE_INPUT, buildingAcquisitionCause: "purchase" },
      2023, 0, [], makeMockRates(),
    );
    const buildingBreakdown = result21.aggregated.properties.find((p) => p.propertyId === "building");
    expect(buildingBreakdown?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 사례 31 호환 — buildingAcquisitionDate 미입력 시 fallback
// ============================================================

describe("사례 32: 사례 31 호환 — buildingAcquisitionDate 미입력 fallback", () => {
  it("buildingAcquisitionDate 미입력 시 토지 취득일로 fallback (purchase 경로)", () => {
    const out = buildGeneralBuildingAssetCards({
      ...CASE_32_BASE_INPUT,
      buildingAcquisitionDate: undefined,
      buildingAcquisitionCause: "purchase",  // newConstruction 아닌 경로 — fallback 허용
    });
    const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");
    // fallback = acquisitionDate (토지 취득일)
    expect(buildingCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2008-03-17");
  });
});
