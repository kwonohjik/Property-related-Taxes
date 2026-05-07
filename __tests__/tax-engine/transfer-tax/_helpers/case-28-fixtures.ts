/**
 * 사례 28 공용 픽스처 — Group F·G cross-cutting anchor 파일에서 공유
 *
 * 원본 테스트: new-construction-bundled-case-28.test.ts (Group A~E, 29개 anchor)
 * 공유 대상: new-construction-bundled-case-28-g3.test.ts (Group F)
 *            new-construction-bundled-case-28-g4.test.ts (Group G)
 */

import { baseTransferInput } from "../../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

// ============================================================
// 사례 28 기본 상수
// ============================================================

export const TRANSFER_DATE   = new Date("2023-03-06");
export const BUILDING_ACQ    = new Date("2022-08-29");  // 사용승인일 — 영 §162①4호
export const LAND_ACQ        = new Date("2022-01-08");  // 나대지 취득일

export const LAND_ALLOC_PRICE     = 217_542_381;
export const BUILDING_ALLOC_PRICE = 182_457_619;

export const LAND_ACQ_PRICE     = 150_000_000;
export const BUILDING_ACQ_PRICE = 100_000_000;

export const BUILDING_GAIN = 82_457_619;   // 182,457,619 - 100,000,000

export const BUILDING_FOOTPRINT = 123.12;  // 건물 정착면적 (㎡)
export const LAND_AREA          = 206.6;   // 토지 면적 (㎡)

// ============================================================
// Group E 한도 초과 케이스 상수 (G-4 T-32에서 재사용)
// ============================================================

export const EXCESS_LAND_AREA         = 700;
export const EXCESS_BUILDING_FOOTPRINT = 100;
export const EXCESS_LIMIT_AREA        = 500;
export const EXCESS_AREA              = 200;

const EXCESS_LAND_STD = 540_000 * EXCESS_LAND_AREA; // 378,000,000
export const EXCESS_LAND_ALLOC   = Math.floor(400_000_000 * EXCESS_LAND_STD / (EXCESS_LAND_STD + 93_571_201)); // 320,630,266
export const EXCESS_BUILDING_ALLOC = 400_000_000 - EXCESS_LAND_ALLOC; // 79,369,734

const EXCESS_RATIO = EXCESS_AREA / EXCESS_LAND_AREA; // 200/700
export const EXCESS_LAND_TRANSFER_EXCESS = Math.floor(EXCESS_LAND_ALLOC * EXCESS_RATIO); // 91,608,647
export const EXCESS_LAND_TRANSFER_APPURT = EXCESS_LAND_ALLOC - EXCESS_LAND_TRANSFER_EXCESS; // 229,021,619
export const EXCESS_LAND_ACQ_EXCESS = Math.floor(150_000_000 * EXCESS_RATIO); // 42,857,142
export const EXCESS_LAND_ACQ_APPURT = 150_000_000 - EXCESS_LAND_ACQ_EXCESS;   // 107,142,858

// ============================================================
// 헬퍼 팩토리
// ============================================================

/** 건물(primary) 단건 엔진 입력 */
export function makeBuildingInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: BUILDING_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: BUILDING_ACQ_PRICE,
    acquisitionDate: BUILDING_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    buildingFootprintArea: BUILDING_FOOTPRINT,
    isUrbanArea: true,
    ...overrides,
  });
}

/** 토지(companion) 단건 엔진 입력 */
export function makeLandInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: LAND_ALLOC_PRICE,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: LAND_ACQ_PRICE,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: LAND_AREA,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 6,
      buildingFootprintArea: BUILDING_FOOTPRINT,
      isUrbanArea: true,
      bundledSaleMode: "apportioned",
    },
    ...overrides,
  });
}

/** 부수토지(한도 내) 엔진 입력 — G-2/G-4 T-32 공용 */
export function makeAppurtenantInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: EXCESS_LAND_TRANSFER_APPURT,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: EXCESS_LAND_ACQ_APPURT,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: EXCESS_LIMIT_AREA,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths: 6,
      buildingFootprintArea: EXCESS_BUILDING_FOOTPRINT,
      isUrbanArea: true,
    },
    ...overrides,
  });
}

/** 한도 초과 토지 엔진 입력 */
export function makeExcessInput(overrides?: Partial<TransferTaxInput>): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    transferPrice: EXCESS_LAND_TRANSFER_EXCESS,
    transferDate: TRANSFER_DATE,
    acquisitionPrice: EXCESS_LAND_ACQ_EXCESS,
    acquisitionDate: LAND_ACQ,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    annualBasicDeductionUsed: 0,
    acquisitionArea: EXCESS_AREA,
    primaryContextForCompanionRate: undefined,
    ...overrides,
  });
}
