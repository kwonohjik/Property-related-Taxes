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

/**
 * 부담부증여면 상업용건물·오피스텔 「환산취득가 사용」 토글(`useEstimatedAcquisition`)과 cb* 칸을 읽지 않는다
 * (계획서 `bg-stale-acq-mode-flags.plan.md` V-2 · 사용자 결정 2026-11-12 a).
 *
 * 부담부증여 취득가액은 `bgAcquisitionMethod`(K-4 실지·K-5 환산은 부담부증여 카드의 기준시가 두 칸)가 정한다.
 * 토글을 켜도 세액은 같고(실측: 시가·기준시가 × 실지·K-5 모두), 켜 두면 ⑧이 전용면적 등 쓰이지 않는 칸을 요구했다.
 * ⑤(토글 숨김)·⑧(검증 생략)·④(환산 객체·플래그 미전송)가 이 술어를 함께 쓴다. 저장값은 지우지 않는다 — 일반 양도로 되돌리면 그대로 보인다.
 */
export function bgIgnoresCommercialEstimated(asset: Pick<AssetForm, "transferType" | "assetKind">): boolean {
  return asset.assetKind === "commercial_building" && asset.transferType === "burdened_gift";
}

export function bgIgnoresAssetAppraisalSalesCase(asset: Pick<AssetForm, "transferType">): boolean {
  return asset.transferType === "burdened_gift";
}

/**
 * 부담부증여면 자산 단위 감정가액·매매사례가액 플래그를 끈 사본 — 플래그로 파트 취득 방식을 파생하는 leaf(`effectivePartAcqMode`)용.
 * 분리 검증(`transfer-tax-validate-split.ts`)이 원본을 읽어 소유자 분리 기준시가(V8)를 요구했다 — 깨끗하면 ⑧ 통과 · 서버 200인데
 * 숨은 플래그만으로 ⑧이 막혔다(V-5 실측 2026-11-12: 시가 모드 · 소유자 분리 · 파트 취득가액 직접 입력 · 양도차익 210,000,000 불변).
 * 플래그가 없거나 부담부증여가 아니면 원본을 그대로 돌려준다.
 */
export function withoutBgHiddenAcqFlags<T extends Pick<AssetForm, "transferType" | "isAppraisalAcquisition" | "isSalesCaseAcquisition">>(asset: T): T {
  if (!bgIgnoresAssetAppraisalSalesCase(asset) || (!asset.isAppraisalAcquisition && !asset.isSalesCaseAcquisition)) return asset;
  return { ...asset, isAppraisalAcquisition: false, isSalesCaseAcquisition: false };
}
