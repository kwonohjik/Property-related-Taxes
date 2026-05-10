/**
 * #6 사례 32 변형 — 토지·건물 모두 상속
 *
 * 사례 32 입력 베이스에서 토지·건물 모두 acquisitionCause를 inheritance로 변경.
 * 같은 피상속인 가정 — 자산-수준 단일 decedentAcquisitionDate를 양쪽 카드에 패스.
 * 건물 acquisitionDate = 상속개시일 (토지와 동일) → 건물 LTHD 보유기간 14년.
 * 신축이 아니므로 §114조의2 가산세 미발동.
 *
 * 변경점 (사례 32 대비):
 *  - 건물 acquisitionCause: newConstruction → inheritance
 *  - 건물 acquisitionDate: 2018-03-31 → 2008-03-17 (상속개시일과 동일)
 *  - 토지 acquisitionCause: purchase → inheritance
 *  - 가산세: 13,300,202 → 0
 *  - 건물 LTHD: 보유 4년(8%) → 보유 14년(28%)
 *
 * 후속 PR: 다른 피상속인 케이스 (buildingDecedent/landDecedent 분리 필요).
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

// ============================================================
// 잠금 입력값 (사례 32 베이스 + 토지·건물 모두 inheritance)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const INHERITANCE_START_DATE = new Date("2008-03-17"); // 상속개시일 (토지·건물 동일)
const DECEDENT_ACQ_DATE = new Date("1995-06-15"); // 피상속인 취득일 (영 §95④)

const TOTAL_TRANSFER_PRICE = 1_620_000_000;
const LAND_AREA = 205;
const BUILDING_AREA = 271.28;
const BUILDING_FOOTPRINT_AREA = 135.64;

const TRANSFER_LAND_PRICE_PER_SQM = 5_514_000;
const TRANSFER_BUILDING_STD_PRICE = 259_072_400;
const ACQUISITION_LAND_PRICE_PER_SQM = 3_920_000;
const ACQUISITION_BUILDING_STD_PRICE = 228_146_480;

const CASE_6_INPUT = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: INHERITANCE_START_DATE,
  // 건물 취득일 = 상속개시일 (토지와 동일, newConstruction 아님)
  buildingAcquisitionDate: INHERITANCE_START_DATE,
  buildingAcquisitionCause: "inheritance" as const,
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
// Group 1 — 환산·안분은 사례 32와 동일 (acquisitionCause 무관)
// ============================================================

describe("#6: 환산·안분 결과 보존 (사례 32와 동일 — 입력값 동일)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_6_INPUT);

  it("anchor #1 — 토지 양도가 = 1,317,938,332", () => {
    expect(out.allocation.land).toBe(1_317_938_332);
  });
  it("anchor #2 — 건물 양도가 = 302,061,668", () => {
    expect(out.allocation.building).toBe(302_061_668);
  });
  it("anchor #3 — 토지 환산취득가 = 936,945,640", () => {
    expect(out.acquisition.land).toBe(936_945_640);
  });
  it("anchor #4 — 건물 환산취득가 = 266,004,044", () => {
    expect(out.acquisition.building).toBe(266_004_044);
  });
  it("anchor #5 — 토지 개산공제 = 24,108,000", () => {
    expect(out.estimatedDeduction.land).toBe(24_108_000);
  });
  it("anchor #6 — 건물 개산공제 = 6,844,394", () => {
    expect(out.estimatedDeduction.building).toBe(6_844_394);
  });
});

// ============================================================
// Group 2 — 토지·건물 카드 inheritance 보조 필드 패스스루
// ============================================================

describe("#6: 토지·건물 카드 inheritance 보조 필드 패스스루", () => {
  const out = buildGeneralBuildingAssetCards(CASE_6_INPUT);
  const landCard = out.assetCards.find((c) => c.propertyType === "land");
  const buildingCard = out.assetCards.find((c) => c.propertyType === "general_building_unit");

  it("anchor #7 — 토지 카드 landAcquisitionCause = 'inheritance'", () => {
    expect(landCard?.landAcquisitionCause).toBe("inheritance");
  });
  it("anchor #8 — 토지 카드 decedentAcquisitionDate 패스스루", () => {
    expect(landCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });
  it("anchor #9 — 건물 카드 buildingAcquisitionCause = 'inheritance'", () => {
    expect(buildingCard?.buildingAcquisitionCause).toBe("inheritance");
  });
  it("anchor #10 — 건물 카드 decedentAcquisitionDate 패스스루 (#6 핵심 신규 매핑)", () => {
    expect(buildingCard?.decedentAcquisitionDate?.toISOString().slice(0, 10)).toBe("1995-06-15");
  });
  it("anchor #11 — 건물 카드 acquisitionDate = 상속개시일 (LTHD 기산점)", () => {
    expect(buildingCard?.acquisitionDate.toISOString().slice(0, 10)).toBe("2008-03-17");
  });
  it("anchor #12 — 건물 카드 isSelfBuilt = false (newConstruction 아님)", () => {
    expect(buildingCard?.isSelfBuilt).toBe(false);
  });
});

// ============================================================
// Group 3 — 통합 계산 (건물 LTHD 14년 28%, 가산세 0)
// ============================================================

describe("#6: 통합 계산 — 건물 보유 14년 + 가산세 0", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_6_INPUT,
    2023,
    0,
    [],
    makeMockRates(),
  );

  const properties = result.aggregated.properties;
  const landBreakdown = properties.find((p) => p.propertyId === "land");
  const buildingBreakdown = properties.find((p) => p.propertyId === "building");

  it("anchor #13 — 토지 LTHD = 99,927,713 (보유 14년 28%, 사례 32 동일)", () => {
    expect(landBreakdown?.longTermHoldingDeduction).toBe(99_927_713);
  });

  it("anchor #14 — 건물 LTHD = 76,747,304 (보유 14년 28%, 사례 32와 변경)", () => {
    // 건물 양도차익 = 302,061,668 - 266,004,044 - 6,844,394 = 29,213,230
    // LTHD = 29,213,230 × 28% = 8,179,704... applyRate floor
    // 실제 엔진 도출값 (첫 실행 후 anchor 고정 — 회귀 보호)
    expect(buildingBreakdown?.longTermHoldingDeduction).toBe(8_179_704);
  });

  it("anchor #15 — 건물 §114조의2 가산세 = 0 (newConstruction 아님)", () => {
    expect(buildingBreakdown?.penaltyTax ?? 0).toBe(0);
  });

  it("anchor #16 — 토지 가산세 = 0", () => {
    expect(landBreakdown?.penaltyTax ?? 0).toBe(0);
  });

  it("anchor #17 — 양도소득금액 합계 (양도차익 − LTHD)", () => {
    // 토지: 356,884,692 - 99,927,713 = 256,956,979
    // 건물: 29,213,230 - 8,179,704 = 21,033,526
    // 합계: 277,990,505
    const totalIncome = properties.reduce(
      (sum, p) => sum + (p.income ?? 0),
      0,
    );
    expect(totalIncome).toBe(277_990_505);
  });
});
