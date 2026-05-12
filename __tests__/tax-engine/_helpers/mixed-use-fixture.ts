/**
 * 겸용주택 분리계산 테스트 픽스처 (사례14 기반)
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
 * (실제 anchor 테스트 시 예제 출력값과 비교하여 채워야 함)
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

// ──────────────────────────────────────────────────────────────
// PDF 갑氏 케이스 — 보유 중 일부 용도변경 (image-1, 2026-04-30 수령)
//
// 1985.1.1 의제취득한 단독주택을 2011.8.5에 일부면적(80.23㎡)을 근린생활시설로 용도변경
// → 2023.2.16에 1,300,000,000원 양도. 갑氏는 2주택자(B주택 보유)이므로 1세대1주택 비과세 미적용.
// ──────────────────────────────────────────────────────────────

export const GAP_TRANSFER_PRICE = 1_300_000_000;
export const GAP_TRANSFER_DATE = new Date("2023-02-16");
export const GAP_DEEMED_ACQ_DATE = new Date("1985-01-01");  // 의제취득일

// 양도시 면적 (개별주택가격확인서 2022.1.1)
export const GAP_RESIDENTIAL_FLOOR = 37.79;          // 양도시 주택 (1층 단독주택)
export const GAP_NON_RESIDENTIAL_FLOOR = 80.23;      // 양도시 상가 (2층 근린생활시설)
export const GAP_BUILDING_FOOTPRINT = 37.79;         // 1층 바닥면적 (정착면적)
export const GAP_TOTAL_LAND = 198.3;                 // 전체 토지

// 양도시 기준시가 (2022.1.1)
export const GAP_HOUSING_PRICE_AT_TRANSFER = 380_000_000;     // 개별주택가격
export const GAP_LAND_PRICE_PER_SQM_AT_TRANSFER = 3_300_000;  // 개별공시지가/㎡
export const GAP_COMMERCIAL_BUILDING_AT_TRANSFER = 100_000_000; // 추정 (PDF 미명시 — 사용자 조회)

// 취득시 (1985 의제취득) — house_to_commercial 시 사용자가 직접 입력해야 하는 값:
// 취득 당시 동일 건물의 국세청 고시 기준시가에서 양도시 상가연면적 비율로 안분한 값.
// PHD 사용 → 1990년 공시지가로 의제취득 시점 토지가격 환산
export const GAP_LAND_PRICE_PER_SQM_AT_ACQ = 840_000;  // 1990년 공시지가 (의제취득)
// 1985 의제취득 시점 추정 상가건물 기준시가 (PDF 미명시 — 사용자 직접 조회·입력 가정)
export const GAP_COMMERCIAL_BUILDING_AT_ACQ = 10_000_000;

// 거주기간 (PDF 미명시 — 갑氏는 A겸용주택 임대등록 안함, 직접 거주 추정 안 함)
export const GAP_RESIDENCE_PERIOD_YEARS = 0;

// 용도변경일 — 2011.8.5 (PDF 본문)
export const GAP_USAGE_CHANGE_DATE = new Date("2011-08-05");

// PHD 3-시점 데이터
export const GAP_PHD_FIRST_DISCLOSURE_DATE = new Date("2005-01-01");
export const GAP_PHD_FIRST_DISCLOSURE_HOUSING_PRICE = 150_000_000;
export const GAP_LAND_PRICE_PER_SQM_AT_2005 = 1_700_000;  // 2004년 가까운 시점 (대안: 1,200,000)
// 양도시 PHD 토지단가는 GAP_LAND_PRICE_PER_SQM_AT_TRANSFER와 동일

// PHD 3-시점 건물 기준시가 (Case A — firstDisclosureDate < usageChangeDate)
//   PDF 미명시 — 사용자가 NTS 조회 후 입력하는 값을 합리적 추정값으로 가정.
//   1985 의제취득·2005 최초공시 모두 전체 주택이었으므로 "전체 건물 기준시가" 의미.
//   양도시(2023)는 주택분만이므로 "주택분 건물기준시가" 의미.
export const GAP_BUILDING_STD_AT_ACQ_WHOLE = 5_000_000;        // 1985 전체 건물 (추정)
export const GAP_BUILDING_STD_AT_FIRST_WHOLE = 30_000_000;     // 2005 전체 건물 (추정)
export const GAP_BUILDING_STD_AT_TRANSFER_HOUSING = 50_000_000;// 2023 주택분만 (추정)

/**
 * PDF 갑氏 케이스 픽스처 — 보유 중 일부 용도변경(주택→상가) + 1985 의제취득 + 다주택자.
 *
 * direction = "house_to_commercial" 시에도 취득시 상가건물 기준시가 + 개별공시지가는
 * 사용자가 직접 입력해야 함 (자동 안분 fallback 폐지, 2026-05-01).
 *
 * isOneHouseExempt = false (갑氏는 A+B 2주택자, 1세대1주택 비과세 미적용).
 */
