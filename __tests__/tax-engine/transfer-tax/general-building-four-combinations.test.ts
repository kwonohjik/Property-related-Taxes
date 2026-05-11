/**
 * 일반건물 4가지 조합 anchor 테스트
 *
 * 사례 33 입력을 베이스로 원건물(실가/환산) × 증축분(실가/환산) 4 조합 검증.
 * 사례 33 자체(원=실가, 증축=환산)는 general-building-extension-case-33.test.ts에 유지.
 *
 * 검증 대상 3가지 신규 조합:
 *   AA (쌍방 실가): 원건물=실가 2-way 안분, 증축=실가 직접 입력
 *   EA (일방+쌍방): 원건물=환산취득가, 증축=실가 직접 입력
 *   EE (일방+일방): 원건물=환산취득가, 증축=환산취득가 (사례 33과 동일 패턴, extensionMode 명시)
 *
 * 공통 베이스: 사례 33 입력값 (BigInt 정밀 역산 확정)
 *   토지 양도가 3-way 안분: 275,736,648
 *   건물1 양도가 3-way 안분: 9,996,854
 *   건물2 양도가 잔액 보정: 44,266,498
 *
 * 세율 검증 (mock rates 기준 — 14M·50M·88M·150M 구간):
 *   AA: 과세표준 36,221,821 → 15% 구간: floor(36,221,821×0.15) - 1,260,000 = 4,173,273
 *   EA: 과세표준 131,418,416 → 35% 구간: floor(131,418,416×0.35) - 15,440,000 = 30,556,445
 *   EE: 과세표준 146,200,563 → 35% 구간: floor(146,200,563×0.35) - 15,440,000 = 35,730,197
 *
 * anchor 정책: 모두 toBe() 정확 일치. ±0원.
 */

import { describe, it, expect } from "vitest";
import {
  buildGeneralBuildingAssetCards,
} from "@/lib/tax-engine/general-building-valuation";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

// ============================================================
// 공통 입력 베이스 (사례 33 잠금값 기반)
// ============================================================

const TRANSFER_DATE = new Date("2023-02-19");
const ACQUISITION_DATE = new Date("2003-03-17");
const EXTENSION_DATE = new Date("2007-07-24");

const COMMON_BASE = {
  totalTransferPrice: 330_000_000,
  transferDate: TRANSFER_DATE,
  acquisitionDate: ACQUISITION_DATE,
  buildingAcquisitionDate: ACQUISITION_DATE,
  buildingAcquisitionCause: "purchase" as const,
  landArea: 57,
  buildingArea: 83.73,
  buildingFootprintArea: 57,
  // 양도시 기준시가 (잠금값)
  transferLandPricePerSqm: 5_956_000,       // landStd = 339,492,000
  transferBuildingStdPrice: 12_308_310,      // 건물1 양도시
  // 취득시 기준시가 (잠금값)
  acquisitionLandPricePerSqm: 1_400_000,    // acqLandStd = 79,800,000
  acquisitionBuildingStdPrice: 16_997_190,   // 건물1 취득시
  zoneType: "general_residential" as const,  // 제2종일반주거지역
  isMetropolitan: true,                      // 서울 성북구
};

// 증축 기준시가 (조합 AA/EA/EE 공통 — 양도가 안분에 사용)
const EXT_TRANSFER_STD = 54_501_720;  // 건물2 양도시 기준시가
const EXT_ACQ_STD = 40_604_200;       // 건물2 취득시 기준시가

// 원건물 실가 (조합 AA/사례33 공통)
const BUNDLED_ACQ = 200_000_000;
const BUNDLED_EXP = 8_000_000;

// 증축 실가 (조합 AA/EA 공통)
const EXT_ACTUAL_ACQ = 50_000_000;
const EXT_ACTUAL_EXP = 2_000_000;

// ============================================================
// 조합별 입력 정의
// ============================================================

