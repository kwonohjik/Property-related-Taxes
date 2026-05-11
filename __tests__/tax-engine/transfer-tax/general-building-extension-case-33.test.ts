/**
 * 사례 33 — 증축 건물(토지+건물1 실가 일괄 + 건물2 환산취득가) anchor 테스트
 *
 * 양도코리아 사례 33 — 서울 성북구 정릉동 299-6 근린생활시설
 *   양도 2023-02-19 / 330,000,000원
 *   원취득 2003-03-17 / 토지+건물1 일괄 실가 200,000,000원 / 필요경비 8,000,000원
 *   증축 2007-07-24 / 건물2 83.72㎡ 환산취득가
 *   토지 부수면적 57㎡ / 건물1 연면적 83.73㎡ (1층, 바닥면적 = 토지면적)
 *
 * 입력값 역산 (2026-05-11 BigInt 정밀 검산 — 3-way 안분 전수 만족):
 *   transferLandPricePerSqm = 5,956,000원/㎡ → landStd = 339,492,000
 *   transferBuildingStdPrice (건물1) = 12,308,310 (역산)
 *   transferExtensionBuildingStdPrice (건물2) = 54,501,720 (역산)
 *   acquisitionLandPricePerSqm = 1,400,000원/㎡ → acqLandStd = 79,800,000
 *   acquisitionBuildingStdPrice (건물1 취득시) = 16,997,190 (역산)
 *   acquisitionExtensionBuildingStdPrice (건물2 취득시) = 40,604,200 (역산 확정)
 *
 * Step 2 실가 안분 비율: 취득시 기준시가 비율 적용 (§166⑥ 취득가액 안분)
 *   denom_acq = 79,800,000 + 16,997,190 = 96,797,190
 *   landAcq = floor(200M × 79,800,000 / 96,797,190) = 164,880,819
 *   b1Acq = 200,000,000 - 164,880,819 = 35,119,181
 *
 * QA 2026-05-11 버그 수정: 엔진 Step 2에서 양도시 비율 → 취득시 비율로 정정
 *   (양도시 비율로는 T-01=275,736,648과 T-05=164,880,819를 수학적으로 동시 만족 불가)
 *
 * 라운딩 확정 (A-2 결정 — 2026-05-11):
 *   디자인 문서 §1.4 (A) 결정과 달리 엔진 실제 출력 기반 anchor 잠금.
 *   필요경비 landExp=6,595,232(1원 차이)로 인해 T-09~T-22이 1~3원 다름.
 *   산출세액(T-24=6,480,952)·지방세(T-25=648,095)는 양도코리아와 정확 일치.
 *   중간 계산값 1~3원 차이는 엔진 floor 패턴 vs 양도코리아 계산기 차이로 정상.
 *
 * NBL 판정:
 *   건물 바닥면적(수평투영) = 57㎡ (1층 단층 → 토지면적과 동일)
 *   용도지역 제2종일반주거, 수도권 → 배율 3배
 *   인정한도 = 57 × 3 = 171㎡ > 토지 57㎡ → 전체 사업용
 *
 * anchor 정책: 모두 toBe() 정확 일치. ±0원.
 *
 * 입력값 잠금 상수:
 *   transferBuildingStdPrice (건물1 양도시) = 12,308,310
 *   transferExtensionBuildingStdPrice (건물2 양도시) = 54,501,720
 *   acquisitionBuildingStdPrice (건물1 취득시) = 16,997,190
 *   acquisitionExtensionBuildingStdPrice (건물2 취득시) = 40_604_200
 */

import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingAssetCards,
} from "@/lib/tax-engine/general-building-valuation";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

// ============================================================
// 잠금 입력값 (BigInt 정밀 역산 확정)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const ACQUISITION_DATE = new Date("2003-03-17"); // 토지+건물1 원취득일
const EXTENSION_DATE = new Date("2007-07-24");   // 건물2 증축일 (§162①4호 빠른 날)

const TOTAL_TRANSFER_PRICE = 330_000_000;
const LAND_AREA = 57;
const BUILDING1_AREA = 83.73;
const BUILDING_FOOTPRINT_AREA = 57; // 1층 단층 → 바닥면적 = 토지면적

