/**
 * 일반건물 **건물 파트** 이월과세(§97의2) × **증여자가 신축·증축한 건물**(소득세법 §114조의2) 입력 축의 **적용 범위** 단일 소스 (PR-5a).
 *
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §3.2
 *
 * ⑤(토글 노출)·④(전송)·⑧(필수 검증)이 같은 술어를 읽는다(3중 패턴). 엔진 `assertDonorBuiltInput`(`general_building_unit`)·⑫ `refineGbBuildingDonorBuilt`가
 * 거부하는 조합을 UI에서 미리 비노출로 만든 것이다:
 *   · 건물 취득원인이 이월과세 · 부담부증여 아님(§159 경로가 취득가액을 정한다 — 5c 범위)
 *   · 증여자 취득가액을 «환산취득가액(일반 기준시가 환산)»으로 계산할 때만 — 실지거래가액 승계에는 가산세 대상이 아니다
 *   · 증축(3-way) 일반건물 제외 — 증축분 카드의 이월과세·증여자 증축 base 가 별도 설계 대상이다
 * 토지 파트는 대상이 아니다(건물분만, D4) — 이 술어는 건물 파트 전용이다.
 * 자산 전체 이월과세의 `donorBuiltApplicable`(`donor-built-scope.ts`, 주택·비주택 건물)과 상호배타다(저쪽은 `general_building`을 제외한다).
 *
 * 이 파일은 **leaf**다 — ④ `transfer-tax-api-gb-carryover.ts`가 import 하므로 그 파일을 import 하지 않는다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/**
 * 건물 파트 이월과세 서브폼 — ④ `buildGbCarryoverPayload`가 건물 파트에 쓰는 원천(`asset.buildingCarryover ?? 사건 출처`)과 같다.
 * 건물 카드의 편집은 `buildingCarryover`로 가고(`GbBuildingCarryoverCard`), 없으면 토지 블록 값을 그대로 쓴다.
 * 건물 블록(`CarryoverGiftBlock part="building"`)에 넘기는 합성 asset(`carryover: buildingCarryover ?? carryover`)에서도 같은 값을 돌려준다.
 */
export function gbBuildingCarryoverForm(asset: AssetForm | undefined): CarryoverTaxationForm | undefined {
  return asset?.buildingCarryover ?? asset?.carryover;
}

/** 이 일반건물의 건물 파트에서 «증여자 신축·증축» 질문을 묻는가 — ⑤ 노출 · ④ 전송 · ⑧ 요구가 이 하나를 읽는다. */
export function donorBuiltGbApplicable(asset: AssetForm | undefined): boolean {
  if (!asset || asset.assetKind !== "general_building") return false;
  if (asset.gbBuildingAcquisitionCause !== "carryover_gift") return false;
  if (asset.transferType === "burdened_gift") return false;
  if (asset.gbHasExtension === true) return false;
  const f = gbBuildingCarryoverForm(asset);
  return f?.useEstimatedAcquisition === true && f.estimationMode === "general";
}

/** 토글이 켜져 **계산에 실리는가** = 적용 범위 안 + 토글 ON. stale(범위 밖에서 켜 둔 값)은 false. */
export function donorBuiltGbActive(asset: AssetForm | undefined): boolean {
  return donorBuiltGbApplicable(asset) && gbBuildingCarryoverForm(asset)?.donorBuilt === true;
}
