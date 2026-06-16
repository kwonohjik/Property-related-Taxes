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