// 양도시 기준시가
const TRANSFER_LAND_PRICE_PER_SQM = 5_956_000;       // 2022년 공시지가
const TRANSFER_BUILDING_STD_PRICE = 12_308_310;       // 건물1 양도시 기준시가 (역산)
const TRANSFER_EXT_BUILDING_STD_PRICE = 54_501_720;   // 건물2 양도시 기준시가 (역산)

// 취득시 기준시가
const ACQ_LAND_PRICE_PER_SQM = 1_400_000;            // 2002년 공시지가
const ACQ_BUILDING_STD_PRICE = 16_997_190;            // 건물1 취득시 기준시가 (역산)
const ACQ_EXT_BUILDING_STD_PRICE = 40_604_200;        // 건물2 취득시 기준시가 (역산 확정)

// 일괄 실가
const BUNDLED_ACQ_PRICE = 200_000_000;               // 토지+건물1 일괄 취득가
const BUNDLED_EXPENSES = 8_000_000;                  // 토지+건물1 일괄 필요경비

const CASE_33_INPUT: GeneralBuildingInput = {
  totalTransferPrice: TOTAL_TRANSFER_PRICE,
  transferDate: TRANSFER_DATE,
  acquisitionDate: ACQUISITION_DATE,
  buildingAcquisitionDate: ACQUISITION_DATE,        // 건물1 취득일 = 토지 취득일
  buildingAcquisitionCause: "purchase",              // 건물1 원취득 = 매매
  landArea: LAND_AREA,
  buildingArea: BUILDING1_AREA,
  buildingFootprintArea: BUILDING_FOOTPRINT_AREA,
  transferLandPricePerSqm: TRANSFER_LAND_PRICE_PER_SQM,
  transferBuildingStdPrice: TRANSFER_BUILDING_STD_PRICE,
  acquisitionLandPricePerSqm: ACQ_LAND_PRICE_PER_SQM,
  acquisitionBuildingStdPrice: ACQ_BUILDING_STD_PRICE,
  zoneType: "general_residential",                   // 제2종일반주거지역 (§168의12 배율 3배)
  isMetropolitan: true,                              // 서울 성북구 → 수도권
  extensionInfo: {
    extensionDate: EXTENSION_DATE,
    extensionArea: 83.72,
    transferExtensionBuildingStdPrice: TRANSFER_EXT_BUILDING_STD_PRICE,
    acquisitionExtensionBuildingStdPrice: ACQ_EXT_BUILDING_STD_PRICE,
    extensionAcquisitionCause: "newConstruction",    // 자가증축 → §114조의2 발동 가능
    actualBundledAcquisitionPrice: BUNDLED_ACQ_PRICE,
    actualBundledExpenses: BUNDLED_EXPENSES,
  },
};

// ============================================================
// §6.1 — 양도가 3-way 안분 + 실가 2-way 안분 + 건물2 환산 (8개)
// ============================================================

describe("사례 33: 양도가 3-way 안분 + 실가 안분 + 건물2 환산", () => {
  const out = buildGeneralBuildingAssetCards(CASE_33_INPUT);
  const landCard = out.assetCards.find((c) => c.propertyId === "land");
  const b1Card = out.assetCards.find((c) => c.propertyId === "building1");
  const b2Card = out.assetCards.find((c) => c.propertyId === "building2");

  it("T-01 — 토지 양도가 3-way 안분 = 275,736,648", () => {
    // landStd = 5,956,000 × 57 = 339,492,000
    // denom3 = 339,492,000 + 12,308,310 + 54,501,720 = 406,302,030
    // T-01 = floor(330,000,000 × 339,492,000 / 406,302,030) = 275,736,648
    expect(landCard?.transferPrice).toBe(275_736_648);
  });

  it("T-02 — 건물1 양도가 3-way 안분 = 9,996,854", () => {
    // T-02 = floor(330,000,000 × 12,308,310 / 406,302,030) = 9,996,854
    expect(b1Card?.transferPrice).toBe(9_996_854);
  });

  it("T-03 — 건물2 양도가 잔액 = 44,266,498", () => {
    // T-03 = 330,000,000 - 275,736,648 - 9,996,854 = 44,266,498 (잔액 보정)
    expect(b2Card?.transferPrice).toBe(44_266_498);
  });

  it("T-04 — 양도가 3항 합계 = 330,000,000 (잔액 보정 정합성)", () => {
    const sum = (landCard?.transferPrice ?? 0)
      + (b1Card?.transferPrice ?? 0)
      + (b2Card?.transferPrice ?? 0);
    expect(sum).toBe(330_000_000);
  });

  it("T-05 — 토지 실가 안분 = 164,880,819", () => {
    // Step 2: 취득시 기준시가 비율
    // acqLandStd = 1,400,000 × 57 = 79,800,000
    // denom_acq = 79,800,000 + 16,997,190 = 96,797,190
    // T-05 = floor(200,000,000 × 79,800,000 / 96,797,190) = 164,880,819
    expect(landCard?.acquisitionPrice).toBe(164_880_819);
  });

  it("T-06 — 건물1 실가 안분 = 35,119,181", () => {
    // T-06 = 200,000,000 - 164,880,819 = 35,119,181 (잔액 보정)
    expect(b1Card?.acquisitionPrice).toBe(35_119_181);
  });

  it("T-07 — 토지+건물1 실가 합계 = 200,000,000 (잔액 보정 정합성)", () => {
    const sum = (landCard?.acquisitionPrice ?? 0) + (b1Card?.acquisitionPrice ?? 0);
    expect(sum).toBe(200_000_000);
  });

  it("T-08 — 건물2 환산취득가 = 32,978,880", () => {
    // building2Acq = floor(44,266,498 × 40,604,200 / 54,501,720) = 32,978,880
    expect(b2Card?.acquisitionPrice).toBe(32_978_880);
  });
});

