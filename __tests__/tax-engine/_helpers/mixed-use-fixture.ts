/**
 * 검용주택 분리계산 테스트 픽스처 (사례14 기반)
 *
 * 이미지5 사례14 데이터:
 * - 서울 서대문구 대현동, 토지 168.3㎡
 * - 1992.1.1 토지 취득 → 1997.9.12 신축(5층 상가, 4·5층 주택 거주)
 * - 2022.02.16 양도, 양도가액 23억
 * - 주택 연면적: 91.78㎡ (4층 단독 100㎡ + 5층 단독 100㎡의 각 일부)
 *   → 이미지 기준: 3·4·5층 주택 합계 = 단독주택 100+100 = 200㎡가 아니라 각 층이 별도
 *     실제 이미지5: 4층 단독주택 100㎡ + 5층 단독주택 100㎡ = 거주용 200㎡
 *     → 단, 이미지의 "주택부속토지 공제" 계산 시 주택 연면적 91.78㎡를 사용함
 *       (층수표에서 "계단실 옥상" 제외한 가중치 계산으로 추정)
 *   ▶ 픽스처에서는 설명 텍스트 그대로: 주택연면적 91.78㎡ 사용
 * - 상가 연면적: B1 근린 59.2㎡ + B1 주차장 40.8㎡ + 1F 근린 100㎡ + 2F 사무 100㎡
 *   = 300㎡ → 이미지 계산: 상가연면적 = 333.06㎡ (B1+주차장+근린+사무, 옥상 포함 추정)
 *   ▶ 픽스처에서는 333.06㎡ 사용
 * - 건물 정착면적(1층 면적) = 100㎡
 *
 * 기준시가 (이미지 테이블 기준):
 * - 2022.1.1 개별주택가격: 872,000,000원
 * - 2022.1.1 개별공시지가: 6,100,000원/㎡
 * - 1991.1.1 개별공시지가: 2,380,000원/㎡ (토지 취득일 1992.1.1의 직전 고시)
 *
 * 상가건물 기준시가 (취득시·양도시): 이미지에서 미확인 → 테스트에서 임의값 사용
 * (실제 anchor 테스트 시 양도코리아 출력값과 비교하여 채워야 함)
 */

import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

// ──────────────────────────────────────────
// 사례14 기본 픽스처 값
// ──────────────────────────────────────────

export const CASE14_TRANSFER_PRICE = 2_300_000_000;   // 23억
export const CASE14_TRANSFER_DATE = new Date("2022-02-16");
export const CASE14_LAND_ACQ_DATE = new Date("1992-01-01");
export const CASE14_BUILDING_ACQ_DATE = new Date("1997-09-12");

export const CASE14_RESIDENTIAL_FLOOR = 91.78;         // 주택 연면적 ㎡
export const CASE14_COMMERCIAL_FLOOR = 333.06;         // 상가 연면적 ㎡ (이미지 계산 기준)
export const CASE14_BUILDING_FOOTPRINT = 100;          // 1층 면적 ㎡
export const CASE14_TOTAL_LAND = 168.3;                // 전체 토지 ㎡

// 2022.1.1 기준
export const CASE14_HOUSING_PRICE_AT_TRANSFER = 872_000_000;
export const CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER = 6_100_000;
// 상가건물 기준시가 — 실제값 미확인, 임의값 (anchor 테스트 시 교체 필요)
export const CASE14_COMMERCIAL_BUILDING_AT_TRANSFER = 50_000_000;

// 취득시 기준시가
// 1991.1.1 개별공시지가 (토지 취득 1992.1.1 기준)
export const CASE14_LAND_PRICE_PER_SQM_AT_ACQ = 2_380_000;
// 주택공시가격 — 2005년 이전 미공시, PHD 없을 시 0 또는 추정값
export const CASE14_HOUSING_PRICE_AT_ACQ: number | undefined = undefined;
// 상가건물 기준시가 (신축 1997.9.12) — 실제값 미확인
export const CASE14_COMMERCIAL_BUILDING_AT_ACQ = 30_000_000;

// ──────────────────────────────────────────
// 픽스처 팩토리
// ──────────────────────────────────────────

/** 사례14 기본 픽스처 */
export function mixedUseCase14(): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: CASE14_RESIDENTIAL_FLOOR,
    nonResidentialFloorArea: CASE14_COMMERCIAL_FLOOR,
    buildingFootprintArea: CASE14_BUILDING_FOOTPRINT,
    totalLandArea: CASE14_TOTAL_LAND,
    landAcquisitionDate: CASE14_LAND_ACQ_DATE,
    buildingAcquisitionDate: CASE14_BUILDING_ACQ_DATE,
    transferStandardPrice: {
      housingPrice: CASE14_HOUSING_PRICE_AT_TRANSFER,
      commercialBuildingPrice: CASE14_COMMERCIAL_BUILDING_AT_TRANSFER,
      landPricePerSqm: CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER,
    },
    acquisitionStandardPrice: {
      housingPrice: CASE14_HOUSING_PRICE_AT_ACQ,  // undefined → 취득시 개별주택가격 미공시
      commercialBuildingPrice: CASE14_COMMERCIAL_BUILDING_AT_ACQ,
      landPricePerSqm: CASE14_LAND_PRICE_PER_SQM_AT_ACQ,
    },
    residencePeriodYears: 25, // 1997~2022 거주
    isMetropolitanArea: true, // 서울 = 수도권
    zoneType: "residential",  // 주거지역 → 3배
  };
}

/** 부수토지 배율초과 발생 케이스 (토지 면적 확대) */
export function mixedUseExcessLand(
  overrides?: Partial<MixedUseAssetInput>,
): MixedUseAssetInput {
  return {
    ...mixedUseCase14(),
    totalLandArea: 1000, // 토지 면적 확대 → 배율초과 발생
    ...overrides,
  };
}

/** 12억 미만 주택 양도가액 케이스 */
export function mixedUseLowHousingPrice(
  overrides?: Partial<MixedUseAssetInput>,
): MixedUseAssetInput {
  return {
    ...mixedUseCase14(),
    transferStandardPrice: {
      housingPrice: 400_000_000,            // 낮은 주택공시가격 → 주택 양도가액 < 12억
      commercialBuildingPrice: 1_600_000_000,
      landPricePerSqm: CASE14_LAND_PRICE_PER_SQM_AT_TRANSFER,
    },
    ...overrides,
  };
}

/** 거주 2년 미만 케이스 (표1 적용) */
export function mixedUseShortResidence(
  overrides?: Partial<MixedUseAssetInput>,
): MixedUseAssetInput {
  return {
    ...mixedUseCase14(),
    residencePeriodYears: 1, // 거주 1년 → 표1 적용
    ...overrides,
  };
}
