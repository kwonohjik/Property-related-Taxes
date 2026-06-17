/**
 * 비사업용 토지 — 기타토지(§168의11) 폼 슬라이스
 *
 * AssetForm이 extends. 800줄 정책으로 calc-wizard-asset.ts에서 분리(갭 3a).
 * 필드 값 기본/normalize는 calc-wizard-asset-factory.ts·calc-wizard-asset-nbl.ts가 담당.
 */
export interface NblOtherFormSlice {
  nblOtherPropertyTaxType: "" | "exempt" | "comprehensive" | "separate" | "special_sum";
  nblOtherBuildingValue: string;
  nblOtherLandValue: string;
  nblOtherIsRelatedToResidence: boolean;
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
}