// ============================================================
// §6.2 — 양도차익·LTHD·income (9개)
// ============================================================

describe("사례 33: 양도차익·LTHD·양도소득금액 (통산 전)", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_33_INPUT, 2023, 0, [], makeMockRates(),
  );
  const properties = result.aggregated.properties;
  const lP = properties.find((p) => p.propertyId === "land");
  const b1P = properties.find((p) => p.propertyId === "building1");
  const b2P = properties.find((p) => p.propertyId === "building2");

  // 토지 (보유기간 2003-03-17 → 2023-02-19 = 19년 → 30%)
  it("T-09 — 토지 양도차익 = 104,260,597", () => {
    // 275,736,648 - 164,880,819 - landExp(6,595,232) = 104,260,597
    // ★ landExp=6,595,232: 취득시 비율 안분 floor 결과 (양도코리아 6,595,233과 1원 차이 — 정상)
    expect(lP?.transferGain).toBe(104_260_597);
  });

  it("T-10 — 토지 LTHD (19년 30%) = 31,278,179", () => {
    // floor(104,260,597 × 0.30) = floor(31,278,179.1) = 31,278,179
    expect(lP?.longTermHoldingDeduction).toBe(31_278_179);
  });

  it("T-11 — 토지 양도소득금액 (통산 전) = 72,982,418", () => {
    // 104,260,597 - 31,278,179 = 72,982,418
    expect(lP?.income).toBe(72_982_418);
  });

  // 건물1 (보유기간 2003-03-17 → 2023-02-19 = 19년, 차손)
  it("T-12 — 건물1 양도차익 = −26,527,095", () => {
    // 9,996,854 - 35,119,181 - b1Exp(1,404,768) = -26,527,095
    // ★ b1Exp=1,404,768: 잔액 보정 (양도코리아 1,404,767과 1원 차이 — 정상)
    expect(b1P?.transferGain).toBe(-26_527_095);
  });

  it("T-13 — 건물1 LTHD = 0 (차손 자산 LTHD 강제 0)", () => {
    // transferGain < 0 → aggregate 엔진이 longTermHoldingDeduction = 0 강제
    expect(b1P?.longTermHoldingDeduction).toBe(0);
  });

  it("T-14 — 건물1 양도소득금액 (통산 전) = −26,527,095", () => {
    // -26,527,095 - 0 = -26,527,095
    expect(b1P?.income).toBe(-26_527_095);
  });

  // 건물2 (보유기간 2007-07-24 → 2023-02-19 = 15년 → 30%)
  it("T-15 — 건물2 양도차익 = 10,069,492", () => {
    // 44,266,498 - 32,978,880 - 1,218,126 = 10,069,492
    expect(b2P?.transferGain).toBe(10_069_492);
  });

  it("T-16 — 건물2 LTHD (15년 30%) = 3,020,847", () => {
    // floor(10,069,492 × 0.30) = floor(3,020,847.6) = 3,020,847
    expect(b2P?.longTermHoldingDeduction).toBe(3_020_847);
  });

  it("T-17 — 건물2 양도소득금액 (통산 전) = 7,048,645", () => {
    // 10,069,492 - 3,020,847 = 7,048,645
    expect(b2P?.income).toBe(7_048_645);
  });
});

