/**
 * 겸용주택 분리계산 + 보유 중 일부 용도변경 관련 AssetForm 필드 디폴트·마이그레이션 헬퍼.
 *
 * `calc-wizard-asset.ts`가 800줄 정책을 초과하지 않도록 별도 파일로 분리.
 * 본 파일은 `AssetForm` 타입의 겸용주택 + partialUsageChange 18필드만 다룬다.
 */

import type { AssetForm } from "./calc-wizard-asset";

/** 겸용주택 + 보유 중 일부 용도변경 관련 디폴트 (18필드) */
export const MIXED_USE_DEFAULTS: Pick<
  AssetForm,
  | "isMixedUseHouse"
  | "residentialExclusiveArea"
  | "commercialExclusiveArea"
  | "commonArea"
  | "residentialFloorArea"
  | "nonResidentialFloorArea"
  | "buildingFootprintArea"
  | "mixedUseTotalLandArea"
  | "mixedResidentialLandAreaOverride"
  | "mixedTransferHousingPrice"
  | "mixedTransferCommercialBuildingPrice"
  | "mixedTransferLandPricePerSqm"
  | "mixedAcqHousingPrice"
  | "mixedAcqCommercialBuildingPrice"
  | "mixedAcqLandPricePerSqm"
  | "mixedIsMetropolitanArea"
  | "hasPartialUsageChange"
  | "partialChangeDirection"
  | "partialChangeAcqResidentialArea"
  | "partialChangeAcqCommercialArea"
  | "partialChangeDate"
> = {
  isMixedUseHouse: false,
  residentialExclusiveArea: "",
  commercialExclusiveArea: "",
  commonArea: "",
  residentialFloorArea: "",
  nonResidentialFloorArea: "",
  buildingFootprintArea: "",
  mixedUseTotalLandArea: "",
  mixedResidentialLandAreaOverride: "",
  mixedTransferHousingPrice: "",
  mixedTransferCommercialBuildingPrice: "",
  mixedTransferLandPricePerSqm: "",
  mixedAcqHousingPrice: "",
  mixedAcqCommercialBuildingPrice: "",
  mixedAcqLandPricePerSqm: "",
  mixedIsMetropolitanArea: true,
  // ── 보유 중 일부 용도변경 (시행령 §166⑥ + 집행기준 99-164-10) ──
  hasPartialUsageChange: false,
  partialChangeDirection: "",
  partialChangeAcqResidentialArea: "",
  partialChangeAcqCommercialArea: "",
  partialChangeDate: "",
};

/**
 * 겸용주택 + partialUsageChange 필드를 raw 객체에 backward compat 가드 적용.
 * sessionStorage·DB 이력에서 누락된 신규 필드를 디폴트로 채움.
 */
export function migrateMixedUseFields(a: Record<string, unknown>): void {
  // 겸용주택 분리계산 필드 (기존)
  if (a.isMixedUseHouse === undefined) a.isMixedUseHouse = false;
  if (!a.residentialExclusiveArea) a.residentialExclusiveArea = "";
  if (!a.commercialExclusiveArea) a.commercialExclusiveArea = "";
  if (!a.commonArea) a.commonArea = "";
  // ⚠️ legacy 이력 회귀 방지 (R1): residentialFloorArea 는 직접입력 값이 있을 수 있으므로
  // 전용/공통이 없어도 기존 연면적을 보존한다 (덮어쓰기 금지).
  if (!a.residentialFloorArea) a.residentialFloorArea = "";
  if (!a.nonResidentialFloorArea) a.nonResidentialFloorArea = "";
  if (!a.buildingFootprintArea) a.buildingFootprintArea = "";
  if (!a.mixedUseTotalLandArea) a.mixedUseTotalLandArea = "";
  if (!a.mixedResidentialLandAreaOverride) a.mixedResidentialLandAreaOverride = "";
  if (!a.mixedTransferHousingPrice) a.mixedTransferHousingPrice = "";
  if (!a.mixedTransferCommercialBuildingPrice) a.mixedTransferCommercialBuildingPrice = "";
  if (!a.mixedTransferLandPricePerSqm) a.mixedTransferLandPricePerSqm = "";
  if (!a.mixedAcqHousingPrice) a.mixedAcqHousingPrice = "";
  if (!a.mixedAcqCommercialBuildingPrice) a.mixedAcqCommercialBuildingPrice = "";
  if (!a.mixedAcqLandPricePerSqm) a.mixedAcqLandPricePerSqm = "";
  if (a.mixedIsMetropolitanArea === undefined) a.mixedIsMetropolitanArea = true;

  // 보유 중 일부 용도변경 필드 (신규 — 2026-04-30)
  if (a.hasPartialUsageChange === undefined) a.hasPartialUsageChange = false;
  if (a.partialChangeDirection === undefined) a.partialChangeDirection = "";
  if (!a.partialChangeAcqResidentialArea) a.partialChangeAcqResidentialArea = "";
  if (!a.partialChangeAcqCommercialArea) a.partialChangeAcqCommercialArea = "";
  if (!a.partialChangeDate) a.partialChangeDate = "";
}