export function mixedUsePdfGap(
  overrides?: Partial<MixedUseAssetInput>,
): MixedUseAssetInput {
  return {
    isMixedUseHouse: true,
    residentialFloorArea: GAP_RESIDENTIAL_FLOOR,
    nonResidentialFloorArea: GAP_NON_RESIDENTIAL_FLOOR,
    buildingFootprintArea: GAP_BUILDING_FOOTPRINT,
    totalLandArea: GAP_TOTAL_LAND,
    landAcquisitionDate: GAP_DEEMED_ACQ_DATE,
    buildingAcquisitionDate: GAP_DEEMED_ACQ_DATE,
    transferStandardPrice: {
      housingPrice: GAP_HOUSING_PRICE_AT_TRANSFER,
      commercialBuildingPrice: GAP_COMMERCIAL_BUILDING_AT_TRANSFER,
      landPricePerSqm: GAP_LAND_PRICE_PER_SQM_AT_TRANSFER,
    },
    acquisitionStandardPrice: {
      // PHD 사용 시 housingPrice는 PHD가 역산. 미사용 시 사용자 직접 입력.
      housingPrice: undefined,
      // 사용자 직접 입력 필수 (자동 안분 fallback 폐지)
      commercialBuildingPrice: GAP_COMMERCIAL_BUILDING_AT_ACQ,
      landPricePerSqm: GAP_LAND_PRICE_PER_SQM_AT_ACQ,
    },
    usePreHousingDisclosure: true,  // 1985 의제취득 → PHD 필수
    preHousingDisclosure: {
      firstDisclosureDate: GAP_PHD_FIRST_DISCLOSURE_DATE,
      firstDisclosureHousingPrice: GAP_PHD_FIRST_DISCLOSURE_HOUSING_PRICE,
      transferHousingPrice: GAP_HOUSING_PRICE_AT_TRANSFER,
      landPricePerSqmAtAcquisition: GAP_LAND_PRICE_PER_SQM_AT_ACQ,
      landPricePerSqmAtFirstDisclosure: GAP_LAND_PRICE_PER_SQM_AT_2005,
      landPricePerSqmAtTransfer: GAP_LAND_PRICE_PER_SQM_AT_TRANSFER,
      // Case A — 1985, 2005 모두 전체 주택이었으므로 "전체 건물 기준시가" 입력.
      // 엔진이 totalLandArea 와 곱해 Sum_A·Sum_F 산정.
      buildingStdPriceAtAcquisition: GAP_BUILDING_STD_AT_ACQ_WHOLE,
      buildingStdPriceAtFirstDisclosure: GAP_BUILDING_STD_AT_FIRST_WHOLE,
      // 양도시(2023)는 주택분만 — "주택분 건물기준시가" 입력
      buildingStdPriceAtTransfer: GAP_BUILDING_STD_AT_TRANSFER_HOUSING,
      // landArea는 겸용주택 엔진이 주택부수토지로 자동 주입 (Omit<PreHousingDisclosureInput, "landArea">)
    },
    residencePeriodYears: GAP_RESIDENCE_PERIOD_YEARS,
    isMetropolitanArea: false,  // 가평군 = 비수도권
    zoneType: "residential",
    isOneHouseExempt: false,    // 🚨 Critical — 갑氏는 2주택자
    partialUsageChange: {
      direction: "house_to_commercial",
      usageChangeDate: GAP_USAGE_CHANGE_DATE,  // 2011.8.5 → Case A 진입
      // acqResidentialArea/acqCommercialArea 미주입 → 양도시 합계로 자동 도출
    },
    ...overrides,
  };
}