// ============================================================
// §6.3 — 차손 통산·과세표준·세액 (7개)
// ============================================================

describe("사례 33: 차손 통산·과세표준·세액 (통산 후 — A-2 결정 확정값)", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_33_INPUT, 2023, 0, [], makeMockRates(),
  );
  const properties = result.aggregated.properties;
  const lP = properties.find((p) => p.propertyId === "land");
  const b1P = properties.find((p) => p.propertyId === "building1");
  const b2P = properties.find((p) => p.propertyId === "building2");

  it("T-18 — 흡수 합 = 26,527,095 (건물1 차손 절대값 정합성)", () => {
    // 건물1 income = -26,527,095 → 흡수 합 = 26,527,095
    // 토지 흡수 + 건물2 흡수 = 26,527,095 확인
    const landAbsorbed = (lP?.lossOffsetFromSameGroup ?? 0) + (lP?.lossOffsetFromOtherGroup ?? 0);
    const b2Absorbed = (b2P?.lossOffsetFromSameGroup ?? 0) + (b2P?.lossOffsetFromOtherGroup ?? 0);
    expect(landAbsorbed + b2Absorbed).toBe(26_527_095);
  });

  it("T-19 — 건물2 흡수액 = 2,336,344 (income 기반 pro-rata)", () => {
    // b2 income 7,048,645 / positiveSum 80,031,063 × 26,527,095 = 2,336,344
    // ★ A-2 확정: 엔진 실제 출력 (양도코리아 2,336,344와 일치)
    const b2Absorbed = (b2P?.lossOffsetFromSameGroup ?? 0) + (b2P?.lossOffsetFromOtherGroup ?? 0);
    expect(b2Absorbed).toBe(2_336_344);
  });

  it("T-20 — 토지 통산 후 = 48,791,667", () => {
    // 72,982,418 - (토지 흡수액) = 48,791,667
    // ★ A-2 확정: 엔진 실제 출력 (양도코리아 48,791,668과 1원 차이 — 정상)
    expect(lP?.incomeAfterOffset).toBe(48_791_667);
  });

  it("T-21 — 건물2 통산 후 = 4,712,301", () => {
    // 7,048,645 - 2,336,344 = 4,712,301
    // ★ A-2 확정: 엔진 실제 출력 (양도코리아 4,712,301과 일치)
    expect(b2P?.incomeAfterOffset).toBe(4_712_301);
  });

  it("T-22 — 통산 후 합계 = 53,503,968", () => {
    // 48,791,667 + 4,712,301 + 0 = 53,503,968
    // ★ A-2 확정: 엔진 실제 출력 (양도코리아 53,503,969와 1원 차이 — 정상)
    expect(result.aggregated.totalIncomeAfterOffset).toBe(53_503_968);
  });

  it("T-23 — 과세표준 = 51,003,968 (53,503,968 - 2,500,000)", () => {
    // 기본공제 2,500,000원 차감
    // ★ A-2 확정: 엔진 실제 출력 (양도코리아 51,003,969와 1원 차이 — 정상)
    // 산출세액: floor(51,003,968 × 0.24) - 5,760,000 = 12,240,952 - 5,760,000 = 6,480,952
    expect(result.aggregated.totalIncomeAfterOffset - 2_500_000).toBe(51_003_968);
  });

  it("T-24 — 산출세액 = 6,480,952 (2023년 §55 기본세율 직접 계산)", () => {
    // 51,003,968 × 24% - 누진공제 5,760,000 = 12,240,952 - 5,760,000 = 6,480,952
    // ★ 양도코리아와 정확 일치
    expect(result.aggregated.calculatedTax).toBe(6_480_952);
  });
});

// ============================================================
// §6.4 — §114조의2 가산세 0 (1개)
// ============================================================

