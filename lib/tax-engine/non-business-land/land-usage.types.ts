/**
 * 비사업용 토지 판정 — **지목별 사용 현황** 입력 타입
 *
 * `types.ts`가 800줄 정책(CLAUDE.md File Size Policy)을 넘겨 분리했다(2026-08-05).
 * 기존 import 경로를 깨지 않도록 `types.ts`가 이 파일을 그대로 재수출한다 —
 * 소비처는 계속 `from "./types"` 를 쓴다.
 */

import type { BusinessUsePeriod, ZoneType } from "./types";
import type { SPORTS_OUTDOOR_STD, SPORTS_INDOOR_STD, RESERVE_FORCES_STD } from "./data/area-standards";

export interface PastureUsage {
  isLivestockOperator: boolean;
  livestockType?: string;
  livestockCount?: number;
  standardArea?: number;
  /** 축산업 영위 기간 (여러 구간 가능) — v2 신규 */
  livestockPeriods?: BusinessUsePeriod[];
  /** §168-10 ②1호 상속 3년 이내 목장용지 (상속개시일) — v2 신규 */
  inheritanceDate?: Date;
  /**
   * §168-10 ②3호 사회복지법인·학교·종교·정당이 사업에 직접 사용 — v2 신규.
   * (OwnerType 미도입 버전에서 boolean 플래그로 처리)
   */
  isSpecialOrgUse?: boolean;
}

export interface VillaUsage {
  villaUsePeriods: BusinessUsePeriod[];
  isEupMyeon: boolean;
  /** 농어촌주택 경로 진입 여부. true여도 아래 3요건(§168의13①1~3호) 모두 충족해야 사업용 의제 */
  isRuralHousing: boolean;
  /** §168의13①1호 건물 연면적(㎡) — 150 이내 요건 */
  buildingFloorArea?: number;
  /** §168의13①1호 건물 부속토지면적(㎡) — 660 이내 요건. 자산 전체 landArea와 별개(부속토지 전용) */
  attachedLandArea?: number;
  /** §168의13①2호 건물+부속토지 합산 기준시가(원) — 2억 이하 요건 */
  combinedStdValue?: number;
  /** §168의13①3호 조특법 §99의4①1호가목1)~4) 제외지역(수도권·도시지역·조정대상지역·허가구역) 소재 여부. true=제외지역=요건 미충족 */
  isInRestrictedArea?: boolean;
  /** @deprecated 산식 미반영(엔진 미소비) — 하위호환 잔존. 제거는 별도 정리 작업 */
  isAfter20150101?: boolean;
}

export type PropertyTaxType =
  | "exempt"          // 비과세·면제 (v2 추가)
  | "separate"
  | "special_sum"
  | "comprehensive";

/**
 * §168의11① 호별 분기 — 면적기준 정밀판정.
 * 면적기준 자동산출: parking_garage(최저차고×1.5)·youth_training(수용정원×200㎡)·
 * hatchang(최대면적×1.2)·vacant_lot_1household(660㎡ 고정).
 * 별표 직접입력(standardAreaLimit): sports(별표3/4/5)·parking_attached(설치기준면적)·
 * reserve_forces(별표6제2호)·resort(휴양시설업 합산면적).
 * 면적기준 없음(boolean 유지): etc_14호(유사토지)·none.
 * 수입금액비율(2호다·10·11다·12호)은 §168의11② revenueTest 별도 경로.
 */
export type NblRelatedBusinessType =
  | "sports"                // 1호 체육시설 (별표3/4/5 — standardAreaLimit 직접입력)
  | "parking_attached"      // 2호 가목 부설주차장 (설치기준면적 직접입력)
  | "parking_garage"        // 2호 나목 업무용자동차 주차장 (최저차고기준면적 × 1.5)
  | "youth_training"        // 4호 청소년수련시설 (수용정원 × 200㎡ 초과 제외)
  | "reserve_forces"        // 5호 다목 예비군훈련 (별표6 제2호 — standardAreaLimit)
  | "resort"                // 6호 휴양시설업 (합산 기준면적 직접입력)
  | "hatchang"              // 7호 하치장·야적장 (최대면적 × 120%)
  | "vacant_lot_1household" // 13호 무주택1세대 1필지 나지 (660㎡ 고정)
  | "etc_14호"              // 14호 유사토지 (면적기준 없음 — boolean 유지)
  | "none";                 // 호 미해당 (재산세유형·기간기준만)

