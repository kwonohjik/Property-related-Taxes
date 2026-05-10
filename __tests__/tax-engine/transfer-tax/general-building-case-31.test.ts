/**
 * 사례 31 — 일반건물(토지+건물 일괄) 환산취득가 anchor 테스트 (단위)
 *
 * 양도코리아 사례 31 — 서울 동작구 사당동 132-10 근린생활시설 건물
 *   양도 2023-02-19 / 925,000,000원
 *   취득 1999-05-24 / 실가 확인 불가 → 환산취득가
 *   토지 부수면적 85㎡ / 건물 연면적 180.96㎡ (2층, 1971년 사용승인)
 *   양도시 공시지가 10,830,000원/㎡ (2022)
 *   취득시 공시지가  2,800,000원/㎡ (1998)
 *   양도시 건물기준시가 20,629,440 (BigInt 정밀 검산 — anchor 904,725,192 역산 정답)
 *   취득시 건물기준시가 28,144,700 (개산공제 역산 잠금)
 *
 * BigInt 검산 경위 (2026-05-08 정정):
 *   anchor 904,725,192 = INT(925,000,000 × 920,550,000 / X)
 *   X = 851,508,750,000,000,000 / 904,725,192 ≈ 941,179,440.74
 *   → 양도시 건물기준시가 = 941,179,440 − 920,550,000 = 20,629,440
 *   (이전에 검토 단계에서 20,627,816으로 검산 실수 → 엔진이 904,726,753 출력 → anchor 미달.
 *    엔진 시니어가 처음부터 보고한 20,629,440이 정답.)
 *
 * 단위 테스트 anchor 8종:
 *   case31_allocation_land            → 904,725,192
 *   case31_allocation_building        →  20,274,808
 *   case31_acq_land                   → 233,908,636
 *   case31_acq_building               →  27,660,876  (분모 20,629,440 적용 결과)
 *   case31_estimated_deduction_land   →   7,140,000
 *   case31_estimated_deduction_building →   844,341
 *   case31_gain_land                  → 663,676,556
 *   case31_gain_building              →  -8,230,409  (-844,341 -27,660,876 +20,274,808)
 *
 * NBL 판정:
 *   바닥면적 추정 = 180.96 ÷ 2 = 90.48㎡
 *   인정한도 = 90.48 × 3 = 271.44㎡  ≫ 부수토지 85㎡  → 사업용
 *
 * anchor 정책: 모두 toBe() 정확 일치. ±0원.
 */

import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingAssetCards,
  calcLandGain,
  calcBuildingGain,
} from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

// ============================================================
// 잠금 입력값 (Plan §10 + Design §B BigInt 정밀 검산 확정)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const ACQUISITION_DATE = new Date("1999-05-24");

const TOTAL_TRANSFER_PRICE = 925_000_000;
const LAND_AREA = 85;
const BUILDING_AREA = 180.96;
// 수평투영면적 (사용자 직접 입력) — 종전 연면적 180.96 ÷ 층수 2 균등층 가정값과 동일
const BUILDING_FOOTPRINT_AREA = 90.48;

// 양도시점 기준시가
const TRANSFER_LAND_PRICE_PER_SQM = 10_830_000; // 2022년
const TRANSFER_BUILDING_STD_PRICE = 20_629_440; // BigInt 정밀 검산 — anchor 904,725,192 만족 분모 941,179,440 역산

// 취득시점 기준시가
const ACQUISITION_LAND_PRICE_PER_SQM = 2_800_000; // 1998년
const ACQUISITION_BUILDING_STD_PRICE = 28_144_700; // 844,341 ÷ 0.03 역산

const CASE_31_INPUT: GeneralBuildingInput = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: ACQUISITION_DATE,
  landArea: LAND_AREA,
  buildingArea: BUILDING_AREA,
  buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
  transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
  transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
  acquisitionLandPricePerSqm: ACQUISITION_LAND_PRICE_PER_SQM,
  acquisitionBuildingStdPrice: ACQUISITION_BUILDING_STD_PRICE,
  // 사례 31 — 도심 상업지역 + 수도권 → 3배 배율 → 허용 271.44㎡ > 85㎡ → 전체 사업용
  zoneType: "commercial",
  isMetropolitan: true,
};

// ============================================================
// Step A — 양도가 안분 (시행령 §166⑥)
// ============================================================

describe("사례 31: 일반건물 일괄 환산취득가 — 양도가 안분 (§166⑥)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_31_INPUT);

  it("case31_allocation_land — 토지 양도가 안분 = 904,725,192", () => {
    // 분모 = 10,830,000×85 + 20,629,440 = 920,550,000 + 20,629,440 = 941,179,440
    // 토지 = INT(925,000,000 × 920,550,000 / 941,179,440) = 904,725,192
    expect(out.allocation.land).toBe(904_725_192);
  });

  it("case31_allocation_building — 건물 양도가 안분 (잔액 보정) = 20,274,808", () => {
    // 925,000,000 − 904,725,192 = 20,274,808
    expect(out.allocation.building).toBe(20_274_808);
  });

  it("토지+건물 양도가 합계 = 925,000,000 (이중 floor 오차 0)", () => {
    expect(out.allocation.land + out.allocation.building).toBe(925_000_000);
  });
});

