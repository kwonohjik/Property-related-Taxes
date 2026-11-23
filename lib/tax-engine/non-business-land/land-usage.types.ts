/**
 * 비사업용 토지 판정 — **지목별 사용 현황** 입력 타입
 *
 * `types.ts`가 800줄 정책(CLAUDE.md File Size Policy)을 넘겨 분리했다(2026-08-05).
 * 기존 import 경로를 깨지 않도록 `types.ts`가 이 파일을 그대로 재수출한다 —
 * 소비처는 계속 `from "./types"` 를 쓴다.
 */

import type { BusinessUsePeriod, ZoneType } from "./types";
import type { SPORTS_OUTDOOR_STD, SPORTS_INDOOR_STD, RESERVE_FORCES_STD } from "./data/area-standards";
import type { EmployeeSportsFacilityUsage } from "../factory-employee-sports-standard";
import type { PropertyTaxBasis } from "./property-tax-basis";
import type { UnconfirmedReason } from "./property-tax-basis";

export interface PastureUsage {
  isLivestockOperator: boolean;
  livestockType?: string;
  livestockCount?: number;
  standardArea?: number;
  /**
   * 부대시설·초지·사료포 **보유 여부** — 별표1의3의 4개 열은 항목별 인정 한도라
   * 없는 시설의 몫을 얹으면 기준면적이 근거 없이 커진다(축사는 항상 포함).
   * `standardArea` 직접입력 시에는 쓰이지 않는다(자동 산출 fallback 전용).
   */
  hasFacility?: boolean;
  hasGrassland?: boolean;
  hasFodder?: boolean;
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
  /** 농어촌주택 경로 진입 여부. true여도 아래 3요건(영 §168의13 1~3호) 모두 충족해야 사업용 의제 */
  isRuralHousing: boolean;
  /** 영 §168의13 1호 건물 연면적(㎡) — 150 이내 요건 */
  buildingFloorArea?: number;
  /** 영 §168의13 1호 건물 부속토지면적(㎡) — 660 이내 요건. 자산 전체 landArea와 별개(부속토지 전용) */
  attachedLandArea?: number;
  /** 영 §168의13 2호 건물+부속토지 합산 기준시가(원) — 2억 이하 요건 */
  combinedStdValue?: number;
  /** 영 §168의13 3호 「조세특례제한법」 §99의4①1호가목1)~4) 제외지역(수도권·도시지역·조정대상지역·허가구역) 소재 여부. true=제외지역=요건 미충족 */
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
 * §168의11① 호별 분기. **호 목록·요건·면적 산식·근거·필요 입력은 `other-land-ho-meta.ts` 한 표가 단일 소스**다
 * (그 표가 `satisfies Record<NblRelatedBusinessType, …>`라 이 union과 어긋나면 컴파일 오류 — NBL2611-V7-S).
 * 면적기준 자동산출: parking_garage(최저차고×1.5)·youth_training(수용정원×200㎡)·hatchang(최대면적×1.2)·vacant_lot_1household(660㎡ 고정).
 * 별표 직접입력(standardAreaLimit): sports(별표3/4/5)·parking_attached(설치기준면적)·reserve_forces(별표6제2호)·resort(휴양시설업 합산면적).
 * 면적기준 없음(호 요건은 자기 선언): sports_facility_business·stadium_operation·private_investment_land·aggregate_extraction·waste_treatment·fish_farm_licensed.
 * etc_14호 = 14호(위임 규칙 항 없음) — 선택해도 사업용으로 인정하지 않는다(Q-5 (나)).
 * 수입금액비율(2호다·10·11다·12호)은 §168의11② revenueTest 별도 경로.
 */
export type NblRelatedBusinessType =
  | "sports"                    // 1호 가·나목 체육시설 (별표3/4/5 — standardAreaLimit 직접입력)
  | "sports_facility_business"  // 1호 다목 체육시설업 영위자의 직접 사용 토지 (면적기준 없음)
  | "stadium_operation"         // 1호 라목 경기장운영업 영위자의 직접 사용 토지 (면적기준 없음)
  | "parking_attached"          // 2호 가목 부설주차장 (설치기준면적 직접입력)
  | "parking_garage"            // 2호 나목 업무용자동차 주차장 (최저차고기준면적 × 1.5)
  | "private_investment_land"   // 3호 민간투자사업 등 사업시행자 조성 토지 (조성 완료일부터 2년)
  | "youth_training"            // 4호 청소년수련시설 (수용정원 × 200㎡ 초과 제외)
  | "reserve_forces"            // 5호 다목 예비군훈련 (별표6 제2호 — standardAreaLimit)
  | "resort"                    // 6호 휴양시설업 (합산 기준면적 직접입력)
  | "hatchang"                  // 7호 하치장·야적장 (최대면적 × 120%)
  | "aggregate_extraction"      // 8호 골재채취장 (면적기준 없음)
  | "waste_treatment"           // 9호 폐기물처리업 (면적기준 없음)
  | "fish_farm_licensed"        // 11호 가·나목 허가·면허·신고 양어장·지소 (면적기준 없음)
  | "vacant_lot_1household"     // 13호 무주택1세대 1필지 나지 (660㎡ 고정)
  | "etc_14호"                  // 14호 유사토지 — 위임 부령 없음 → 사업용 불인정 + 확인 필요
  | "none";                     // 호 미해당 (재산세유형·기간기준만)

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
  /**
   * 「1구의 공장」 **전체** 부속토지 면적(㎡) — 하나의 울타리 기준(조심 2023지0373).
   *
   * ⚠️ **양도 대상 토지 면적(`NonBusinessLandInput.landArea`)이 아니다.** 한도 비교는 공장
   * 전체로 하고(§1.4), 거기서 나온 초과 **비율**을 양도분에 적용한다 — 선행 CB 작업의
   * 지분 약분과 같은 구조다. 양도가 공장 전체면 두 값이 같아진다.
   */
  totalAppurtenantLandArea: number;
  /** `eup_myeon_or_complex` 전용 — 업종별 연면적·면적률 (별표6 1호·2호다) */
  segments?: FactoryIndustrySegment[];
  /**
   * `eup_myeon_or_complex` 전용 — 「산집법」 §20① 본문 공장 신설 **제한지역** 소재 여부.
   * 별표6 3호가1)(10%·3,000㎡ 한도) vs 가2)(20%) 분기.
   */
  isRestrictedZone?: boolean;
  /**
   * `eup_myeon_or_complex` 전용 — 별표6 3호**나·다·라** 추가 인정면적 합계(㎡).
   * 녹지지역·활주로·철로·6m 이상 도로·접도구역 / 대규모 저수지·침전지 / 경사도 30도 이상 사면용지.
   * 해당 근거 판단은 사용자가 한다.
   *
   * 🔴 **바목(종업원용 체육시설)과 마목(오염피해 인접토지)은 여기 넣지 않는다** — 바목은
   *    10% 상한이 있어 별도 필드(`employeeSportsFacility`)로 받고(E4-06), 마목은
   *    기준면적이 아니라 **부속토지 범위**를 넓히는 규정이라 `totalAppurtenantLandArea` 쪽이다.
   */
  additionalRecognizedArea?: number;
  /**
   * `eup_myeon_or_complex` 전용 — 별표6 3호**바** 종업원용 체육시설용지.
   *
   * 「공장입지기준면적의 100분의 10 이내」 상한이 붙어 있어 나·다·라와 분리해 받는다(E4-06).
   * **표(종업원수 × 운동장·코트·실내) 기준면적도 엔진이 산출**한다 —
   * 비고 2-나(50명 이하 법인 코트만)·2-다(실내 바닥면적 하한)·2-라(§101② 배율) 포함.
   * 상세: `lib/tax-engine/factory-employee-sports-standard.ts`
   */
  employeeSportsFacility?: EmployeeSportsFacilityUsage;
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
  /**
   * NBL2611-V1-A (Q-1) — 재산세 분류 «근거». 건축물 없는 토지의 비종합합산 선언을 존중하는 사실이다.
   * 미선택·「모름」·분류와 맞지 않는 값이면 엔진이 종합합산 + 확인 필요로 접는다(`property-tax-basis.ts`).
   */
  propertyTaxBasis?: PropertyTaxBasis;
  /** NBL2611-V1-A — 근거가 «철거ㆍ멸실»일 때 철거 전 건축물의 바닥면적(㎡). 영 §103의2①1호 — 이 면적 × 영 §101② 적용배율이 별도합산 범위다. */
  demolishedFloorArea?: number;
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
  /**
   * 3호(private_investment_land) — 토지의 **조성 완료일**. 「토지의 조성이 완료된 날부터 2년이 경과한 토지를 제외한다」(영 §168의11①3호 단서)에 따라
   * [완료일, 완료일 + 2년)만 사업용 기간으로 센다(상속 3년과 같은 «기간» 해석 — `threeYearsFrom` 선례). 3호 선택 시 필수 — 없으면 엔진이 던진다(NBL2611-V7-S).
   */
  privateInvestmentCompletionDate?: Date;
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
  /** 6호 휴양 §83의4⑫2호 — 부설주차장 설치기준면적(㎡). 상한은 이 값의 2배(2배 이내). 실제 면적(`resortParkingActualArea`)과 함께 입력해야 한다. */
  resortParkingStdArea?: number;
  /** 6호 휴양 §83의4⑫2호 — 실제 부설주차장용 토지 면적(㎡). 인정 면적 = min(실제, 설치기준면적 × 2) (NBL2611-V9-DM09). */
  resortParkingActualArea?: number;
  /**
   * 6호 휴양 §83의4⑫3호 — **실제** 건축물 부속토지 면적(㎡). 바닥면적(`resortBuildingFloorArea`) × 용도지역별 배율 상한과 비교해 작은 쪽을 인정한다(NBL2611-V9-DM09).
   * 용도지역이 §101② 배율표에 없으면(residential 등) 상한을 계산할 수 없어 사용자가 상한 이내로 확정한 면적을 그대로 쓴다.
   */
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
  /**
   * §168의8③2호 — 상속받은 농지의 상속개시일. 매퍼가 취득원인·취득일에서 정한다(상속인이 아닌 수유자는 비운다 —
   * 기준-2019-법령해석재산-0324). 상속개시일부터 3년을 사업용 기간으로 센다(`threeYearsFrom`).
   */
  inheritanceStartDate?: Date;
}

