/**
 * 의제취득일(1985.1.1.) 전 «매수» — 영 §176조의2④ 입력 슬라이스 (AssetForm이 extends)
 * 계획서: docs/02-design/features/realestate-pre-deemed-purchase-176-2-4.plan.md §4.2 (Q-1 B · Q-2 a · Q-7)
 *
 * 취득일 칸은 1985.1.1. 전 매매 입력을 의제취득일로 덮어쓴다(`CompanionAcqDateSection`) — 덮어쓰기는 그대로 두고
 * 원 입력을 여기 보존한다. 엔진 입력 `preDeemedPurchase`로 간다(`lib/calc/transfer-pre-deemed-purchase-form.ts`).
 */
export interface PreDeemedPurchaseFormSlice {
  /** 실제 취득일 "YYYY-MM-DD" — 덮어쓸 때 자동 보존 · 카드에서 확인·수정 */
  preDeemedOriginalAcquisitionDate: string;
  /** 환산·감정·매매사례 모드에서 함께 견줄 취득 당시 실지거래가액(선택) — 실가 모드는 취득가액 칸이 기준 */
  preDeemedActualPrice: string;
  /** 1965.01. 전 취득 — 물가상승 배율(소수) 직접 입력 */
  preDeemedPpiRatio: string;
}

export const PRE_DEEMED_PURCHASE_DEFAULTS: PreDeemedPurchaseFormSlice = {
  preDeemedOriginalAcquisitionDate: "",
  preDeemedActualPrice: "",
  preDeemedPpiRatio: "",
};

/** sessionStorage·이력에서 누락된 필드를 기본값으로 채운다 */
export function migratePreDeemedPurchaseFields(a: Record<string, unknown>): void {
  if (typeof a.preDeemedOriginalAcquisitionDate !== "string") a.preDeemedOriginalAcquisitionDate = "";
  if (typeof a.preDeemedActualPrice !== "string") a.preDeemedActualPrice = "";
  if (typeof a.preDeemedPpiRatio !== "string") a.preDeemedPpiRatio = "";
}
