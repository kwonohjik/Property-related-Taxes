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