// ============================================================
// 기타토지 소유기간 중 상태 이력 (NBL-STATE-HISTORY · E1)
// 계획서: docs/01-plan/features/nbl-other-land-state-history.{plan,engine.plan}.md
// E1: leaf·타입만(판정 미연결). **E2: `NonBusinessLandInput.landStateHistory` · echo(`periodEvaluation.stateHistory`)로 판정에 연결**했다.
// ============================================================

/**
 * 사건 종류 — 건축물 신축·멸실(통합 Q-4) + **재산세 과세 구분 변경**(E3-①: 건축물 유무는 그대로인데 구분만 바뀐 사건).
 * 건축물 사건(신축·멸실)만 건축물 상태를 바꾼다 — 구분 변경은 건축물 있는 구간을 둘로 가를 뿐이다(`isBuildingEventKind`).
 */
export type StateEventKind = "building_built" | "building_removed" | "tax_type_changed";

/** 질문 답 — `""` = 미선택(⑧만 차단 · ⑫·엔진은 현행). */
export type StateHistoryMode = "" | "unchanged" | "changed" | "unknown";

/** 공지상태 별도합산의 호별 면적한도 이내 여부 — `""` = 미선택(«모름»과 같이 접힘). 호별 한도는 판정하지 않고 사용자 3지선다로 받는다(E3-1b). */
export type AreaWithinLimit = "" | "within" | "exceeded" | "unknown";