/**
 * 미러 케이스 — commercial_to_house (취득시 전체 상가 → 양도시 일부 주택화).
 * PDF 직접 사례 없음. 결과 카드에 "보수 검토 필요" 배지 노출 검증용.
 */
export function mixedUseCommercialToHouseMirror(
  overrides?: Partial<MixedUseAssetInput>,
): MixedUseAssetInput {
  return {
    ...mixedUsePdfGap(),
    acquisitionStandardPrice: {
      housingPrice: undefined,
      commercialBuildingPrice: 50_000_000,           // 취득시 상가건물 기준시가 직접 입력
      landPricePerSqm: GAP_LAND_PRICE_PER_SQM_AT_ACQ,
    },
    usePreHousingDisclosure: false,  // 미러 케이스에서는 PHD 의미 없음
    preHousingDisclosure: undefined,
    partialUsageChange: {
      direction: "commercial_to_house",
    },
    ...overrides,
  };
}

/**
 * PDF 갑氏 anchor — 엔진 첫 실행 결과로 고정 (golden test 패턴).
 * 회귀 방어용. 입력값 변경 없이 결과가 달라지면 엔진 버그.
 *
 * 입력 조건:
 * - 양도일 2023.02.16, 양도가액 1,300,000,000원
 * - 1985.1.1 의제취득(PHD 활성화), 다주택자(isOneHouseExempt=false)
 * - direction: house_to_commercial (취득시 전체 주택, 양도시 일부 상가화)
 * - 양도시 주택 37.79㎡ + 상가 80.23㎡ / 전체 토지 198.3㎡
 * - 양도시 개별주택가격 380,000,000 / 공시지가 3,300,000원/㎡ (2022)
 * - 최초공시 2005.1.1 개별주택가격 150,000,000 / 1990 공시지가 840,000원/㎡
 * - 거주기간 0년 (다주택자 → 표1)
 * - 양도시 상가건물 기준시가 100,000,000 (PDF 미명시 — 추정값)
 * - 취득시 상가건물 기준시가 10,000,000 (1985 의제취득 시점 추정 — 사용자 직접 입력)
 *
 * ⚠ 양도/취득시 상가건물 기준시가가 추정값이므로 본 anchor는 "엔진 회귀 방어"용.
 *    실제 PDF 정답값은 사용자가 양도/취득시 상가건물 기준시가 확정 후 재계산 필요.
 *    2026-05-01: 자동 안분 fallback 폐지 → 취득시 상가건물 기준시가가 입력값으로 직접 반영되어 anchor 재산출됨.
 */
export const PARTIAL_USAGE_CHANGE_ANCHORS = {
  pdf_gap_house_to_commercial: {
    transferPrice: GAP_TRANSFER_PRICE,
    transferDate: GAP_TRANSFER_DATE,
    // 양도가액 안분 (양도시 비율)
    housingTransferPrice: 534_146_446,
    commercialTransferPrice: 765_853_554,
    housingRatio: 0.41088188227152805,
    // 환산취득가 — 주택분(Case A: 전체 건물 기준 환산), 상가분(사용자 직접 입력)
    housingEstimatedAcq: 98_541_280,
    commercialEstimatedAcq: 173_220_881,
    // 양도차익
    housingTransferGain: 433_502_054,
    commercialTransferGain: 182_236_563,
    // 양도소득금액 — 용도변경 시점 기반 LTHD 시간 비례 분할 (period split) 활성화
    housingIncomeAmount: 574_986_364,
    commercialIncomeAmount: 140_196_173,
    // 합산 세액
    aggregateIncome: 736_822_125,
    taxBase: 734_322_125,
    transferTax: 274_639_250,
    localTax: 27_463_925,
    totalPayable: 302_103_175,
  },
} as const;
