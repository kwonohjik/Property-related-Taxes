/**
 * burdened-gift-114-2-penalty-phase2.test.ts — §114조의2 Phase 2 Pre-Do anchor
 *
 * 목적(pre-do-anchor-verification 정책): Do 진입 전 핵심 anchor 2건을 우선 작성·실행하여
 *   현행 코드의 실패/오발동을 실증하고 설계 가정을 검증한다.
 *   현재 기능 미구현 상태이므로 anchor는 fix 후 기대값으로 작성 → 현행에선 실패해야 정상.
 *
 * 설계: docs/02-design/features/burdened-gift-114-2-penalty-phase2.engine.design.md
 *   - P2-1 (증축 K-5 부담부증여) §534-558
 *   - P2-7 (general_building 사례33 증축, extensionFloorArea85=80, 미발동) §604-616
 *
 * ★ 신규 필드 표기:
 *   - extensionStdPriceAtAcquisition: 현행 TransferTaxInput·BurdenedGiftInfo 양쪽에 부재 (Phase 2 신규).
 *     → anchor에서 `as` 캐스팅으로 주입.
 *   - extensionFloorArea85: 현행 GeneralBuildingInput["extensionInfo"]에 부재 (Phase 2 신규).
 *     → anchor에서 `as` 캐스팅으로 주입.
 *
 * 현행 필드 실측(매핑 결과):
 *   - 설계 "assumedDebt"  → 현행 BurdenedGiftInfo.mortgageDebtAmount (채무 B)
 *   - 설계 "giftValuation" → 직접 필드 없음. C = Max(supplementary, mortgage, rental)로 산정됨.
 *     market 모드에서 supplementary = marketValueAtTransfer.
 *   - marketValueAtTransfer·landStdPriceAtTransfer·buildingStdPriceAtTransfer·
 *     landStdPriceAtAcquisition·buildingStdPriceAtAcquisition: BurdenedGiftInfo 실제 필드명 일치.
 *   - standardPrice: TransferTaxInput에는 직접 매핑 없음(housing/building 단일자산 K-5는 burdenedGiftInfo
 *     std-price 필드로 분모 산정). 설계 standardPrice=120M은 buildingStdPriceAtTransfer와 동일 의미.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { GeneralBuildingInput } from "@/lib/tax-engine/general-building-valuation";

const rates = makeMockRates();

// ============================================================
// P2-1 — 증축 K-5 부담부증여 (설계 §534-558)
// ============================================================

const P2_1_TRANSFER_DATE = new Date("2025-06-01");
const P2_1_CONSTRUCTION_DATE = new Date("2022-01-01"); // 증축일 = 5년 기산점 (3년 이내)

/** P2-1 K-5(converted) 증축 부담부증여 정보 */
function p2_1_info(overrides: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_market", // K-5(converted) 진입 필수
    acquisitionMethod: "converted",
    marketValueAtTransfer: 200_000_000, // 양도가 안분 분모 C
    lendingDepositTotal: 0,
    mortgageDebtAmount: 150_000_000, // 채무 B (설계 assumedDebt=150M)
    annualRentTotal: 0,
    mortgageSetAmount: 150_000_000,
    landStdPriceAtTransfer: 80_000_000,
    buildingStdPriceAtTransfer: 120_000_000, // TotalBuildingTransferStd (설계 standardPrice=120M)
    landStdPriceAtAcquisition: 60_000_000,
    buildingStdPriceAtAcquisition: 90_000_000, // 건물 전체 (K-5 전체 환산 기준)
    ...overrides,
  };
}