/**
 * §168의11⑤ 연접 다필지 1건 (하나의 용도로 일괄 사용되는 연접 토지 묶음의 개별 필지).
 * 양도차익 분리 엔진(multi-parcel-transfer.ts)의 ParcelInput과 별개 — NBL 면적 귀속 전용(취득가액 미보유).
 */
export interface NblParcel {
  id: string;
  /** 필지 면적(㎡) */
  landArea: number;
  /** 필지 취득시기 — ⑤ 가목: 취득시기 늦은 필지부터 초과부분 귀속 */
  acquisitionDate: Date;
  /** 해당 필지 위 건축물·시설물 존재 여부 — true면 ⑤2호(바닥면적 제외) */
  hasBuilding: boolean;
  /** ⑤2호 — 건축물 바닥면적·시설물 수평투영면적(㎡). 귀속 후보에서 제외(사업용 유지) */
  buildingFootprintArea?: number;
}

/** 별표6 2호다 — 업종별 (연면적, 기준공장면적률). 2개 이상이면 업종별 산출 후 합산. */
export interface FactoryIndustrySegment {
  /**
   * 해당 업종분 공장건축물 **연면적**(㎡). 경계구역 안 모든 공장용 건축물 연면적(부대시설 포함)
   * + 옥외 기계장치·저장시설의 수평투영면적. **무허가·위법시공 건축물은 제외**(별표6 2호가).
   */
  floorArea: number;
  /**
   * 업종별 기준공장면적률(%). 「공장입지 기준고시」 별표1(KSIC 세세분류 480행, 값 3~20%).
   * 지식산업센터는 같은 고시 §4로 **40%**.
   * ⚠️ 고시가 2026-02-25에 KSIC 11차로 개정됐다 — 그 이전 양도는 2018-162호(10차)가 적용법이다.
   */
  ratePercent: number;
  /** 업종명 — 표시용(계산 무관) */
  industryLabel?: string;
}

/**
 * 공장용 건축물 부속토지 판정 입력. 상세 근거는 `factory-land-standard-area.ts` 헤더 참조.
 *
 * ⚠️ **면적은 전부 「1구의 공장」 전체값**이다(조심 2023지0373 — 하나의 울타리 기준).
 * 양도 대상 필지 면적이 아니다. 산출된 초과 비율이 양도분에 적용된다.
 */
export interface FactoryLandUsage {
  /**
   * 소재 지역 — 한도 산식을 결정한다. **자동판정하지 않는다**(산업단지 지정 여부는
   * `zoneType`으로 알 수 없다). 미입력은 validate에서 차단.
   * - `eup_myeon_or_complex` = 읍·면지역(**군 지역 포함**)·산업단지·공업지역 → §102①1호 별표6
   * - `urban_other` = 그 밖의 특별시·광역시(군 제외)·특별자치시·특별자치도·시지역 → §101①1호 배율
   */
  locationCategory: "eup_myeon_or_complex" | "urban_other";
  /** `eup_myeon_or_complex` 전용 — 업종별 연면적·면적률 (별표6 1호·2호다) */
  segments?: FactoryIndustrySegment[];
  /**
   * `eup_myeon_or_complex` 전용 — 「산집법」 §20① 본문 공장 신설 **제한지역** 소재 여부.
   * 별표6 3호가1)(10%·3,000㎡ 한도) vs 가2)(20%) 분기.
   */
  isRestrictedZone?: boolean;
  /**
   * `eup_myeon_or_complex` 전용 — 별표6 3호나~바 추가 인정면적 합계(㎡).
   * 녹지지역·활주로·철로·6m 이상 도로·접도구역 / 대규모 저수지·침전지 / 경사도 30도 이상 사면용지 /
   * 오염피해 인접토지 / 종업원용 체육시설(기준면적의 10% 이내). 해당 근거 판단은 사용자가 한다.
   */
  additionalRecognizedArea?: number;
  /**
   * `urban_other` 전용 — 공장용 건축물 **바닥면적**(㎡, 건축물 외 시설은 수평투영면적).
   * 연면적(`segments[].floorArea`)과 **다른 값**이다.
   */
  totalFootprintArea?: number;
  /** `urban_other` 전용 — 용도지역(§101② 적용배율 결정). 미등재 용도지역은 계산 차단. */
  zoneType?: ZoneType;
  /**
   * §102①1호 단서·§101① 단서 — 허가·사용승인 미이행 시 부속토지 전량 비사업용.
   * 범위는 무허가 신축에 한정되지 않는다(법제처 해석례 25-0823 — 용도변경 허가 미이행 포함).
   * ⚠️ 입증부담은 과세관청에 있다 — "공부 확인 불가"만으로 단정 불가(조심 2025서2489).
   */
  isUnregistered?: boolean;
}