/**
 * 사용자가 입력한 사건. 날짜 = **새 상태의 첫날**(규칙 §83의5①9호 «날부터»).
 * `propertyTaxTypeBefore` = «Before 사슬» — **그 사건이 닫는 구간**(직전 사건 또는 소유 첫날부터 이 사건 전날까지)의 재산세 구분. 꼬리(양도일 현재) 구분은 사건이 아니라 기존 입력이 말한다.
 *   · `building_removed` : 철거 직전 «건축물 있던 구간»의 구분 · `tax_type_changed` : 구분이 바뀌기 직전 구간의 구분 — 건축물 있는 구간이면 `""` = 모름(종합합산 + 확인 필요).
 *   · `building_built`   : 신축 직전 «나대지 구간»의 구분(E3-1b). `""`·미전송·`comprehensive` = 선언 없음(종합합산 · 고지 없음 — 기존 이력과 바이트 동일).
 *
 * **E3-1b — 나대지 구간을 닫는 사건**(신축 행 · 직전 건축물이 없는 `tax_type_changed` 행; 판정은 `eventClosesBareInterval`)만 아래 두 칸을 읽는다. 건축물 있는 구간을 닫는 행에서는 무시한다.
 *   · `propertyTaxBasisBefore` : 그 구분의 근거(V1-A `PropertyTaxBasis` 열거 — `resolvePropertyTaxBasis`를 구간마다 호출). 비종합합산 선언에 근거가 없거나 모름·호환 불가·`demolished`이면 종합합산으로 접고 고지한다.
 *   · `areaWithinLimitBefore`  : 근거가 `vacant_state`일 때만 — `within`만 인정, `exceeded`·`unknown`·`""`는 그 구간을 종합합산으로 접고 고지한다(부분 면적 자동 안분 없음).
 */
export interface StateEvent {
  kind: StateEventKind;
  date: Date;
  propertyTaxTypeBefore?: PropertyTaxType | "";
  propertyTaxBasisBefore?: PropertyTaxBasis | "";
  areaWithinLimitBefore?: AreaWithinLimit;
}

