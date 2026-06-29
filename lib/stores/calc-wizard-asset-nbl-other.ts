/**
 * 비사업용 토지 — 기타토지(§168의11) 폼 슬라이스
 *
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리(갭 3a).
 * 필드 값 기본/normalize는 calc-wizard-asset-factory.ts·calc-wizard-asset-nbl.ts가 담당.
 */
/** §168의11⑤ 연접 다필지 1건 (폼 — 전부 string). 엔진 NblParcel과 별개(취득가액 미보유). */
export interface NblParcelFormItem {
  id: string;
  landArea: string;
  acquisitionDate: string;
  hasBuilding: boolean;
  buildingFootprintArea: string;
}

export interface NblOtherFormSlice {
  nblOtherPropertyTaxType: "" | "exempt" | "comprehensive" | "separate" | "special_sum";
  nblOtherBuildingValue: string;
  nblOtherLandValue: string;
  nblOtherIsRelatedToResidence: boolean;
  /** §104의3①4호나목 — 건축물(건물·시설물) 부속토지 여부. false=나대지 간주(종합합산). true=시가표준액 2% 비교(지방세령§101①2호나목): 2% 이상이면 사용자 재산세 유형 적용, 2% 미달이면 종합합산 강제(바닥면적분만 별도합산 유지·아래 nblOtherBuildingFloorArea). */
  nblOtherHasBuilding: boolean;
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
  nblOtherRelatedBusinessType:
    | ""
    | "sports"
    | "parking_attached"
    | "parking_garage"
    | "youth_training"
    | "reserve_forces"
    | "resort"
    | "hatchang"
    | "vacant_lot_1household"
    | "etc_14호"
    | "none";
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
}