export interface OtherLandUsage {
  propertyTaxType: PropertyTaxType;
  hasBuilding: boolean;
  /**
   * 공장용 건축물 부속토지 기준면적 판정(§102①1호 별표6 / §101①1호 배율).
   * 미설정 = 공장 아님(기존 동작). 설정 시 Step 0.5에서 한도 초과분을 비사업용으로 안분한다.
   */
  factory?: FactoryLandUsage;
  /** §101①2호나목 — 건축물 바닥면적(㎡, 시설은 수평투영면적). 2% 미달 시 이 면적만 별도합산(사업용) 유지·잔여 부속토지는 종합합산(비사업용). 배율 미적용(나목 carve-out은 바닥면적 자체·연면적 아님). VillaUsage.buildingFloorArea(별개)와 동명이타입 — 무관 */
  buildingFloorArea?: number;
  /**
   * §168의11⑥ 복합용도 건축물 부속토지 안분 모드. undefined=미적용(① 호별 기준면적으로 판정).
   * - "single_building" = ⑥1호: 하나의 건축물 복합용도 → 특정용도분 연면적 / 건축물 연면적 비율로 안분
   * - "multiple_buildings" = ⑥2호: 동일경계 다수 건축물 → 특정용도분 바닥면적 / 전체 바닥면적 비율로 안분
   * 선택 시 ① 호별 기준면적(resolveAreaLimit)은 적용하지 않음(⑥ 단독·이중차감 방지). 기간기준(§168의6) 충족 후 진입.
   */
  mixedUseBuildingMode?: "single_building" | "multiple_buildings";
  /** §168의11⑥1호 — 특정용도분(거주·특정사업 사용분) 연면적(㎡). mixedUseBuildingMode='single_building' 분자 */
  specificUseFloorArea?: number;
  /** §168의11⑥1호 — 건축물 전체 연면적(㎡). 분모 */
  totalFloorArea?: number;
  /** §168의11⑥2호 — 특정용도분 건축물 바닥면적(㎡). mixedUseBuildingMode='multiple_buildings' 분자 */
  specificUseFootprint?: number;
  /** §168의11⑥2호 — 다수 건축물 전체 바닥면적(㎡). 분모 */
  totalFootprint?: number;
  /**
   * §168의11⑤ 연접 다필지 (하나의 용도로 일괄 사용). undefined/빈 배열=단일 필지(기존 동작).
   * 제공 시 §168의11① 호별 기준면적 초과분을 취득시기 늦은 필지부터 귀속(⑤). resolveAreaLimit 기준면적 재사용.
   */
  parcels?: NblParcel[];
  buildingStandardValue?: number;
  landStandardValue?: number;
  isRelatedToResidenceOrBusiness: boolean;
  /** §168의11① 호별 분기. 미설정 시 legacy isRelatedToResidenceOrBusiness fallback. */
  relatedBusinessType?: NblRelatedBusinessType;
  /** 별표/설치기준 직접입력 기준면적(㎡) — sports·parking_attached·reserve_forces·resort. */
  standardAreaLimit?: number;
  /** 7호 하치장: 매년 최대 사용면적(㎡). 엔진이 ×1.2 (§168의11①7호). */
  maxAnnualArea?: number;
  /** 4호 청소년수련시설: 수용정원(명). 엔진이 ×200㎡ (시행규칙 §83의4⑧). */
  youthCapacity?: number;
  /** 2호 나목: 최저차고기준면적(㎡). 엔진이 ×1.5 (§168의11①2호나목). */
  minGarageArea?: number;
  /** 1호 체육시설 종목 (별표3 자동 lookup — F2 Phase A). 미설정 시 standardAreaLimit fallback. */
  sportsFacilityType?: keyof typeof SPORTS_OUTDOOR_STD | keyof typeof SPORTS_INDOOR_STD;
  /** 5호 다목 예비군 부대편성인원 구간 (별표6 — F2 Phase A). */
  reserveForcesUnitSize?: keyof typeof RESERVE_FORCES_STD;
  /** 5호 다목 예비군 포함 시설 (별표6 합산 — 전술교육장 외 실시 불가 시 포함). */
  reserveForcesFacilities?: Array<"tactical" | "shooting_prep" | "range" | "basic">;
  /** 1호 체육시설 유형 (별표3 직장운동경기부 / 별표4 운동경기업 / 별표5 종업원) — F2 Phase B. 미설정 시 workplace(별표3). */
  sportsCategory?: "workplace" | "business" | "employee";
  /** 별표5 종업원 체육시설: 종업원수(명). 구간 선형보간 — F2 Phase B. */
  employeeCount?: number;
  /** 별표5 보유 시설(다중·합산): 운동장(field)·코트(court)·실내(indoor) — F2 Phase B. */
  employeeFacilityKinds?: Array<"field" | "court" | "indoor">;
  /** 6호 휴양 §83의4⑫1호 — 옥외 동물방목장·식물원 면적(㎡). F2 Phase B(B-3). */
  resortOutdoorArea?: number;
  /** 6호 휴양 §83의4⑫2호 — 부설주차장 설치기준면적(㎡). 엔진이 ×2(2배 이내). */
  resortParkingStdArea?: number;
  /** 6호 휴양 §83의4⑫3호 — 건축물 부속토지 면적(㎡, 용도지역별 배율 적용 후·직접입력). residential 등 배율 매핑 불가 시 fallback. */
  resortBuildingAttachedArea?: number;
  /** 6호 휴양 §83의4⑫3호 — 건축물 바닥면적(㎡). zoneType→§101②(지방세법 시행령) 용도지역별 배율 자동(바닥 × 배율). F2 Phase B(B-3 배율 자동). */
  resortBuildingFloorArea?: number;
  /** 별표3·4 비고 — 테니스·연식정구 선수 수(2인 초과 2인마다 가산: 별표3 483㎡·별표4 725㎡). F2 Phase B(B-2). */
  sportsPlayerCount?: number;
  /** 별표3 비고4 — 실내 운동경기부가 실내체육시설을 설치하지 않은 경우 800㎡(workplace 전용). F2 Phase B(B-2). */
  indoorNotInstalled?: boolean;
  /** 별표3·4 비고2 — 주종목 외 추가 보유 종목(다중). **합산이 원칙**이되 5종목군(축구·야구·럭비·필드하키·미식축구)은 그 중 max1만. F2 Phase B(B-2 합산). */
  sportsExtraEvents?: Array<keyof typeof SPORTS_OUTDOOR_STD>;
  /** 별표3·4·5 비고1·3 — 실내 종목 체육시설 건축물 바닥면적(㎡). 부속토지 = min(바닥, 표값) × zoneType 배율(§101②). 미입력 시 표값 fallback. F2 Phase B(B-2 실내 부속토지). */
  indoorFloorArea?: number;
}

export interface ForestUsageDetail {
  isPublicInterest?: boolean;
  hasForestPlan?: boolean;
  isSpecialForestZone?: boolean;
  isForestSuccessor?: boolean;
  /** §168-9 ③7호: 상속개시일부터 3년 경과 전 임야 (보존 유지) */
  inheritedForestWithin3Years?: boolean;
  /** @deprecated 변수명 오류 수정 — `inheritedForestWithin3Years` 사용. 2026-04-21까지 호환 */
  inheritedForestWithin5Years?: boolean;
  forestInheritanceDate?: Date;
}

export interface FarmlandDeemingInput {
  isWeekendFarm?: boolean;
  isFarmConversionApproved?: boolean;
  isFarmDevZone?: boolean;
  isMarginalFarmProject?: boolean;
  isReclaimed?: boolean;
  isPublicProjectUse?: boolean;
  isSickElderlyRental?: boolean;
}