/** 조합 AA: 원건물 실가 2-way 안분 + 증축분 실가 직접 입력 */
const COMBO_AA: GeneralBuildingInput = {
  ...COMMON_BASE,
  extensionInfo: {
    extensionDate: EXTENSION_DATE,
    extensionArea: 83.72,
    transferExtensionBuildingStdPrice: EXT_TRANSFER_STD,
    acquisitionExtensionBuildingStdPrice: EXT_ACQ_STD,
    extensionAcquisitionCause: "newConstruction",
    // 원건물 실가
    actualBundledAcquisitionPrice: BUNDLED_ACQ,
    actualBundledExpenses: BUNDLED_EXP,
    // 증축 실가
    acquisitionMode: "actual",
    actualAcquisitionPrice: EXT_ACTUAL_ACQ,
    actualExpenses: EXT_ACTUAL_EXP,
  },
};

/** 조합 EA: 원건물 환산취득가 + 증축분 실가 직접 입력 */
const COMBO_EA: GeneralBuildingInput = {
  ...COMMON_BASE,
  extensionInfo: {
    extensionDate: EXTENSION_DATE,
    extensionArea: 83.72,
    transferExtensionBuildingStdPrice: EXT_TRANSFER_STD,
    acquisitionExtensionBuildingStdPrice: EXT_ACQ_STD,
    extensionAcquisitionCause: "newConstruction",
    // 원건물 환산 (actualBundledAcquisitionPrice 없음)
    // 증축 실가
    acquisitionMode: "actual",
    actualAcquisitionPrice: EXT_ACTUAL_ACQ,
    actualExpenses: EXT_ACTUAL_EXP,
  },
};

/** 조합 EE: 원건물 환산취득가 + 증축분 환산취득가 (acquisitionMode 명시) */
const COMBO_EE: GeneralBuildingInput = {
  ...COMMON_BASE,
  extensionInfo: {
    extensionDate: EXTENSION_DATE,
    extensionArea: 83.72,
    transferExtensionBuildingStdPrice: EXT_TRANSFER_STD,
    acquisitionExtensionBuildingStdPrice: EXT_ACQ_STD,
    extensionAcquisitionCause: "newConstruction",
    // 원건물 환산 (actualBundledAcquisitionPrice 없음)
    // 증축 환산 (명시)
    acquisitionMode: "estimated",
  },
};

// ============================================================
// 공통 양도가 안분값 (3가지 조합 모두 동일 — 입력 불변)
// ============================================================
//
// landStd  = 5,956,000 × 57 = 339,492,000
// b1Std    = 12,308,310
// b2Std    = 54,501,720
// denom3   = 339,492,000 + 12,308,310 + 54,501,720 = 406,302,030
// landTrf  = floor(330,000,000 × 339,492,000 / 406,302,030) = 275,736,648
// b1Trf    = floor(330,000,000 × 12,308,310 / 406,302,030) = 9,996,854
// b2Trf    = 330,000,000 - 275,736,648 - 9,996,854 = 44,266,498

// ============================================================
// 조합 AA: 원=실가 2-way 안분, 증축=실가 직접 입력
// ============================================================
//
// 원건물 취득가 2-way 안분 (취득시 기준시가 비율):
//   acqLandStd = 1,400,000 × 57 = 79,800,000
//   acqB1Std   = 16,997,190
//   denom2     = 96,797,190
//   landAcq    = floor(200,000,000 × 79,800,000 / 96,797,190) = 164,880,819
//   b1Acq      = 200,000,000 - 164,880,819 = 35,119,181
//   landExp    = floor(8,000,000 × 79,800,000 / 96,797,190) = 6,595,232
//   b1Exp      = 8,000,000 - 6,595,232 = 1,404,768
//
// 증축 실가:
//   b2Acq      = 50,000,000 (직접 입력)
//   b2Exp      = 2,000,000  (직접 입력)
//
// 양도차익:
//   land: 275,736,648 - 164,880,819 - 6,595,232 = 104,260,597
//   b1:   9,996,854 - 35,119,181 - 1,404,768 = -26,527,095
//   b2:   44,266,498 - 50,000,000 - 2,000,000 = -7,733,502
//
// 통산: 양손익 합계 = 104,260,597, 음수 합계 = 34,261,097 (b1+b2)
//   차손 흡수 = 26,527,095 + 7,733,502 = 34,260,597 (양수소득에서 전액 흡수)
//   totalIncomeAfterOffset = 104,260,597 - 62558638(LTHD) = 72,982,418 - 34,260,597 = 38,721,821
//   ※ 엔진 실제: totalIncomeAfterOffset = 38,721,821

