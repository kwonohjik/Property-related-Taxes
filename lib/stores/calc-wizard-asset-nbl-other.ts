/**
 * 비사업용 토지 — 기타토지(§168의11) 폼 슬라이스
 *
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리(갭 3a).
 * 필드 값 기본/normalize는 calc-wizard-asset-factory.ts·calc-wizard-asset-nbl.ts가 담당.
 */
import type { NblRelatedBusinessType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { AreaWithinLimit } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateEventKind } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { StateHistoryMode } from "@/lib/tax-engine/non-business-land/land-usage.types";
import type { WholesaleItem } from "@/lib/tax-engine/non-business-land/revenue-wholesale-item";
import type { PropertyTaxBasis } from "@/lib/tax-engine/non-business-land/property-tax-basis";

/** §168의11⑤ 연접 다필지 1건 (폼 — 전부 string). 엔진 NblParcel과 별개(취득가액 미보유). */
export interface NblParcelFormItem {
  id: string;
  landArea: string;
  acquisitionDate: string;
  hasBuilding: boolean;
  buildingFootprintArea: string;
}

/**
 * 별표6 2호다 — 업종 1건(폼, 전부 string). 2건 이상이면 업종별로 산출해 합산한다.
 * `id`는 React key 전용 — 엔진은 쓰지 않는다.
 */
export interface NblFactorySegmentFormItem {
  id: string;
  /** 해당 업종분 공장건축물 **연면적**(㎡). 무허가·위법시공분 제외(별표6 2호가) */
  floorArea: string;
  /** 업종별 기준공장면적률(%) — 「공장입지 기준고시」 별표1. 지식산업센터는 같은 고시 §4로 40 */
  ratePercent: string;
  /** 업종명 — 표시용(계산 무관) */
  industryLabel: string;
}

/**
 * NBL-STATE-HISTORY-U0 — 기타토지 소유기간 중 사건 1건(폼 — 전부 string): 건축물 신축·멸실 또는 재산세 과세 구분 변경(E3-①). 엔진 `StateEvent`(Date)와 별개.
 * `kind ""` = 아직 종류를 고르지 않은 행(⑧ 차단). `propertyTaxTypeBefore`는 그 사건이 닫는 구간의 재산세 구분이다 —
 * 철거·건축물 있는 구간 위 구분 변경 행은 `""` = 모름(종합합산 + 확인 필요) · **신축 행·나대지 위 구분 변경 행**(E3-1b — 나대지 구간을 닫는 행, 판정 = leaf `eventClosesBareInterval`)은 나대지 선언이다.
 * 신축 행의 `""` = 선언 없음(종합합산 · 고지 없음).
 *
 * E3-1b 선언 칸 2개는 **optional** — 키가 없는 기존 행과 byte-identical이다(③ 복원은 키를 새로 만들지 않는다).
 *  · `propertyTaxBasisBefore` : 비종합합산 선언의 근거(V1-A 열거 — 나대지 구간은 `demolished` 제외). `""`·부재 = 미선택(종합합산으로 접히고 확인 필요).
 *  · `areaWithinLimitBefore`  : 근거가 공지상태(`vacant_state`)일 때만 — 호별 면적한도 이내 여부 3지선다. `""`·부재 = 미선택(「모름」과 같이 접힘).
 */
export interface NblOtherStateEventInput {
  kind: "" | StateEventKind;
  date: string;
  propertyTaxTypeBefore: "" | PropertyTaxType;
  propertyTaxBasisBefore?: "" | PropertyTaxBasis;
  areaWithinLimitBefore?: AreaWithinLimit;
}

