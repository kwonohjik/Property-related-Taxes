/**
 * 파트별 취득 모드(land/buildingAcqMode) 유효값 도출 — 단일 소스.
 *
 * `AssetForm.landAcqMode`/`buildingAcqMode`는 사용자가 분리 모드에서 파트별 라디오를 아직
 * 선택하지 않으면 빈 문자열("")이다. 그 경우 자산 전체 레거시 단일 플래그
 * (`useEstimatedAcquisition`·`isAppraisalAcquisition`·`isSalesCaseAcquisition` — 상단
 * "취득가액 산정 방식" 라디오, `CompanionAcqPurchaseBlock.tsx:137-143`의 `acqPriceMode`와 동일 규칙)
 * 에서 파생한다.
 *
 * UI 표시(라디오 기본 선택) · API 변환(엔진 전송값) · validate(§7.2 필수 검증) **모두** 이 함수를
 * 단일 소스로 사용 — 각자 다른 파생 로직을 재구현하면 dual-truth(UI 표시 ≠ 실제 전송값)가 재발한다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 */

export type PartAcqMode = "actual" | "estimated" | "appraisal" | "salesCase";

interface LegacyAcqFlags {
  isSalesCaseAcquisition?: boolean;
  isAppraisalAcquisition?: boolean;
  useEstimatedAcquisition?: boolean;
}

/** 자산 전체 단일 플래그에서 파생되는 레거시 취득 방식 (우선순위: 매매사례 > 감정 > 환산 > 실가). */
export function deriveLegacyPartAcqMode(asset: LegacyAcqFlags): PartAcqMode {
  if (asset.isSalesCaseAcquisition) return "salesCase";
  if (asset.isAppraisalAcquisition) return "appraisal";
  if (asset.useEstimatedAcquisition) return "estimated";
  return "actual";
}

/** `explicit`(land/buildingAcqMode, "" 허용)이 있으면 그대로, 없으면 레거시 파생값. */
export function effectivePartAcqMode(
  explicit: PartAcqMode | "" | undefined,
  asset: LegacyAcqFlags,
): PartAcqMode {
  return explicit || deriveLegacyPartAcqMode(asset);
}

interface SeparateAcquisitionFlags {
  hasSeperateLandAcquisitionDate?: boolean;
  landAcquisitionDate?: string;
  acquisitionDate?: string;
  isMixedUseHouse?: boolean;
  assetKind?: string;
}

/**
 * **별개 취득** 판정 — 토지와 건물을 서로 다른 시점에 각각 취득해 취득가액이 파트별로 실재하는 자산인가.
 *
 * `hasSeperateLandAcquisitionDate` 플래그 단독으로는 판정할 수 없다. 이 플래그는
 * 겸용주택 체크(`MixedUseSection.tsx:48`)와 `selfOwns !== "both"` 선택
 * (`CompanionAcquisitionCauseSection.tsx:179`)에서도 **강제로 켜지기 때문**이다 —
 * 그 두 경로는 토지·건물을 같은 날 함께 취득했어도 분리 계산 경로를 타므로,
 * 취득가액은 여전히 하나의 총액으로 실재한다(§166⑥ "구분할 수 없는 때" 안분이 정당).
 *
 * 취득가액을 파트별 완결로 요구해야 하는 것은 **실제로 취득시점이 다른** 경우뿐이다
 * (소득세법 §97①1호 · §114⑦ · 소득령 §176의2③ — 자산별 추계).
 *
 * UI 노출·API 전송·validate·엔진이 **모두** 이 함수를 단일 소스로 사용한다
 * (memory `feedback_ui_engine_dual_truth_avoidance`).
 */
export function isSeparateAcquisition(asset: SeparateAcquisitionFlags): boolean {
  if (!asset.hasSeperateLandAcquisitionDate) return false;
  if (!asset.landAcquisitionDate || !asset.acquisitionDate) return false;
  if (asset.landAcquisitionDate === asset.acquisitionDate) return false;
  // 겸용주택은 4부분 안분(transfer-tax-mixed-use.ts)이 별도 축을 지배 — 범위 밖.
  if (asset.assetKind === "housing" && asset.isMixedUseHouse) return false;
  return true;
}
