/**
 * #4-a 사례 32 변형 — 토지 상속 + 건물 신축 (회귀 보호 anchor)
 *
 * 사례 32 입력 베이스에서 토지 acquisitionCause만 inheritance로 변경.
 * 토지 LTHD 기산점 = acquisitionDate(상속개시일 2008-03-17) → 사례 32와 동일.
 * decedentAcquisitionDate(피상속인 취득일)는 단기보유 판정 기산점으로만 영향
 * (영 §95④) — 본 사례는 토지 14.9년 보유로 단기보유 분기 무관 → 결과 동일.
 *
 * Anchor 산출 방식: "엔진 도출 결과를 anchor로 고정해 회귀 보호".
 * 향후 inheritance 고유 처리 추가(피상속인취득일 영향 분기 등) 시 회귀 차단.
 *
 * 후속 PR: #6 (토지·건물 모두 상속), #7-a/b (토지 증여 + 건물 신축).
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ============================================================
// 잠금 입력값 (사례 32 베이스 + 토지 inheritance)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const LAND_INHERITANCE_DATE = new Date("2008-03-17"); // 토지 상속개시일 = LTHD 기산점
const DECEDENT_ACQ_DATE = new Date("1995-06-15"); // 피상속인 취득일 (영 §95④)
const BUILDING_ACQUISITION_DATE = new Date("2018-03-31"); // 건물 신축

const TOTAL_TRANSFER_PRICE = 1_620_000_000;
const LAND_AREA = 205;
const BUILDING_AREA = 271.28;
const BUILDING_FOOTPRINT_AREA = 135.64;

const TRANSFER_LAND_PRICE_PER_SQM = 5_514_000;
const TRANSFER_BUILDING_STD_PRICE = 259_072_400;
const ACQUISITION_LAND_PRICE_PER_SQM = 3_920_000;
const ACQUISITION_BUILDING_STD_PRICE = 228_146_480;

const CASE_4A_INPUT = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: LAND_INHERITANCE_DATE,
  buildingAcquisitionDate: BUILDING_ACQUISITION_DATE,
  buildingAcquisitionCause: "newConstruction" as const,
  // ★ #4-a 신규: 토지 inheritance + 피상속인 취득일
  landAcquisitionCause: "inheritance" as const,
  decedentAcquisitionDate: DECEDENT_ACQ_DATE,
  landArea: LAND_AREA,
  buildingArea: BUILDING_AREA,
  buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
  transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
  transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
  acquisitionLandPricePerSqm: ACQUISITION_LAND_PRICE_PER_SQM,
  acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
  zoneType: "general_residential",
  isMetropolitan: true,
};

// ============================================================
// Group 1 — 사례 32와 동일한 환산취득가 결과 보존
// ============================================================

describe("#4-a 사례 32 변형: 토지 상속 + 건물 신축 — 환산·안분 회귀 보호", () => {
  const out = buildGeneralBuildingAssetCards(CASE_4A_INPUT);

  it("anchor #1 — 토지 양도가 = 1,317,938,332 (사례 32 동일)", () => {
    expect(out.allocation.land).toBe(1_317_938_332);
  });

  it("anchor #2 — 건물 양도가 = 302,061,668 (사례 32 동일)", () => {
    expect(out.allocation.building).toBe(302_061_668);
  });

  it("anchor #3 — 토지 환산취득가 = 936,945,640 (사례 32 동일)", () => {
    expect(out.acquisition.land).toBe(936_945_640);
  });

  it("anchor #4 — 건물 환산취득가 = 266,004,044 (사례 32 동일)", () => {
    expect(out.acquisition.building).toBe(266_004_044);
  });

  it("anchor #5 — 토지 개산공제 = 24,108,000 (사례 32 동일)", () => {
    expect(out.estimatedDeduction.land).toBe(24_108_000);
  });

  it("anchor #6 — 건물 개산공제 = 6,844,394 (사례 32 동일)", () => {
    expect(out.estimatedDeduction.building).toBe(6_844_394);
  });
});

// ============================================================
// Group 2 — 토지 카드 inheritance 보조 필드 패스스루 검증
// ============================================================

describe("#4-a: 자산 카드 inheritance 보조 필드 패스스루", () => {
  const out = buildGeneralBuildingAssetCards(CASE_4A_INPUT);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #7 — 토지 카드 landAcquisitionCause = 'inheritance'", () => {
    expect(landCard?.landAcquisitionCause).toBe("inheritance");
  });

  it("anchor #8 — 토지 카드 decedentAcquisitionDate 패스스루", () => {
    expect(landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });

  it("anchor #9 — 토지 카드 acquisitionDate = 상속개시일 (LTHD 기산점)", () => {
    expect(landCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2008-03-17");
  });

  it("anchor #10 — 건물 카드는 inheritance 보조 필드 미설정", () => {
    expect(buildingCard?.landAcquisitionCause).toBeUndefined();
    expect(buildingCard?.decedentAcquisitionDate).toBeUndefined();
  });

  it("anchor #11 — 건물 카드 acquisitionDate = 사용승인일", () => {
    expect(buildingCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2018-03-31");
  });
});

// ============================================================
// Group 3 — 통합 계산 (LTHD·가산세) 회귀 보호
// ============================================================

describe("#4-a: 통합 계산 — 사례 32와 동일 결과 보존", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_4A_INPUT,
    2023,
    0,
    [],
    makeMockRates(),
  );

  const properties = result.aggregated.properties;
  const landBreakdown = properties.find((p) => p.propertyId === "land");
  const buildingBreakdown = properties.find((p) => p.propertyId === "building");

  it("anchor #12 — 토지 LTHD = 99,927,713 (보유 14년 28%, 사례 32 동일)", () => {
    expect(landBreakdown?.longTermHoldingDeduction).toBe(99_927_713);
  });

  it("anchor #13 — 건물 LTHD = 2,337,058 (보유 4년 8%, 사례 32 동일)", () => {
    expect(buildingBreakdown?.longTermHoldingDeduction).toBe(2_337_058);
  });

  it("anchor #14 — 건물 §114조의2 가산세 = 13,300,202 (사례 32 동일)", () => {
    // 266,004,044 × 5% = 13,300,202 (applyRate floor)
    expect(buildingBreakdown?.penaltyTax).toBe(13_300_202);
  });

  it("anchor #15 — 토지 가산세 = 0 (소득세법 §114조의2 ① 건물 한정)", () => {
    expect(landBreakdown?.penaltyTax ?? 0).toBe(0);
  });

  it("anchor #16 — 양도소득금액 합계 = 283,833,151 (사례 32 동일)", () => {
    const totalIncome = properties.reduce(
      (sum, p) => sum + (p.income ?? 0),
      0,
    );
    expect(totalIncome).toBe(283_833_151);
  });
});

// ============================================================
// Group 4 — 토지 default purchase 호환 회귀 (landAcquisitionCause 미입력)
// ============================================================

describe("#4-a: 토지 landAcquisitionCause 미입력 default 호환 (사례 32 본 회귀)", () => {
  const inputWithoutLandCause = {
    ...CASE_4A_INPUT,
    landAcquisitionCause: undefined,
    decedentAcquisitionDate: undefined,
  };
  const out = buildGeneralBuildingAssetCards(inputWithoutLandCause);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");

  it("anchor #17 — landAcquisitionCause 미입력 시 토지 카드 필드 undefined (사례 31·32 호환)", () => {
    expect(landCard?.landAcquisitionCause).toBeUndefined();
    expect(landCard?.decedentAcquisitionDate).toBeUndefined();
  });
});