// ============================================================
// Step B — 환산취득가 (시행령 §176의2②)
// ============================================================

describe("사례 31: 환산취득가 (§176의2②)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_31_INPUT);

  it("case31_acq_land — 토지 환산취득가 = 233,908,636", () => {
    // 토지 = INT(904,725,192 × 238,000,000 / 920,550,000) = 233,908,636
    expect(out.acquisition.land).toBe(233_908_636);
  });

  it("case31_acq_building — 건물 환산취득가 = 27,660,876", () => {
    // 건물 = INT(20,274,808 × 28,144,700 / 20,629,440) = 27,660,876
    expect(out.acquisition.building).toBe(27_660_876);
  });
});

// ============================================================
// Step C — 개산공제 (시행령 §163⑥, 등기 자산 3%)
// ============================================================

describe("사례 31: 개산공제 (§163⑥)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_31_INPUT);

  it("case31_estimated_deduction_land — 토지 개산공제 = 7,140,000", () => {
    // 토지 = INT(2,800,000 × 85 × 0.03) = INT(238,000,000 × 0.03) = 7,140,000
    expect(out.estimatedDeduction.land).toBe(7_140_000);
  });

  it("case31_estimated_deduction_building — 건물 개산공제 = 844,341", () => {
    // 건물 = INT(28,144,700 × 0.03) = 844,341
    expect(out.estimatedDeduction.building).toBe(844_341);
  });
});

// ============================================================
// Step D — 자산별 양도차익 (장특 전)
// ============================================================

describe("사례 31: 자산별 양도차익 (§94① · 장특 전)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_31_INPUT);

  it("case31_gain_land — 토지 양도차익 = +663,676,556", () => {
    // 904,725,192 − 233,908,636 − 7,140,000 = 663,676,556
    expect(calcLandGain(out)).toBe(663_676_556);
  });

  it("case31_gain_building — 건물 양도차익 (차손) = −8,230,409", () => {
    // 20,274,808 − 27,660,876 − 844,341 = −8,230,409
    expect(calcBuildingGain(out)).toBe(-8_230_409);
  });
});

// ============================================================
// NBL 판정 (§168의8) — 사업용 (배율 내)
// ============================================================

describe("사례 31: 비사업용토지 판정 — 사업용", () => {
  const out = buildGeneralBuildingAssetCards(CASE_31_INPUT);

  it("수평투영면적 = 사용자 직접 입력 90.48㎡", () => {
    expect(out.buildingFootprintArea).toBeCloseTo(90.48, 2);
  });

  it("배율 = 수도권 상업지역 3배", () => {
    expect(out.appliedMultiplier).toBe(3);
    expect(out.multiplierDetail).toBe("수도권 주·상·공 3배");
  });

  it("인정한도 = 90.48 × 3 = 271.44㎡", () => {
    expect(out.allowedLandArea).toBeCloseTo(271.44, 2);
  });

  it("초과분 없음 (전체 사업용) — nonBusinessRatio = 0", () => {
    expect(out.nonBusinessRatio).toBe(0);
    expect(out.nonBusinessArea).toBe(0);
    expect(out.isWithinNblRatio).toBe(true);
  });

  it("case31_nbl_within_ratio — 부수토지 85㎡ ≤ 271.44㎡ → 사업용 true", () => {
    expect(out.isWithinNblRatio).toBe(true);
  });

  it("자산 카드 토지의 isNonBusinessLand = false (사업용)", () => {
    const landCard = out.assetCards.find((c) => c.propertyId === "land");
    expect(landCard?.isNonBusinessLand).toBe(false);
  });
});

// ============================================================
// 자산 카드 구조 검증 (aggregate 위임 입력)
// ============================================================

describe("사례 31: aggregate 위임용 자산 카드 2장", () => {
  const out = buildGeneralBuildingAssetCards(CASE_31_INPUT);

  it("자산 카드는 토지·건물 2장", () => {
    expect(out.assetCards).toHaveLength(2);
  });

  it("토지 카드: propertyType=land, transfer/acq/expenses 배선 일치", () => {
    const land = out.assetCards.find((c) => c.propertyId === "land");
    expect(land?.propertyType).toBe("land");
    expect(land?.transferPrice).toBe(904_725_192);
    expect(land?.acquisitionPrice).toBe(233_908_636);
    expect(land?.expenses).toBe(7_140_000);
    expect(land?.usedEstimatedAcquisition).toBe(true);
    expect(land?.estimatedBase).toBe(233_908_636);
    expect(land?.estimatedDeduction).toBe(7_140_000);
  });

  it("건물 카드: propertyType=general_building_unit, 차손 자산 배선 일치", () => {
    const bldg = out.assetCards.find((c) => c.propertyId === "building");
    expect(bldg?.propertyType).toBe("general_building_unit");
    expect(bldg?.transferPrice).toBe(20_274_808);
    expect(bldg?.acquisitionPrice).toBe(27_660_876);
    expect(bldg?.expenses).toBe(844_341);
    expect(bldg?.usedEstimatedAcquisition).toBe(true);
  });
});