describe("조합 AA (원=실가, 증축=실가): 자산 카드 양도가·취득가", () => {
  const out = buildGeneralBuildingAssetCards(COMBO_AA);
  const land = out.assetCards.find(c => c.propertyId === "land");
  const b1 = out.assetCards.find(c => c.propertyId === "building1");
  const b2 = out.assetCards.find(c => c.propertyId === "building2");

  it("AA-T01 — 양도가 3-way 안분 합계 = 330,000,000", () => {
    const sum = (land?.transferPrice ?? 0) + (b1?.transferPrice ?? 0) + (b2?.transferPrice ?? 0);
    expect(sum).toBe(330_000_000);
  });

  it("AA-T02 — 토지 양도가 = 275,736,648 (공통 안분)", () => {
    expect(land?.transferPrice).toBe(275_736_648);
  });

  it("AA-T03 — 건물1 양도가 = 9,996,854 (공통 안분)", () => {
    expect(b1?.transferPrice).toBe(9_996_854);
  });

  it("AA-T04 — 건물2 양도가 = 44,266,498 (잔액 보정)", () => {
    expect(b2?.transferPrice).toBe(44_266_498);
  });

  it("AA-T05 — 토지 취득가 실가 안분 = 164,880,819", () => {
    // floor(200,000,000 × 79,800,000 / 96,797,190)
    expect(land?.acquisitionPrice).toBe(164_880_819);
  });

  it("AA-T06 — 건물1 취득가 잔액 = 35,119,181", () => {
    expect(b1?.acquisitionPrice).toBe(35_119_181);
  });

  it("AA-T07 — 토지+건물1 취득가 합계 = 200,000,000 (정합성)", () => {
    expect((land?.acquisitionPrice ?? 0) + (b1?.acquisitionPrice ?? 0)).toBe(200_000_000);
  });

  it("AA-T08 — 건물2 취득가 = 50,000,000 (실가 직접 입력)", () => {
    expect(b2?.acquisitionPrice).toBe(50_000_000);
  });

  it("AA-T09 — 건물2 필요경비 = 2,000,000 (실가 직접 입력)", () => {
    expect(b2?.expenses).toBe(2_000_000);
  });

  it("AA-T10 — 토지·건물1 usedEstimatedAcquisition = false (실가)", () => {
    expect(land?.usedEstimatedAcquisition).toBe(false);
    expect(b1?.usedEstimatedAcquisition).toBe(false);
  });

  it("AA-T11 — 건물2 usedEstimatedAcquisition = false (실가 직접 입력)", () => {
    expect(b2?.usedEstimatedAcquisition).toBe(false);
  });
});