function p2_1_input(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "building",
    transferDate: P2_1_TRANSFER_DATE,
    acquisitionDate: P2_1_CONSTRUCTION_DATE,
    transferPrice: 0,
    acquisitionPrice: 0,
    expenses: 0,
    useEstimatedAcquisition: false,
    transferType: "burdened_gift",
    isOneHousehold: false,
    householdHousingCount: 2,
    isSelfBuilt: true,
    buildingType: "extension",
    extensionFloorArea: 100, // > 85
    constructionDate: P2_1_CONSTRUCTION_DATE,
    // ★ 신규 필드 (현행 타입 부재) — fix 후 증축부분 한정 base 산출용
    extensionStdPriceAtAcquisition: 36_000_000,
    burdenedGiftInfo: p2_1_info(),
    ...overrides,
  } as Partial<TransferTaxInput>);
}

describe("§114조의2 Phase2 P2-1 — 증축 K-5 부담부증여 (증축부분 한정 base)", () => {
  it("[P2-1] fix 후: penaltyBase = 증축부분 환산취득가 27,000,000 / penaltyTax = 1,350,000", () => {
    // 설계 §554:
    //   채무안분 건물양도가 = floor(150M × 120M/200M) = 90,000,000
    //   extensionEstimatedBase = floor(90M × 36M/120M) = 27,000,000
    //   penaltyTax = floor(27,000,000 × 0.05) = 1,350,000
    const result = calculateTransferTax(p2_1_input(), rates);
    expect(result.penaltyBase).toBe(27_000_000);
    expect(result.penaltyTax).toBe(1_350_000);
  });

  it("[P2-1 진단] 현행 건물전체 환산취득가 base = 67,500,000 (참조)", () => {
    // 현행 K-5 전체 환산: building.acquisitionPrice
    //   buildingTransferPrice = 90,000,000
    //   buildingAcquisitionPrice = floor(90M × 90M/120M) = 67,500,000
    // → 현행 penalty = floor(67,500,000 × 0.05) = 3,375,000 (과대)
    const result = calculateTransferTax(p2_1_input(), rates);
    expect(
      result.transferBurdenedGiftBreakdown!.perAsset.building.acquisitionPrice,
    ).toBe(67_500_000);
  });
});

// ============================================================
// P2-2~P2-5·P2-8 — 증축 K-5 게이트·회귀 (설계 §565-623)
// ============================================================

