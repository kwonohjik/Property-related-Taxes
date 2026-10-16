/**
 * 겸용주택 기준시가 fallback·파생 — ④ 페이로드 · ⑧ validate · 부담부증여 요약(`burdened-gift-mixed-use-scope.ts`)이 **같은 값**을 보게 하는 정본.
 *
 * `transfer-tax-api-mixed-use.ts`에 있던 `mixedAcqCommercialBuildingStd`·`mixedAcqLandPricePerSqm`을 **그대로 옮겼다**(동작 무변경).
 * 옮긴 이유: 그 파일은 `transfer-tax-api-helpers` → `transfer-tax-api-burdened-gift` 순환의 안쪽이라, `buildBurdenedGiftInfo`가 쓰는
 * 부담부증여 leaf가 직접 import하면 순환이 된다. 이 파일은 `transfer-pre1990-phd-bridge`·엔진 leaf만 import한다.
 * 기존 import 경로 호환을 위해 `transfer-tax-api-mixed-use.ts`가 두 함수를 재수출한다.
 *
 * ⚠️ 읽기 전용 파생이다 — `useEffect → store` 미러링으로 쓰지 않는다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { computeDerivedAreas } from "@/lib/tax-engine/mixed-use-derived-areas";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "./transfer-pre1990-phd-bridge";

/**
 * 겸용 취득시 상가건물 기준시가 — 직접 입력, 없으면 PHD 전체 건물 기준시가 × (상가면적 / 전체면적).
 * ④ 페이로드와 ⑧ `validateMixedUseAsset`이 **같은 값**을 보도록 한 곳에 둔다(2026-09-30).
 */
export function mixedAcqCommercialBuildingStd(primary: AssetForm): number {
  const direct = parseAmount(primary.mixedAcqCommercialBuildingPrice);
  if (direct > 0) return direct;
  // house_to_commercial Case A: PHD 전체 건물 기준시가 × (상가면적 / 전체면적) 자동 안분
  const phdBuilding = parseAmount(primary.phdBuildingStdPriceAtAcq);
  const residentialArea = parseFloat(primary.residentialFloorArea) || 0;
  const nonResidentialArea = parseFloat(primary.nonResidentialFloorArea) || 0;
  const totalFloor = residentialArea + nonResidentialArea;
  if (phdBuilding > 0 && totalFloor > 0) {
    return Math.floor(phdBuilding * nonResidentialArea / totalFloor);
  }
  return 0;
}

/**
 * 겸용 취득시 개별공시지가(원/㎡) — 직접 입력 → PHD ① → 1990.8.30. 이전 취득 토지 환산.
 * (useEffect→store 미러링 제거 대체 · ④·⑧ 공용)
 */
export function mixedAcqLandPricePerSqm(primary: AssetForm, transferDate: string): number {
  return (
    parseAmount(primary.mixedAcqLandPricePerSqm) ||
    parseAmount(primary.phdLandPricePerSqmAtAcq) ||
    (derivePre1990PhdLandPricePerSqmAtAcq(primary, transferDate) ?? 0)
  );
}

/** 겸용 양도시 개별공시지가(원/㎡) — 주택·상가 부수토지는 동일 필지(단가 공유)라 PHD ③ 값을 fallback으로 인정한다(`buildMixedUsePayload`와 같은 우선순위). */
export function mixedTransferLandPricePerSqm(primary: AssetForm): number {
  return parseAmount(primary.mixedTransferLandPricePerSqm) || parseAmount(primary.phdLandPricePerSqmAtTransfer) || 0;
}

const parseArea = (raw: string | undefined): number => parseFloat((raw ?? "").replace(/,/g, "")) || 0;

/**
 * 겸용 부수토지 파생 면적 — `buildMixedUsePayload`와 같은 three-state override(빈 문자열 → 자동, `"0"` → 적법한 0)를 `computeDerivedAreas`에 넘긴다.
 * ①카드(`MixedUseAreaInputs`)가 단일 입력원이고 이 함수는 조회만 한다.
 */
export function mixedDerivedAreasOf(a: AssetForm): ReturnType<typeof computeDerivedAreas> {
  const resOv = (a.mixedResidentialLandAreaOverride ?? "").trim();
  const comOv = (a.mixedCommercialLandAreaOverride ?? "").trim();
  const fpOv = (a.mixedResidentialFootprintOverride ?? "").trim();
  return computeDerivedAreas({
    residentialFloorArea: parseArea(a.residentialFloorArea),
    nonResidentialFloorArea: parseArea(a.nonResidentialFloorArea),
    buildingFootprintArea: parseArea(a.buildingFootprintArea),
    totalLandArea: parseArea(a.mixedUseTotalLandArea),
    ...(resOv !== "" ? { residentialLandAreaOverride: parseArea(resOv) } : {}),
    ...(comOv !== "" ? { commercialLandAreaOverride: parseArea(comOv) } : {}),
    ...(fpOv !== "" ? { residentialFootprintOverride: parseArea(fpOv) } : {}),
  });
}