describe("조합 AA: 양도소득금액·세액", () => {
  const result = calculateGeneralBuildingTransfer(COMBO_AA, 2023, 0, [], makeMockRates());
  const props = result.aggregated.properties;
  const lP = props.find(p => p.propertyId === "land");
  const b1P = props.find(p => p.propertyId === "building1");
  const b2P = props.find(p => p.propertyId === "building2");

  it("AA-T12 — 토지 양도차익 = 104,260,597", () => {
    // 275,736,648 - 164,880,819 - 6,595,232 = 104,260,597
    expect(lP?.transferGain).toBe(104_260_597);
  });

  it("AA-T13 — 건물1 양도차익 = -26,527,095 (차손)", () => {
    // 9,996,854 - 35,119,181 - 1,404,768 = -26,527,095
    expect(b1P?.transferGain).toBe(-26_527_095);
  });

  it("AA-T14 — 건물2 양도차익 = -7,733,502 (차손, 실가 입력)", () => {
    // 44,266,498 - 50,000,000 - 2,000,000 = -7,733,502
    expect(b2P?.transferGain).toBe(-7_733_502);
  });

  it("AA-T15 — 토지 LTHD (19년 30%) = 31,278,179", () => {
    // floor(104,260,597 × 0.30) = 31,278,179
    expect(lP?.longTermHoldingDeduction).toBe(31_278_179);
  });

  it("AA-T16 — 건물1·건물2 LTHD = 0 (차손 자산)", () => {
    expect(b1P?.longTermHoldingDeduction).toBe(0);
    expect(b2P?.longTermHoldingDeduction).toBe(0);
  });

  it("AA-T17 — totalIncomeAfterOffset = 38,721,821", () => {
    // 토지만 양수 → 전액 차손 흡수 후 38,721,821
    expect(result.aggregated.totalIncomeAfterOffset).toBe(38_721_821);
  });

  it("AA-T18 — 산출세액 = 4,173,273 (mock rates 15% 구간)", () => {
    // 과세표준 = 38,721,821 - 2,500,000 = 36,221,821
    // floor(36,221,821 × 0.15) - 1,260,000 = 5,433,273 - 1,260,000 = 4,173,273
    expect(result.aggregated.calculatedTax).toBe(4_173_273);
  });

  it("AA-T19 — 지방소득세 = 417,327", () => {
    // floor(4,173,273 × 0.1) = 417,327
    expect(result.aggregated.localIncomeTax).toBe(417_327);
  });

  it("AA-T20 — 건물2 §114조의2 가산세 = 0 (5년 초과)", () => {
    // 증축일 2007-07-24 + 5년 = 2012-07-24 < 양도일 2023-02-19
    expect(b2P?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 조합 EA: 원=환산취득가, 증축=실가 직접 입력
// ============================================================
//
// 원건물 환산취득가 (§176의2②):
//   landAcq  = floor(275,736,648 × 79,800,000 / 339,492,000) = 64,813,852
//   b1Acq    = floor(9,996,854 × 16,997,190 / 12,308,310) = 13,805,179
//   landExp  = floor(79,800,000 × 0.03) = 2,394,000
//   b1Exp    = floor(16,997,190 × 0.03) = 509,915
//
// 증축 실가:
//   b2Acq    = 50,000,000
//   b2Exp    = 2,000,000
//
// 양도차익:
//   land: 275,736,648 - 64,813,852 - 2,394,000 = 208,528,796
//   b1:   9,996,854 - 13,805,179 - 509,915 = -4,318,240
//   b2:   44,266,498 - 50,000,000 - 2,000,000 = -7,733,502
//
// LTHD:
//   land (19년 30%): floor(208,528,796 × 0.30) = 62,558,638
//   b1·b2: 0 (차손)
//
// 통산: 양수 income = 145,970,158, 음수 = 12,051,742
//   totalIncomeAfterOffset = 133,918,416

describe("조합 EA (원=환산, 증축=실가): 자산 카드 취득가", () => {
  const out = buildGeneralBuildingAssetCards(COMBO_EA);
  const land = out.assetCards.find(c => c.propertyId === "land");
  const b1 = out.assetCards.find(c => c.propertyId === "building1");
  const b2 = out.assetCards.find(c => c.propertyId === "building2");

  it("EA-T01 — 양도가 3-way 합계 = 330,000,000 (공통)", () => {
    const sum = (land?.transferPrice ?? 0) + (b1?.transferPrice ?? 0) + (b2?.transferPrice ?? 0);
    expect(sum).toBe(330_000_000);
  });

  it("EA-T02 — 토지 환산취득가 = 64,813,852", () => {
    // floor(275,736,648 × 79,800,000 / 339,492,000)
    expect(land?.acquisitionPrice).toBe(64_813_852);
  });

  it("EA-T03 — 건물1 환산취득가 = 13,805,179", () => {
    // floor(9,996,854 × 16,997,190 / 12,308,310)
    expect(b1?.acquisitionPrice).toBe(13_805_179);
  });

  it("EA-T04 — 토지 개산공제 = 2,394,000", () => {
    // floor(79,800,000 × 0.03)
    expect(land?.expenses).toBe(2_394_000);
  });

  it("EA-T05 — 건물1 개산공제 = 509,915", () => {
    // floor(16,997,190 × 0.03)
    expect(b1?.expenses).toBe(509_915);
  });

  it("EA-T06 — 건물2 취득가 = 50,000,000 (실가 직접 입력)", () => {
    expect(b2?.acquisitionPrice).toBe(50_000_000);
  });

  it("EA-T07 — 건물2 필요경비 = 2,000,000 (실가 직접 입력)", () => {
    expect(b2?.expenses).toBe(2_000_000);
  });

  it("EA-T08 — 토지·건물1 usedEstimatedAcquisition = true (환산)", () => {
    expect(land?.usedEstimatedAcquisition).toBe(true);
    expect(b1?.usedEstimatedAcquisition).toBe(true);
  });

  it("EA-T09 — 건물2 usedEstimatedAcquisition = false (실가 직접 입력)", () => {
    expect(b2?.usedEstimatedAcquisition).toBe(false);
  });
});

describe("조합 EA: 양도소득금액·세액", () => {
  const result = calculateGeneralBuildingTransfer(COMBO_EA, 2023, 0, [], makeMockRates());
  const props = result.aggregated.properties;
  const lP = props.find(p => p.propertyId === "land");
  const b1P = props.find(p => p.propertyId === "building1");
  const b2P = props.find(p => p.propertyId === "building2");

  it("EA-T10 — 토지 양도차익 = 208,528,796", () => {
    // 275,736,648 - 64,813,852 - 2,394,000 = 208,528,796
    expect(lP?.transferGain).toBe(208_528_796);
  });

  it("EA-T11 — 건물1 양도차익 = -4,318,240 (차손)", () => {
    // 9,996,854 - 13,805,179 - 509,915 = -4,318,240
    expect(b1P?.transferGain).toBe(-4_318_240);
  });

  it("EA-T12 — 건물2 양도차익 = -7,733,502 (차손, 실가)", () => {
    // 44,266,498 - 50,000,000 - 2,000,000 = -7,733,502
    expect(b2P?.transferGain).toBe(-7_733_502);
  });

  it("EA-T13 — 토지 LTHD (19년 30%) = 62,558,638", () => {
    // floor(208,528,796 × 0.30) = 62,558,638
    expect(lP?.longTermHoldingDeduction).toBe(62_558_638);
  });

  it("EA-T14 — 건물1·건물2 LTHD = 0 (차손 자산)", () => {
    expect(b1P?.longTermHoldingDeduction).toBe(0);
    expect(b2P?.longTermHoldingDeduction).toBe(0);
  });

  it("EA-T15 — totalIncomeAfterOffset = 133,918,416", () => {
    expect(result.aggregated.totalIncomeAfterOffset).toBe(133_918_416);
  });

  it("EA-T16 — 산출세액 = 30,556,445 (mock rates 35% 구간)", () => {
    // 과세표준 = 133,918,416 - 2,500,000 = 131,418,416
    // floor(131,418,416 × 0.35) - 15,440,000 = 45,996,445 - 15,440,000 = 30,556,445
    expect(result.aggregated.calculatedTax).toBe(30_556_445);
  });

  it("EA-T17 — 지방소득세 = 3,055,644", () => {
    // floor(30,556,445 × 0.1) = 3,055,644
    expect(result.aggregated.localIncomeTax).toBe(3_055_644);
  });

  it("EA-T18 — 건물2 §114조의2 가산세 = 0 (5년 초과)", () => {
    expect(b2P?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 조합 EE: 원=환산취득가, 증축=환산취득가 (acquisitionMode 명시)
// ============================================================
//
// 원건물 환산: EA와 동일
//   landAcq = 64,813,852 / b1Acq = 13,805,179
//   landExp = 2,394,000  / b1Exp = 509,915
//
// 건물2 환산취득가 (§176의2②):
//   b2Acq = floor(44,266,498 × 40,604,200 / 54,501,720) = 32,978,880
//   b2EstDed = floor(40,604,200 × 0.03) = 1,218,126
//
// 양도차익:
//   land: 208,528,796 (EA와 동일)
//   b1:   -4,318,240  (EA와 동일)
//   b2:   44,266,498 - 32,978,880 - 1,218,126 = 10,069,492
//
// LTHD:
//   land (19년 30%): 62,558,638
//   b1: 0 (차손)
//   b2 (15년 30%): floor(10,069,492 × 0.30) = 3,020,847
//
// 통산: 양수 income = 145,970,158 + 7,048,645 = 153,018,803
//       음수 = 4,318,240 → 흡수 후 totalIncomeAfterOffset = 148,700,563

describe("조합 EE (원=환산, 증축=환산): 자산 카드 취득가", () => {
  const out = buildGeneralBuildingAssetCards(COMBO_EE);
  const land = out.assetCards.find(c => c.propertyId === "land");
  const b1 = out.assetCards.find(c => c.propertyId === "building1");
  const b2 = out.assetCards.find(c => c.propertyId === "building2");

  it("EE-T01 — 양도가 3-way 합계 = 330,000,000 (공통)", () => {
    const sum = (land?.transferPrice ?? 0) + (b1?.transferPrice ?? 0) + (b2?.transferPrice ?? 0);
    expect(sum).toBe(330_000_000);
  });

  it("EE-T02 — 토지 환산취득가 = 64,813,852 (EA와 동일)", () => {
    expect(land?.acquisitionPrice).toBe(64_813_852);
  });

  it("EE-T03 — 건물1 환산취득가 = 13,805,179 (EA와 동일)", () => {
    expect(b1?.acquisitionPrice).toBe(13_805_179);
  });

  it("EE-T04 — 건물2 환산취득가 = 32,978,880", () => {
    // floor(44,266,498 × 40,604,200 / 54,501,720) = 32,978,880
    expect(b2?.acquisitionPrice).toBe(32_978_880);
  });

  it("EE-T05 — 건물2 개산공제 = 1,218,126", () => {
    // floor(40,604,200 × 0.03) = 1,218,126
    expect(b2?.expenses).toBe(1_218_126);
  });

  it("EE-T06 — 토지·건물1 usedEstimatedAcquisition = true (환산)", () => {
    expect(land?.usedEstimatedAcquisition).toBe(true);
    expect(b1?.usedEstimatedAcquisition).toBe(true);
  });

  it("EE-T07 — 건물2 usedEstimatedAcquisition = true (환산)", () => {
    expect(b2?.usedEstimatedAcquisition).toBe(true);
  });

  it("EE-T08 — 건물2 acquisitionDate = 증축일 2007-07-24", () => {
    expect(b2?.acquisitionDate.toISOString().slice(0, 10)).toBe("2007-07-24");
  });
});

describe("조합 EE: 양도소득금액·세액", () => {
  const result = calculateGeneralBuildingTransfer(COMBO_EE, 2023, 0, [], makeMockRates());
  const props = result.aggregated.properties;
  const lP = props.find(p => p.propertyId === "land");
  const b1P = props.find(p => p.propertyId === "building1");
  const b2P = props.find(p => p.propertyId === "building2");

  it("EE-T09 — 토지 양도차익 = 208,528,796 (EA와 동일)", () => {
    expect(lP?.transferGain).toBe(208_528_796);
  });

  it("EE-T10 — 건물1 양도차익 = -4,318,240 (EA와 동일)", () => {
    expect(b1P?.transferGain).toBe(-4_318_240);
  });

  it("EE-T11 — 건물2 양도차익 = 10,069,492 (환산 취득가 기반)", () => {
    // 44,266,498 - 32,978,880 - 1,218,126 = 10,069,492
    expect(b2P?.transferGain).toBe(10_069_492);
  });

  it("EE-T12 — 토지 LTHD (19년 30%) = 62,558,638", () => {
    expect(lP?.longTermHoldingDeduction).toBe(62_558_638);
  });

  it("EE-T13 — 건물2 LTHD (15년 30%) = 3,020,847", () => {
    // floor(10,069,492 × 0.30) = 3,020,847
    expect(b2P?.longTermHoldingDeduction).toBe(3_020_847);
  });

  it("EE-T14 — totalIncomeAfterOffset = 148,700,563", () => {
    expect(result.aggregated.totalIncomeAfterOffset).toBe(148_700_563);
  });

  it("EE-T15 — 산출세액 = 35,730,197 (mock rates 35% 구간)", () => {
    // 과세표준 = 148,700,563 - 2,500,000 = 146,200,563
    // floor(146,200,563 × 0.35) - 15,440,000 = 51,170,197 - 15,440,000 = 35,730,197
    expect(result.aggregated.calculatedTax).toBe(35_730_197);
  });

  it("EE-T16 — 지방소득세 = 3,573,019", () => {
    // floor(35,730,197 × 0.1) = 3,573,019
    expect(result.aggregated.localIncomeTax).toBe(3_573_019);
  });

  it("EE-T17 — 건물2 §114조의2 가산세 = 0 (5년 초과)", () => {
    expect(b2P?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// 조합 간 일관성 검증 (cross-combo)
// ============================================================

describe("조합 간 일관성: 양도가 안분 공통성 + 모드별 분기 정확성", () => {
  const outAA = buildGeneralBuildingAssetCards(COMBO_AA);
  const outEA = buildGeneralBuildingAssetCards(COMBO_EA);
  const outEE = buildGeneralBuildingAssetCards(COMBO_EE);

  const landAA = outAA.assetCards.find(c => c.propertyId === "land");
  const landEA = outEA.assetCards.find(c => c.propertyId === "land");
  const landEE = outEE.assetCards.find(c => c.propertyId === "land");

  it("CC-01 — 3조합 모두 토지 양도가 동일 = 275,736,648", () => {
    expect(landAA?.transferPrice).toBe(275_736_648);
    expect(landEA?.transferPrice).toBe(275_736_648);
    expect(landEE?.transferPrice).toBe(275_736_648);
  });

  it("CC-02 — AA·사례33 토지 취득가 동일 (원건물 실가 공유)", () => {
    // 사례 33과 AA의 원건물 실가 2-way 안분 결과는 동일해야 함
    expect(landAA?.acquisitionPrice).toBe(164_880_819);
  });

  it("CC-03 — EA·EE 토지 환산취득가 동일 (원건물 환산 공유)", () => {
    expect(landEA?.acquisitionPrice).toBe(64_813_852);
    expect(landEE?.acquisitionPrice).toBe(64_813_852);
  });

  const b2AA = outAA.assetCards.find(c => c.propertyId === "building2");
  const b2EA = outEA.assetCards.find(c => c.propertyId === "building2");
  const b2EE = outEE.assetCards.find(c => c.propertyId === "building2");

  it("CC-04 — AA·EA 건물2 취득가 동일 = 50,000,000 (실가 공유)", () => {
    expect(b2AA?.acquisitionPrice).toBe(50_000_000);
    expect(b2EA?.acquisitionPrice).toBe(50_000_000);
  });

  it("CC-05 — EE 건물2 취득가 = 32,978,880 (환산 — 사례33과 동일)", () => {
    expect(b2EE?.acquisitionPrice).toBe(32_978_880);
  });

  it("CC-06 — AA·EA 건물2 필요경비 동일 = 2,000,000 (실가 공유)", () => {
    expect(b2AA?.expenses).toBe(2_000_000);
    expect(b2EA?.expenses).toBe(2_000_000);
  });

  it("CC-07 — EE 건물2 개산공제 = 1,218,126 (환산 — 사례33과 동일)", () => {
    expect(b2EE?.expenses).toBe(1_218_126);
  });

  it("CC-08 — AA 비사업용토지 판정 사업용 (배율 내)", () => {
    // 수평투영 57 × 3배 = 171 ≥ 토지 57 → 전체 사업용
    expect(outAA.isWithinNblRatio).toBe(true);
    expect(outAA.nonBusinessRatio).toBe(0);
  });

  it("CC-09 — EA 비사업용토지 판정 사업용 (배율 내)", () => {
    expect(outEA.isWithinNblRatio).toBe(true);
    expect(outEA.nonBusinessRatio).toBe(0);
  });

  it("CC-10 — EE 비사업용토지 판정 사업용 (배율 내)", () => {
    expect(outEE.isWithinNblRatio).toBe(true);
    expect(outEE.nonBusinessRatio).toBe(0);
  });
});

// ============================================================
// 사례 33 호환성: acquisitionMode 명시 미입력 = "estimated" fallback
// ============================================================

describe("사례 33 호환성: acquisitionMode 미입력 시 estimated fallback", () => {
  // 사례 33의 extensionInfo에 acquisitionMode 없음 → 엔진이 "estimated"로 처리
  // EE와 동일 결과여야 함 (acquisitionMode: "estimated" 명시와 미입력이 동치)
  const CASE33_LIKE: GeneralBuildingInput = {
    ...COMMON_BASE,
    extensionInfo: {
      extensionDate: EXTENSION_DATE,
      extensionArea: 83.72,
      transferExtensionBuildingStdPrice: EXT_TRANSFER_STD,
      acquisitionExtensionBuildingStdPrice: EXT_ACQ_STD,
      extensionAcquisitionCause: "newConstruction",
      actualBundledAcquisitionPrice: BUNDLED_ACQ,
      actualBundledExpenses: BUNDLED_EXP,
      // acquisitionMode 없음 → "estimated" fallback
    },
  };

  const result33Like = calculateGeneralBuildingTransfer(CASE33_LIKE, 2023, 0, [], makeMockRates());
  const resultEE = calculateGeneralBuildingTransfer(COMBO_EE, 2023, 0, [], makeMockRates());

  it("COMPAT-01 — acquisitionMode 미입력 건물2 취득가 = 32,978,880 (사례 33과 동일)", () => {
    const outLike = buildGeneralBuildingAssetCards(CASE33_LIKE);
    const b2 = outLike.assetCards.find(c => c.propertyId === "building2");
    expect(b2?.acquisitionPrice).toBe(32_978_880);
  });

  it("COMPAT-02 — EE(acquisitionMode 명시)의 건물2 취득가 = 32,978,880 (동치)", () => {
    const outEE = buildGeneralBuildingAssetCards(COMBO_EE);
    const b2 = outEE.assetCards.find(c => c.propertyId === "building2");
    expect(b2?.acquisitionPrice).toBe(32_978_880);
  });

  it("COMPAT-03 — EE 산출세액 = 35,730,197 (원건물 환산 모드에서 건물2 환산과 별개)", () => {
    // EE는 원건물도 환산이라 사례33과 다름 (사례33 원건물=실가)
    expect(resultEE.aggregated.calculatedTax).toBe(35_730_197);
  });
});