/** 나대지 구간 선언의 해석 결과 — `accepted` = 선언한 구분을 근거와 함께 받아들임 · `unconfirmed` = 종합합산으로 접음. */
export type BareBasisOutcome = "accepted" | "unconfirmed";

/** 나대지 선언을 종합합산으로 접은 사유 — V1-A 사유 + `demolished`(나대지 구간은 받지 않는다 — 철거 후 한시는 유예 9호) + 공지상태 면적한도(일부 초과·모름). */
export type BareFoldReason = UnconfirmedReason | "demolished_unsupported" | "area_exceeded" | "area_unknown";

/**
 * 일 단위 상태 구간 `[start, end)`. `deriveOtherLandStateIntervals`가 만든 배열은 소유기간을 빈틈·겹침 없이 덮고
 * **마지막 원소 = 꼬리(양도일 현재 상태)**다. `"unknown"` = 철거 사건의 재산세 구분이 모름(`""`)이었던 건축물 구간.
 */
export interface LandStateInterval {
  start: Date;
  end: Date;
  hasBuilding: boolean;
  propertyTaxType: PropertyTaxType | "unknown";
  /**
   * E3-1b — 나대지 구간(`hasBuilding=false`)을 닫는 사건에 **비종합합산 선언이 있을 때만** 채운다(없으면 키 자체가 없어 종전 구간과 같다).
   * `accepted`이면 `propertyTaxType` = 선언한 구분(사업용 술어가 읽는다) · `unconfirmed`이면 `propertyTaxType` = `comprehensive`로 접혔다.
   */
  basisOutcome?: BareBasisOutcome;
  /** 사용자가 고른 근거(접힌 구간도 — 있으면). */
  basis?: PropertyTaxBasis;
  /** 사용자가 선언한 구분(접히기 전). */
  declaredPropertyTaxType?: PropertyTaxType;
  /** `unconfirmed`일 때 접힌 사유. */
  foldReason?: BareFoldReason;
}

/**
 * 엔진 입력 — ⑭ 매퍼가 raw 사건(`nblOtherStateEvents`)을 Date로 변환해 싣는다. `mode === "changed"`일 때만 판정에 쓴다(`""`·`unchanged`는 현행 그대로 ·
 * `unknown`은 현행 + 확인 필요 고지). 일 단위 구간은 판정 안(`applyStateHistory`)에서 `deriveOtherLandStateIntervals`로 만든다 — ⑤·⑦·⑧·⑫와 같은 leaf.
 */
export interface LandStateHistoryInput {
  mode: StateHistoryMode;
  events: StateEvent[];
}

/** [echo] 사건 구간표 한 행 — `businessDays` = 이 구간 안에서 사업용으로 센 일수(유예 제외 · 이력·자체 사업기간 기준), `business` = 구간 전체가 사업용. Σ `days` = 소유일수. */
export interface StateHistoryIntervalEcho {
  start: Date;
  end: Date;
  days: number;
  hasBuilding: boolean;
  propertyTaxType: PropertyTaxType | "unknown";
  business: boolean;
  businessDays: number;
  /** E3-1b — 나대지 구간 선언이 있을 때만(`LandStateInterval`의 같은 이름 필드). 없으면 키 없음 = 종전 echo와 같다. */
  basisOutcome?: BareBasisOutcome;
  basis?: PropertyTaxBasis;
  declaredPropertyTaxType?: PropertyTaxType;
  foldReason?: BareFoldReason;
}

/**
 * [echo] 영 §168의6 가·나·다목 구조화 수치(UI 풀어쓰기용). 가목 충족 ⇔ 비사업용 일수 > `limitGa`(소유 5년 이상: `nonBizInWindow5` · 그 밖: `nonBizTotal`),
 * 나목 ⇔ `nonBizInWindow3` > `limitNa`, 다목 ⇔ `nonBizTotal` > `limitDa`. `null` = 그 목이 없다(3호 나목 없음 · 3호 단서 소유 2년 미만 가목 미적용).
 */
export interface StateHistoryCriteriaEcho {
  ownershipBucket: 1 | 2 | 3;
  window5Days: number;
  nonBizInWindow5: number;
  window3Days: number;
  nonBizInWindow3: number;
  nonBizTotal: number;
  limitGa: number | null;
  limitNa: number | null;
  limitDa: number;
}

/** [echo] 상태 이력 판정(`periodEvaluation.basis = "state_history"`)의 구간표와 3기준 수치. 표시 전용(세액은 판정 결과로만 달라진다). */
export interface StateHistoryEcho {
  intervals: StateHistoryIntervalEcho[];
  criteria: StateHistoryCriteriaEcho;
}
