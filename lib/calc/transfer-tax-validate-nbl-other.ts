/**
 * 비사업용 토지 — 기타토지(§168의11) 정밀판정 입력 검증 (⑧)
 *
 * transfer-tax-validate-asset.ts에서 분리(800줄 정책). 자동 안분 fallback 금지·엔진 클램프 금지 원칙 준수.
 * - §168의11① 호별 면적기준 인자 필수
 * - §168의11⑤ 연접 다필지 (nblOtherUseParcels ON 시 필지·면적·취득일 필수, 건축물 필지는 바닥면적 필수)
 * - §168의11⑥ 복합용도 건축물 안분 (mode 선택 시 분자·분모 필수·분자≤분모)
 */
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** 기타토지(other_land) 정밀판정 입력 검증. 첫 오류 메시지 또는 null. */
export function validateNblOtherLand(asset: AssetForm, label: string): string | null {
  if (asset.nblLandType !== "other_land") return null;

  // §168의11① 호별 면적기준 — 면적인자 요구 호 선택 시 해당 면적인자 필수 (자동 안분 fallback 금지)
  const bt = asset.nblOtherRelatedBusinessType;
  const needsStandardArea = bt === "parking_attached";
  if (needsStandardArea && (!asset.nblOtherStandardAreaLimit || parseDecimal(asset.nblOtherStandardAreaLimit) <= 0))
    return `${label}: 선택한 호의 기준면적(㎡)을 입력하세요. (§168의11① 별표·설치기준면적)`;
  // F2 Phase B(B-3) — resort: 6호 휴양 3요소 중 하나 또는 기준면적 직접입력
  if (bt === "resort") {
    const has3Element =
      (!!asset.nblOtherResortOutdoorArea && parseDecimal(asset.nblOtherResortOutdoorArea) > 0) ||
      (!!asset.nblOtherResortParkingStdArea && parseDecimal(asset.nblOtherResortParkingStdArea) > 0) ||
      (!!asset.nblOtherResortBuildingArea && parseDecimal(asset.nblOtherResortBuildingArea) > 0) ||
      (!!asset.nblOtherResortBuildingFloorArea && parseDecimal(asset.nblOtherResortBuildingFloorArea) > 0);
    const hasDirect = !!asset.nblOtherStandardAreaLimit && parseDecimal(asset.nblOtherStandardAreaLimit) > 0;
    if (!has3Element && !hasDirect)
      return `${label}: 휴양시설 — 옥외방목장·부설주차장·건축물 부속토지 중 하나 또는 기준면적(㎡)을 입력하세요. (§83의4⑫)`;
  }
  // F2 Phase B — sports 유형별: employee→종업원수·보유시설 / workplace·business→종목 OR 직접입력
  if (bt === "sports") {
    const cat = asset.nblOtherSportsCategory || "workplace";
    const hasDirect = !!asset.nblOtherStandardAreaLimit && parseDecimal(asset.nblOtherStandardAreaLimit) > 0;
    if (cat === "employee") {
      const hasEmployee =
        !!asset.nblOtherEmployeeCount &&
        parseDecimal(asset.nblOtherEmployeeCount) > 0 &&
        (asset.nblOtherEmployeeFacilityKinds?.length ?? 0) > 0;
      if (!hasEmployee && !hasDirect)
        return `${label}: 종업원 체육시설 — 종업원 수와 보유 시설을 선택하거나 기준면적(㎡)을 직접 입력하세요. (별표5)`;
    } else if (!asset.nblOtherSportsFacilityType && !hasDirect) {
      return `${label}: 체육시설 — 종목을 선택하거나 기준면적(㎡)을 직접 입력하세요. (별표3·4)`;
    }
  }
  // F2 Phase A — reserve_forces: 부대편성인원+시설 선택(별표6 자동) 또는 기준면적 직접입력 중 하나 필수
  if (bt === "reserve_forces" && !(asset.nblOtherReserveUnitSize && (asset.nblOtherReserveFacilities?.length ?? 0) > 0) && (!asset.nblOtherStandardAreaLimit || parseDecimal(asset.nblOtherStandardAreaLimit) <= 0))
    return `${label}: 예비군훈련장 — 부대편성인원·시설을 선택하거나 기준면적(㎡)을 직접 입력하세요. (별표6)`;
  if (bt === "hatchang" && (!asset.nblOtherMaxAnnualArea || parseDecimal(asset.nblOtherMaxAnnualArea) <= 0))
    return `${label}: 하치장 — 매년 최대 사용면적(㎡)을 입력하세요. (§168의11①7호)`;
  if (bt === "youth_training" && (!asset.nblOtherYouthCapacity || parseDecimal(asset.nblOtherYouthCapacity) <= 0))
    return `${label}: 청소년수련시설 — 수용정원(명)을 입력하세요. (§168의11①4호)`;
  if (bt === "parking_garage" && (!asset.nblOtherMinGarageArea || parseDecimal(asset.nblOtherMinGarageArea) <= 0))
    return `${label}: 업무용자동차 주차장 — 최저차고기준면적(㎡)을 입력하세요. (§168의11①2호나목)`;

  // §168의11⑤ 연접 다필지 — ON 시 필지 1건↑·각 필지 면적·취득일 필수, 건축물 필지는 바닥면적 필수 (자동 fallback 금지)
  if (asset.nblOtherUseParcels) {
    const parcels = asset.nblOtherParcels ?? [];
    if (parcels.length === 0)
      return `${label}: 연접 다필지 입력을 켰습니다. 필지를 1개 이상 추가하세요. (§168의11⑤)`;
    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      if (!p.landArea || parseDecimal(p.landArea) <= 0)
        return `${label}: 연접 다필지 — 필지 ${i + 1}의 면적(㎡)을 입력하세요. (§168의11⑤)`;
      if (!p.acquisitionDate)
        return `${label}: 연접 다필지 — 필지 ${i + 1}의 취득일을 입력하세요. (§168의11⑤ 취득시기순 안분)`;
      if (p.hasBuilding && (!p.buildingFootprintArea || parseDecimal(p.buildingFootprintArea) <= 0))
        return `${label}: 연접 다필지 — 필지 ${i + 1}은 건축물이 있어 바닥면적(㎡)이 필요합니다. (§168의11⑤2호)`;
    }
  }

  // §168의11⑥ 복합용도 건축물 안분 — mode 선택 시 분자·분모 필수·분자≤분모 (자동 fallback 금지·엔진 클램프 금지)
  const mu = asset.nblOtherMixedUseMode;
  if (mu === "single_building" || mu === "multiple_buildings") {
    const numS = mu === "single_building" ? asset.nblOtherMixedUseSpecificFloorArea : asset.nblOtherMixedUseSpecificFootprint;
    const denS = mu === "single_building" ? asset.nblOtherMixedUseTotalFloorArea : asset.nblOtherMixedUseTotalFootprint;
    if (!numS || parseDecimal(numS) <= 0 || !denS || parseDecimal(denS) <= 0)
      return `${label}: 복합용도 건축물 안분 — 특정용도분 면적과 전체 면적(㎡)을 모두 입력하세요. (§168의11⑥)`;
    if (parseDecimal(numS) > parseDecimal(denS))
      return `${label}: 복합용도 건축물 안분 — 특정용도분 면적은 전체 면적을 초과할 수 없습니다. (§168의11⑥)`;
  }

  return null;
}
