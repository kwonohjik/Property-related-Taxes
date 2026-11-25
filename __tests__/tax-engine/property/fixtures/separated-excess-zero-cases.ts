/**
 * PSE-E0 — 분리과세 «면적 한도 초과 0» 입력 모음. 골든(`separated-excess-zero-golden.json`)은 PSE 구현 전 master(f6a059725)의
 * `calculatePropertyTax` 결과를 그대로 저장한 값이다 — 초과 0 경로가 바이트 단위로 불변인지 PSE-E2 이후에도 고정한다.
 * (골든 재생성 금지 — 값이 달라지면 회귀다. 입력 목록을 늘릴 때만 새 항목의 값을 같은 방법으로 추가한다.)
 */
import type { PropertyTaxInput } from "../../../../lib/tax-engine/types/property.types";

const BASE = { objectType: "land", landTaxType: "separated", targetDate: "2026-06-01" } as const;

/** 산업단지 공장 — 연면적 1,200㎡ ÷ 면적률 12% = 10,000㎡ + 가산 → 기준 12,000㎡ */
export const FACTORY = {
  isFactoryLand: true,
  factoryLocation: "industrial_zone",
  factoryTotalLandArea: 8000,
  factoryFloorArea: 1200,
  factoryAreaRatePercent: 12,
} as const;

/** 한우(육우) 사육 50마리 · 축사+부대시설 (7.5+5)×50 = 625㎡ */
export const PASTURE = {
  isLivestockFarm: true,
  pastureTotalLandArea: 600,
  pastureLivestockType: "hanwoo_breeding",
  pastureLivestockCount: 50,
  pastureHasFacility: true,
  pastureHasGrassland: false,
  pastureHasFodder: false,
  pastureIsUrbanArea: false,
} as const;

export const ZERO_EXCESS_CASES: Record<string, PropertyTaxInput> = {
  "F-0 공장 8,000㎡(이내)": { ...BASE, publishedPrice: 800_000_000, separateTaxationItem: FACTORY } as PropertyTaxInput,
  "F-0 + stale otherComprehensiveValue": {
    ...BASE, publishedPrice: 800_000_000, separateTaxationItem: FACTORY, otherComprehensiveValue: 777_000_000,
  } as PropertyTaxInput,
  "F-0 + 도시지역": { ...BASE, publishedPrice: 800_000_000, separateTaxationItem: FACTORY, isUrbanArea: true } as PropertyTaxInput,
  "F-0 + 직전 세액 direct 상한": {
    ...BASE, publishedPrice: 800_000_000, separateTaxationItem: FACTORY, previousYearTax: 500_000,
  } as PropertyTaxInput,
  "F-0 정확히 기준면적(12,000㎡)": {
    ...BASE, publishedPrice: 1_200_000_000, separateTaxationItem: { ...FACTORY, factoryTotalLandArea: 12000 },
  } as PropertyTaxInput,
  "P-0 목장 600㎡(이내)": { ...BASE, publishedPrice: 30_000_000, separateTaxationItem: PASTURE } as PropertyTaxInput,
  "농지": { ...BASE, publishedPrice: 100_000_000, separateTaxationItem: { isFarmland: true } } as PropertyTaxInput,
  "보전산지": { ...BASE, publishedPrice: 100_000_000, separateTaxationItem: { isProtectedForest: true } } as PropertyTaxInput,
  "염전": { ...BASE, publishedPrice: 100_000_000, separateTaxationItem: { isSaltField: true } } as PropertyTaxInput,
  "터미널": { ...BASE, publishedPrice: 100_000_000, separateTaxationItem: { isTerminalOrParking: true } } as PropertyTaxInput,
  "회원제 골프장": {
    ...BASE, publishedPrice: 100_000_000, separateTaxationItem: { isGolfCourse: true, golfCourseType: "member" },
  } as PropertyTaxInput,
  "고급오락장 + 도시지역": {
    ...BASE, publishedPrice: 100_000_000, isUrbanArea: true, separateTaxationItem: { isHighClassEntertainment: true },
  } as PropertyTaxInput,
};