describe("§114조의2 Phase2 P2-2~P2-5·P2-8 — 증축 K-5 게이트·신축 회귀", () => {
  it("[P2-2] extensionFloorArea=85 경계값 → penaltyTax 0 (85 ≤ 85)", () => {
    const result = calculateTransferTax(
      p2_1_input({ extensionFloorArea: 85 }),
      rates,
    );
    expect(result.penaltyTax).toBe(0);
  });

  it("[P2-3] 증축 5년 초과(2019→2025, 6.4년) → penaltyTax 0", () => {
    const c = new Date("2019-01-01");
    const result = calculateTransferTax(
      p2_1_input({ constructionDate: c, acquisitionDate: c }),
      rates,
    );
    expect(result.penaltyTax).toBe(0);
  });

  it("[P2-4] 증축 transferDate < 2020-01-01 (시행일 게이트) → penaltyTax 0", () => {
    const c = new Date("2017-01-01");
    const result = calculateTransferTax(
      p2_1_input({
        constructionDate: c,
        acquisitionDate: c,
        transferDate: new Date("2019-12-31"),
      }),
      rates,
    );
    expect(result.penaltyTax).toBe(0);
  });

  it("[P2-5] 신축 회귀 (Phase 1 불변): 건물전체 환산취득가 67,500,000 × 5% = 3,375,000", () => {
    const result = calculateTransferTax(
      p2_1_input({
        buildingType: "new",
        extensionFloorArea: undefined,
        extensionStdPriceAtAcquisition: undefined,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(result.penaltyBase).toBe(67_500_000);
    expect(result.penaltyTax).toBe(3_375_000);
  });

  it("[P2-8] K-4 실지(actual) → penaltyTax 0 (§97①1호가목, §114조의2 비적용)", () => {
    const result = calculateTransferTax(
      p2_1_input({
        burdenedGiftInfo: p2_1_info({ acquisitionMethod: "actual" }),
      }),
      rates,
    );
    expect(result.penaltyTax).toBe(0);
  });
});

// ============================================================
// P2-7 — general_building 사례33 증축, extensionFloorArea85=80, 미발동 (설계 §604-616)
// ============================================================

// 사례 33 입력 패턴 차용 + 증축일/양도일을 5년 이내로 조정 (게이트 발동 조건 확보)
const P2_7_TRANSFER_DATE = new Date("2025-06-01");
const P2_7_ACQUISITION_DATE = new Date("2003-03-17"); // 토지+건물1 원취득
const P2_7_EXTENSION_DATE = new Date("2022-01-01");    // 건물2 증축일 (5년 이내)

const P2_7_INPUT: GeneralBuildingInput = {
  totalTransferPrice: 330_000_000,
  transferDate: P2_7_TRANSFER_DATE,
  acquisitionDate: P2_7_ACQUISITION_DATE,
  buildingAcquisitionDate: P2_7_ACQUISITION_DATE,
  buildingAcquisitionCause: "purchase",
  landArea: 57,
  buildingArea: 83.73,
  buildingFootprintArea: 57,
  transferLandPricePerSqm: 5_956_000,
  transferBuildingStdPrice: 12_308_310,
  acquisitionLandPricePerSqm: 1_400_000,
  acquisitionBuildingStdPrice: 16_997_190,
  zoneType: "general_residential",
  isMetropolitan: true,
  extensionInfo: {
    extensionDate: P2_7_EXTENSION_DATE,
    extensionArea: 80,
    transferExtensionBuildingStdPrice: 54_501_720,
    acquisitionExtensionBuildingStdPrice: 40_604_200,
    extensionAcquisitionCause: "newConstruction", // 자가증축 → §114조의2 발동 가능
    actualBundledAcquisitionPrice: 200_000_000,
    actualBundledExpenses: 8_000_000,
    // ★ 신규 필드 (현행 타입 부재) — 85㎡ 게이트 전용, 80 ≤ 85 → 미발동 기대
    extensionFloorArea85: 80,
  } as GeneralBuildingInput["extensionInfo"],
};

describe("§114조의2 Phase2 P2-7 — general_building 증축 85㎡ 게이트 (extensionFloorArea85=80, 미발동)", () => {
  it("[P2-7] fix 후: 건물2 penaltyTax === 0 (80 ≤ 85 게이트 차단)", () => {
    // 현행: buildingType 미설정 → 신축 취급 → 85㎡ 게이트 미적용 → penalty 오발동(>0)
    // fix 후: buildingType="extension" + extensionFloorArea=80 ≤ 85 → return null → 0
    const result = calculateGeneralBuildingTransfer(
      P2_7_INPUT,
      2025,
      0,
      [],
      makeMockRates(),
    );
    const b2P = result.aggregated.properties.find(
      (p) => p.propertyId === "building2",
    );
    expect(b2P?.penaltyTax ?? 0).toBe(0);
  });
});

// ============================================================
// P2-6 — general_building 사례33 증축, extensionFloorArea85=120, 발동 (설계 §593-602)
// ============================================================

describe("§114조의2 Phase2 P2-6 — general_building 증축 85㎡ 게이트 (extensionFloorArea85=120, 발동)", () => {
  it("[P2-6] 건물2 penaltyTax = 1,648,944 (120 > 85, 건물2 환산취득가 × 5%)", () => {
    // 건물2 환산취득가(building2Acq) = 32,978,880 — 면적은 게이트 판정에만, base는 기준시가 환산.
    //   penaltyTax = floor(32,978,880 × 0.05) = 1,648,944
    // 건물2는 카드 자체가 증축부분만 범위 → base 분리 불요(증축부분 한정 이미 충족).
    const input: GeneralBuildingInput = {
      ...P2_7_INPUT,
      extensionInfo: {
        ...P2_7_INPUT.extensionInfo!,
        extensionFloorArea85: 120,
      } as GeneralBuildingInput["extensionInfo"],
    };
    const result = calculateGeneralBuildingTransfer(
      input,
      2025,
      0,
      [],
      makeMockRates(),
    );
    const b2P = result.aggregated.properties.find(
      (p) => p.propertyId === "building2",
    );
    expect(b2P?.penaltyTax ?? 0).toBe(1_648_944);
  });
});

// ============================================================
// C-A1b — 양도세 단독(비-부담부) 증축 K-5 (설계 §70·§718, #5 함께수정)
// ============================================================

describe("§114조의2 Phase2 C-A1b — 양도세 단독(비-부담부) 증축 K-5 penalty 증축부분 한정", () => {
  function cA1bInput(overrides: Partial<TransferTaxInput> = {}): TransferTaxInput {
    return baseTransferInput({
      propertyType: "building",
      transferPrice: 200_000_000,
      transferDate: new Date("2025-06-01"),
      acquisitionDate: new Date("2022-01-01"),
      useEstimatedAcquisition: true,
      acquisitionMethod: "estimated",
      standardPriceAtAcquisition: 100_000_000, // 건물 전체 취득기준시가
      standardPriceAtTransfer: 160_000_000, // 양도시 건물 기준시가
      isSelfBuilt: true,
      buildingType: "extension",
      extensionFloorArea: 100, // > 85
      constructionDate: new Date("2022-01-01"),
      extensionStdPriceAtAcquisition: 40_000_000, // 증축부분 취득기준시가
      ...overrides,
    } as Partial<TransferTaxInput>);
  }

  it("[C-A1b] penaltyBase = 증축부분 환산취득가 50,000,000 / penaltyTax = 2,500,000", () => {
    // 전체 환산취득가 = floor(200M×100M/160M) = 125M (양도차익용 취득가)
    // 증축부분 환산취득가 = floor(200M×40M/160M) = 50M → penalty = floor(50M×5%) = 2,500,000
    const result = calculateTransferTax(cA1bInput(), rates);
    expect(result.penaltyBase).toBe(50_000_000);
    expect(result.penaltyTax).toBe(2_500_000);
  });

  it("[C-A1b 진단] 증축 penalty < 건물전체 base penalty(6,250,000) — 과대부과 방지 확인", () => {
    const result = calculateTransferTax(cA1bInput(), rates);
    expect(result.penaltyTax).toBeLessThan(6_250_000);
  });

  it("[C-A1b 신축 회귀] buildingType='new' → 건물전체 base 125M × 5% = 6,250,000", () => {
    const result = calculateTransferTax(
      cA1bInput({
        buildingType: "new",
        extensionFloorArea: undefined,
        extensionStdPriceAtAcquisition: undefined,
      } as Partial<TransferTaxInput>),
      rates,
    );
    expect(result.penaltyBase).toBe(125_000_000);
    expect(result.penaltyTax).toBe(6_250_000);
  });

  it("[C-A1c] 손실(transferGain≤0) 증축 → 손실 경로도 증축부분 base (penaltyTax 1,250,000, §114조의2②)", () => {
    // 손실 유도: 양도가 100M < 전체 환산취득가 125M → 양도차익 음수 → 조기반환 경로
    //   전체 환산취득가 = floor(100M×200M/160M) = 125M
    //   증축부분 환산취득가 = floor(100M×40M/160M) = 25M → penalty = floor(25M×5%) = 1,250,000
    // §114조의2② 산출세액 0(손실)에도 가산세 부과 — 손실 조기반환도 증축부분 base 적용 확인.
    const result = calculateTransferTax(
      cA1bInput({
        transferPrice: 100_000_000,
        standardPriceAtAcquisition: 200_000_000, // 취득기준시가 > 양도 → 손실
        standardPriceAtTransfer: 160_000_000,
        extensionStdPriceAtAcquisition: 40_000_000,
      }),
      rates,
    );
    expect(result.penaltyBase).toBe(25_000_000);
    expect(result.penaltyTax).toBe(1_250_000);
  });
});
