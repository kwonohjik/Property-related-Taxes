/**
 * 검용주택 분리계산 + 보유 중 일부 용도변경 관련 AssetForm 필드 디폴트·마이그레이션 헬퍼.
 *
 * `calc-wizard-asset.ts`가 800줄 정책을 초과하지 않도록 별도 파일로 분리.
 * 본 파일은 `AssetForm` 타입의 검용주택 + partialUsageChange 18필드만 다룬다.
 */

import type { AssetForm } from "./calc-wizard-asset";

/** 검용주택 + 보유 중 일부 용도변경 관련 디폴트 (18필드) */
export const MIXED_USE_DEFAULTS: Pick<
  AssetForm,
  | "isMixedUseHouse"
  | "residentialFloorArea"
  | "nonResidentialFloorArea"
  | "buildingFootprintArea"
  | "mixedUseTotalLandArea"
  | "mixedUseResidencePeriodYears"
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
  residentialFloorArea: "",
  nonResidentialFloorArea: "",
  buildingFootprintArea: "",
  mixedUseTotalLandArea: "",
  mixedUseResidencePeriodYears: "",
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
 * 검용주택 + partialUsageChange 필드를 raw 객체에 backward compat 가드 적용.
 * sessionStorage·DB 이력에서 누락된 신규 필드를 디폴트로 채움.
 */
export function migrateMixedUseFields(a: Record<string, unknown>): void {
  // 검용주택 분리계산 필드 (기존)
  if (a.isMixedUseHouse === undefined) a.isMixedUseHouse = false;
  if (!a.residentialFloorArea) a.residentialFloorArea = "";
  if (!a.nonResidentialFloorArea) a.nonResidentialFloorArea = "";
  if (!a.buildingFootprintArea) a.buildingFootprintArea = "";
  if (!a.mixedUseTotalLandArea) a.mixedUseTotalLandArea = "";
  if (!a.mixedUseResidencePeriodYears) a.mixedUseResidencePeriodYears = "";
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