export interface NblOtherFormSlice {
  // ── 공장용 건축물 부속토지 기준면적 (「지방세법 시행령」 §102①1호 별표6 / §101①1호) ──
  // ⚠️ 면적은 전부 **1구의 공장 전체값**이다(양도 대상 필지 면적이 아님 — 조심 2023지0373).
  // 용도지역은 별도 필드 없이 `nblZoneType`을 승계한다(단일 소스).
  /** 공장 판정 토글. OFF면 factory 입력 전체가 엔진에 도달하지 않는다(= 공장 아님) */
  nblFactoryEnabled: boolean;
  /** 한도 산식을 가르는 소재 지역. ""=미선택(validate 차단) */
  nblFactoryLocationCategory: "" | "eup_myeon_or_complex" | "urban_other";
  /** 공장 전체(하나의 울타리 기준) 부속토지 면적(㎡) */
  nblFactoryTotalLandArea: string;
  /** 별표6 경로 — 업종별 연면적·면적률 */
  nblFactorySegments: NblFactorySegmentFormItem[];
  /** 별표6 3호가1) 「산집법」 §20① 공장 신설 제한지역 — 10%·3,000㎡ 한도 vs 가2) 20% */
  nblFactoryIsRestrictedZone: boolean;
  /** 별표6 3호나~바 추가 인정면적 합계(㎡) — 녹지·활주로·철로·6m 도로·접도구역·저수지·30도 사면 등 */
  nblFactoryAdditionalRecognizedArea: string;
  /** 별표6 3호바 비고 2-가 — 그 사업장에 근무하는 종업원 수 */
  nblFactorySportsEmployeeCount: string;
  /** 별표6 3호바 비고 2-나 — 「50명 이하인 **법인**」만 코트면적만 인정 */
  nblFactorySportsEntityType: "" | "corporation" | "individual";
  /** 실외체육시설 — 운동장 용지 면적 (㎡) */
  nblFactorySportsPlaygroundArea: string;
  /** 실외체육시설 — 테니스·정구코트 용지 면적 (㎡) */
  nblFactorySportsCourtArea: string;
  /** 실내체육시설 **건축물 바닥면적** (㎡) — 비고 2-다·라 */
  nblFactorySportsIndoorFloorArea: string;
  /** §101①1호 경로 — 공장용 건축물 **바닥면적**(㎡). 연면적과 다른 값이다 */
  nblFactoryFootprintArea: string;
  /** §102①1호 단서·§101① 단서 — 허가·사용승인 미이행(용도변경 허가 미이행 포함) */
  nblFactoryIsUnregistered: boolean;

