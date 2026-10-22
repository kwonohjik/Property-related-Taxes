/**
 * split 건물 파트 이월과세(P6) × **증여자가 신축·증축한 건물**(소득세법 §114조의2)의 **적용 범위** 단일 소스 (PR-3).
 *
 * 계획서: docs/00-pm/carryover-donor-built-114-2.plan.md (PR-3)
 *
 * 자산 전체 이월과세의 `donorBuiltApplicable`(`donor-built-scope.ts`)과 **짝**이다 — 저쪽은 파트 이월과세·분리 계산을 제외하고, 이쪽은 그 제외된 칸을 맡는다.
 * 둘은 상호배타다(저쪽은 `partCarryover` 가 거짓일 때만, 이쪽은 참일 때만).
 *
 * ⑤(토글 노출)·④(전송)·⑧(필수 검증)이 같은 술어를 읽는다(3중 패턴). 엔진 `assertDonorBuiltPartInput`·⑫ `refineSplitDonorBuilt`가 거부하는 조합을 UI에서 미리 비노출로 만든 것이다:
 *   · 건물 파트가 «환산취득가액»일 때만(`partDonorEstimated` — 실가 승계에는 가산세 대상이 아니다) · 토지 파트는 대상이 아니다(건물분만, D4)
 *   · 주택·건물만 · 겸용주택·개별주택가격 미공시 환산 제외 (부담부증여는 `partCarryover`가 이미 파트 이월과세로 보지 않는다)
 * 이 파일은 **leaf**다 — `donor-built-scope.ts`는 `transfer-tax-api-split`을 import하므로 ④ 분리 이월과세 변환(`transfer-tax-api-split-carryover.ts`)이 읽으면 순환한다.
 * 일체 주택 안분은 필요 없다(파트별 기준시가가 이미 토지·건물로 나뉘어 있다).
 */
import { partDonorEstimated } from "./transfer-land-part-cause";
import { phdPayloadActive } from "./phd-toggle-scope";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export interface DonorBuiltPartOpts {
  /** 함께 양도하는 두 번째 이후 자산 — 파트 이월과세 호스트가 아니다(엔진 S0) */
  isNonPrimary?: boolean;
}

/** 이 자산의 건물 파트에서 «증여자 신축·증축» 질문을 묻는가 — ⑤ 노출 · ④ 전송 · ⑧ 요구가 이 하나를 읽는다. */
export function donorBuiltPartApplicable(asset: AssetForm | undefined, opts: DonorBuiltPartOpts = {}): boolean {
  if (!asset?.carryover || asset.acquisitionCause !== "carryover_gift") return false;
  if (asset.assetKind !== "housing" && asset.assetKind !== "building") return false;
  if (asset.assetKind === "housing" && asset.isMixedUseHouse === true) return false;
  if (phdPayloadActive(asset)) return false;
  return partDonorEstimated(asset, opts).building;
}

/** 토글이 켜져 **계산에 실리는가** = 적용 범위 안 + 토글 ON. stale(범위 밖에서 켜 둔 값)은 false. */
export function donorBuiltPartActive(asset: AssetForm | undefined, opts: DonorBuiltPartOpts = {}): boolean {
  return donorBuiltPartApplicable(asset, opts) && asset?.carryover?.donorBuilt === true;
}
