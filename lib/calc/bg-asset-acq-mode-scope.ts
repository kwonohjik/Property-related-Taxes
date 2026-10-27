/**
 * 부담부증여면 자산 단위 감정가액·매매사례가액 플래그(`isAppraisalAcquisition`·`isSalesCaseAcquisition`)를 읽지 않는다
 * (계획서 `docs/02-design/features/bg-stale-acq-mode-flags.plan.md` — Q-1 (b) · Q-2 (a)).
 *
 * 부담부증여 취득가액은 `bgAcquisitionMethod`가 정한다. 자산 단위 산정 방식 라디오·감정가액·매매사례가액 칸은 부담부증여 화면에 없다
 * (`CompanionAcqPurchaseBlock`의 `transferType !== "burdened_gift"` 게이트). 매매에서 고른 플래그가 양도 유형 전환 뒤 남으면
 * ⑫(감정가액 필수)·⑧(매매사례가액 필수)이 칸 없는 값을 요구했다. 세액에는 닿지 않는다(실측).
 * 저장값은 지우지 않는다 — 양도 유형을 일반으로 되돌리면 매매 카드에 그대로 보인다(`TransferModeBlock` 「보존해 재토글 시 복원」).
 * 환산(`useEstimatedAcquisition`)은 막지 않아 범위 밖이다(Q-2).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function bgIgnoresAssetAppraisalSalesCase(asset: Pick<AssetForm, "transferType">): boolean {
  return asset.transferType === "burdened_gift";
}