  nblOtherPropertyTaxType: "" | "exempt" | "comprehensive" | "separate" | "special_sum";
  /** NBL2611-V1-A (Q-1) — 재산세 분류 «근거»(건축물 없는 토지의 비종합합산 선언을 존중하는 사실). ""=미선택(엔진이 종합합산 + 확인 필요로 접는다 — ⑧ 차단 아님). 선언·건축물 유무에 맞지 않는 stale 값은 화면이 숨기고 매퍼가 보내지 않는다. */
  nblOtherPropertyTaxBasis: "" | PropertyTaxBasis;
  /** NBL2611-V1-A — 근거가 «철거ㆍ멸실»일 때 철거 전 건축물 바닥면적(㎡). 영 §103의2①1호 */
  nblOtherDemolishedFloorArea: string;
  nblOtherBuildingValue: string;
  nblOtherLandValue: string;
  nblOtherIsRelatedToResidence: boolean;
  /** NBL2611-Q-10(나) — 저장된 이력에 레거시 「거주·사업 직접 관련」이 켜져 있었으나 호가 없어 false로 정규화됨: 「호 재선택」 고지 표지(표시 전용 — ④가 보내지 않는다) */
  nblOtherLegacyRelatedReselect: boolean;
  /** §104의3①4호나목 — 건축물(건물·시설물) 부속토지 여부. false=나대지 간주(종합합산 — 단 NBL2611-V1-A: 재산세 분류 «근거»(nblOtherPropertyTaxBasis)가 확인된 비종합합산 선언은 존중). true=시가표준액 2% 비교(지방세령§101①2호나목): 2% 이상이면 사용자 재산세 유형 적용, 2% 미달이면 종합합산 강제(바닥면적분만 별도합산 유지·아래 nblOtherBuildingFloorArea). */
  nblOtherHasBuilding: boolean;
  /**
   * NBL-STATE-HISTORY-U0 — 「소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있습니까?」 답. `""` = 아직 답하지 않음(⑧만 차단 — ⑫·엔진은 현행).
   * `changed`이면 `nblOtherStateEvents`가 판정에 쓰이고 「건축물 있음」 토글 대신 마지막 사건이 양도일 현재 유무를 정한다(`effectiveOtherHasBuildingOf`).
   */
  nblOtherStateHistoryMode: StateHistoryMode;
  /** NBL-STATE-HISTORY-U0 — 사건 행(날짜순). `changed`일 때만 판정에 쓴다. 자산마다 새 배열 인스턴스. */
  nblOtherStateEvents: NblOtherStateEventInput[];
  /** §101①2호나목 — 건축물 바닥면적(㎡). 2% 미달 시 이 면적만 별도합산(사업용) 유지·잔여 부속토지는 종합합산(비사업용) */
  nblOtherBuildingFloorArea: string;
  // §168의11⑥ 복합용도 건축물 부속토지 안분 (B) — ""=미적용·single_building=⑥1호(연면적비)·multiple_buildings=⑥2호(바닥면적비)
  nblOtherMixedUseMode: "" | "single_building" | "multiple_buildings";
  /** §168의11⑥1호 특정용도분 연면적(㎡) */
  nblOtherMixedUseSpecificFloorArea: string;
  /** §168의11⑥1호 건축물 전체 연면적(㎡) */
  nblOtherMixedUseTotalFloorArea: string;
  /** §168의11⑥2호 특정용도분 바닥면적(㎡) */
  nblOtherMixedUseSpecificFootprint: string;
  /** §168의11⑥2호 다수 건축물 전체 바닥면적(㎡) */
  nblOtherMixedUseTotalFootprint: string;
  // §168의11⑤ 연접 다필지 취득시기순 안분 (C·D) — OFF=단일 필지, ON=필지 배열
  nblOtherUseParcels: boolean;
  nblOtherParcels: NblParcelFormItem[];
  // §168의11① 호별 면적기준 (갭 3a) — NblRelatedBusinessType
  // 호 목록은 엔진 `other-land-ho-meta.ts` 표가 단일 소스(NBL2611-V7-S) — "" = 미선택
  nblOtherRelatedBusinessType: "" | NblRelatedBusinessType;
  /** NBL2611-V7-S — 3호(민간투자사업 등 조성 토지) 조성 완료일(YYYY-MM-DD). 조성이 완료된 날부터 2년이 경과한 토지는 제외 → 2년 구간만 사업용 기간 */
  nblOtherPrivateInvestCompletionDate: string;
  nblOtherStandardAreaLimit: string;
  nblOtherMaxAnnualArea: string;
  nblOtherYouthCapacity: string;
  nblOtherMinGarageArea: string;
  // §168의11① F2 Phase A — 별표3 체육시설 종목·별표6 예비군 부대규모/시설 (자동 lookup)
  nblOtherSportsFacilityType: string;
  nblOtherReserveUnitSize: string;
  nblOtherReserveFacilities: string[];
  // §168의11① F2 Phase B — 체육시설 유형(별표3 직장/별표4 운동경기업/별표5 종업원)·종업원 체육시설
  nblOtherSportsCategory: string;
  nblOtherEmployeeCount: string;
  nblOtherEmployeeFacilityKinds: string[];
  // §168의11① F2 Phase B(B-3) — 6호 휴양 §83의4⑫ 3요소(옥외방목장·부설주차장·건축물 부속토지)
  nblOtherResortOutdoorArea: string;
  nblOtherResortParkingStdArea: string;
  /** NBL2611-V9-DM09 — 실제 부설주차장용 토지 면적(㎡). 인정 면적 = min(실제, 설치기준면적 × 2). */
  nblOtherResortParkingActualArea: string;
  nblOtherResortBuildingArea: string;
  // §168의11① F2 Phase B(B-2) — 선수가산(테니스·연식정구)·실내미설치·종목합산(별표3·4 비고)
  nblOtherSportsPlayerCount: string;
  nblOtherIndoorNotInstalled: boolean;
  nblOtherSportsExtraEvents: string[];
  nblOtherIndoorFloorArea: string;
  // §168의11① F2 Phase B(B-3) — 6호 휴양 건축물 바닥면적(§101② 배율 자동)
  nblOtherResortBuildingFloorArea: string;
  // §168의11② 수입금액비율 (기타토지 특정 업종)
  nblRevenueBusinessType:
    | ""
    | "parking_operation"
    | "mineral_spring"
    | "fish_farm_other"
    | "block_stone_pipe_mfg"
    | "landscaping_floriculture"
    | "vehicle_repair_academy"
    | "agriculture_academy"
    | "wholesale_retail";
  /** NBL2611-V7-S · Q-6 (다) — 12호 도소매업 취급 품목(규칙 §83조의4⑭). 도소매업 선택 시 필수 */
  nblRevenueWholesaleItem: "" | WholesaleItem;
  /** 농산물·수산물·축산물 도소매 — 「유통산업발전법」에 따른 시장·유사 장소 운영 여부 */
  nblRevenueWholesaleInMarket: boolean;
  nblRevenueCurrentRevenue: string;
  nblRevenueCurrentLandValue: string;
  nblRevenuePriorRevenue: string;
  nblRevenuePriorLandValue: string;
  /** §168의11③3호 당해 사업개시일 (당해연도 중 개시 시; 미입력 시 과세기간개시일·취득일 자동) */
  nblRevenueCurrentBusinessStartDate: string;
  /** §168의11③3호 직전 과세기간 영위일수 (직전연도 중 개시·폐업 시; 미입력 시 직전 환산 안 함) */
  nblRevenuePriorBusinessDays: string;
  /** §168의11③1호 당해 전세금·임대보증금 (원) */
  nblRevenueCurrentDeposit: string;
  /** §168의11③1호 당해 임대 과세대상기간 일수 */
  nblRevenueCurrentRentDays: string;
  /** §168의11③1호 직전 전세금·임대보증금 (원) */
  nblRevenuePriorDeposit: string;
  /** §168의11③1호 직전 임대 과세대상기간 일수 */
  nblRevenuePriorRentDays: string;
  /** §168의11③2호 공통수입 안분 토글 */
  nblRevenueCommonApportion: boolean;
  /** §168의11③2호 당해 공통수입금액 (원) */
  nblRevenueCommonRevenue: string;
  /** §168의11③2호 당해 그 밖의 토지가액 (원) */
  nblRevenueOtherLandValue: string;
  /** §168의11③2호 직전 공통수입금액 (원) */
  nblRevenuePriorCommonRevenue: string;
  /** §168의11③2호 직전 그 밖의 토지가액 (원) */
  nblRevenuePriorOtherLandValue: string;
  /**
   * NBL-STATE-HISTORY-E3-② 「영위 기간」 토글 — 이 토지에서 업종을 소유기간 중 개시했거나 폐업한 경우. 기본 꺼짐 = 현행(양도일 현재 업종을 소유기간 전체에 적용).
   * 켜면 개시일(`nblRevenueCurrentBusinessStartDate` — 단일 소스)·폐업일·T−2 이전 과세기간별 수입금액·토지가액을 받아 과세기간별로 판정한다.
   */
  nblRevenuePeriodOn: boolean;
  /** 폐업일 = 영업을 하지 않게 된 첫날(휴업·폐업·이전). 비면 양도일 현재도 영위. 개시일은 위 `nblRevenueCurrentBusinessStartDate`. */
  nblRevenueBusinessEndDate: string;
  /** 양도연도 T−2 이전 과세기간별 수입금액·토지가액 — 연도 키 희소 목록(개시일을 바꿔도 값이 밀리지 않는다). T·T−1은 위 당해·직전 칸이 말한다. */
  nblRevenueYearRows: NblRevenueYearRowInput[];
}

/** 영위 기간 표의 한 해 — 전부 문자열(폼 규칙). 금액이 비면 «모름»(그 연도 불통과 + 확인 필요 — 차단하지 않는다). */
export interface NblRevenueYearRowInput {
  year: string;
  revenue: string;
  landValue: string;
}