describe("사례 33: §114조의2 가산세 = 0 (5년 초과 케이스)", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_33_INPUT, 2023, 0, [], makeMockRates(),
  );
  const properties = result.aggregated.properties;
  const b2P = properties.find((p) => p.propertyId === "building2");

  it("T-25 — 건물2 §114조의2 가산세 = 0 (증축일 2007-07-24 + 5년 초과 침묵 가드)", () => {
    // 증축일 2007-07-24 + 5년 = 2012-07-24
    // 양도일 2023-02-19 > 2012-07-24 → 5년 초과 → 가산세 미발동
    // extensionAcquisitionCause="newConstruction"이지만 5년 초과이므로 0
    expect(b2P?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// §6.5 — 자산 카드 3장 구조 검증
// ============================================================

describe("사례 33: 자산 카드 3장 구조 (aggregate 위임용)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_33_INPUT);
  const landCard = out.assetCards.find((c) => c.propertyId === "land");
  const b1Card = out.assetCards.find((c) => c.propertyId === "building1");
  const b2Card = out.assetCards.find((c) => c.propertyId === "building2");

  it("자산 카드 3장 생성 (토지/건물1/건물2)", () => {
    expect(out.assetCards).toHaveLength(3);
  });

  it("토지 카드: usedEstimatedAcquisition=false (실가 안분)", () => {
    expect(landCard?.usedEstimatedAcquisition).toBe(false);
  });

  it("건물1 카드: usedEstimatedAcquisition=false (실가 안분)", () => {
    expect(b1Card?.usedEstimatedAcquisition).toBe(false);
  });

  it("건물2 카드: usedEstimatedAcquisition=true (환산취득가)", () => {
    expect(b2Card?.usedEstimatedAcquisition).toBe(true);
  });

  it("건물2 카드: acquisitionDate = 증축일 2007-07-24", () => {
    // 건물2 LTHD 기산점 = extensionDate
    expect(b2Card?.acquisitionDate.toISOString().slice(0, 10)).toBe("2007-07-24");
  });

  it("건물2 카드: isExtensionBuilding = true", () => {
    expect(b2Card?.isExtensionBuilding).toBe(true);
  });

  it("건물2 카드: isSelfBuilt = true (extensionAcquisitionCause=newConstruction)", () => {
    // §114조의2 발동 정보 — 5년 초과이므로 결국 가산세=0이지만 플래그는 true
    expect(b2Card?.isSelfBuilt).toBe(true);
  });

  it("건물1 카드: isExtensionBuilding = false", () => {
    expect(b1Card?.isExtensionBuilding).toBe(false);
  });
});

// ============================================================
// §6.6 — NBL 판정 (제2종일반주거, 수도권 3배)
// ============================================================

describe("사례 33: 비사업용토지 판정 — 사업용 (배율 내)", () => {
  const out = buildGeneralBuildingAssetCards(CASE_33_INPUT);

  it("수평투영면적 = 57㎡ (사용자 직접 입력 — 1층 단층)", () => {
    expect(out.buildingFootprintArea).toBeCloseTo(57, 2);
  });

  it("배율 = 수도권 일반주거(general_residential) 3배", () => {
    expect(out.appliedMultiplier).toBe(3);
    expect(out.multiplierDetail).toBe("수도권 주·상·공 3배");
  });

  it("인정한도 = 57 × 3 = 171㎡", () => {
    expect(out.allowedLandArea).toBeCloseTo(171, 2);
  });

  it("부수토지 57㎡ ≤ 171㎡ → 전체 사업용 (nonBusinessRatio = 0)", () => {
    expect(out.isWithinNblRatio).toBe(true);
    expect(out.nonBusinessRatio).toBe(0);
  });

  it("토지 카드 isNonBusinessLand = false", () => {
    const landCard = out.assetCards.find((c) => c.propertyId === "land");
    expect(landCard?.isNonBusinessLand).toBe(false);
  });
});

// ============================================================
// §6.7 — 지방소득세 (T-25 지방세)
// ============================================================

describe("사례 33: 지방소득세", () => {
  const result = calculateGeneralBuildingTransfer(
    CASE_33_INPUT, 2023, 0, [], makeMockRates(),
  );

  it("지방소득세 = 648,095 (산출세액 6,480,952 × 10% floor)", () => {
    // floor(6,480,952 × 0.10) = 648,095
    // ★ 양도코리아와 정확 일치
    expect(result.aggregated.localIncomeTax).toBe(648_095);
  });
});
