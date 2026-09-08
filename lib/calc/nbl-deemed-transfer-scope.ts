/**
 * 양도일 의제(§168의14②) 입력 적용 범위 — **⑤ 렌더 게이트와 ⑧ 검증이 공유하는 단일 술어**.
 *
 * 🔴 신설 이유 (R11): ⑤ `NblSectionContainer.tsx`는 `nblLandType !== "housing_site"`로
 *    `DeemedTransferSection`을 게이트하는데, ⑧ `transfer-tax-validate-nbl.ts`의
 *    「사유를 골랐으면 의제일 필수」 차단은 **지목을 보지 않았다**. 사유를 고른 뒤 지목을
 *    주택부수토지로 바꾸면 섹션은 사라지고 사유 값은 남아, **화면에 없는 칸을 요구하며
 *    계산이 영구 차단**됐다(지목 변경 시 리셋 패치도 없다).
 *
 * 주택부수토지가 제외되는 이유는 법령 구조다 — §168의6의 **기간기준**이 적용되지 않으므로
 * 「양도일 의제」로 기간을 앞당길 대상 자체가 아니다.
 *
 * 게이트를 한 곳에서만 바꾸면 같은 병이 재발한다
 * (`feedback_ui_gate_two_conditions_downstream_one`).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 양도일 의제 입력(사유·의제일)이 적용되는 지목인가 — 기간기준 5지목. */
export function isDeemedTransferApplicable(
  nblLandType: AssetForm["nblLandType"] | undefined,
): boolean {
  return !!nblLandType && nblLandType !== "housing_site";
}

/** 그 자산이 실제로 의제 사유를 선택한 상태인가 (「none」·미선택 제외). */
export function hasDeemedTransferReason(asset: AssetForm): boolean {
  return !!asset.nblDeemedTransferReason && asset.nblDeemedTransferReason !== "none";
}

/** ⑧이 의제일을 요구해야 하는가 — 적용 지목 + 사유 선택이 **둘 다** 성립할 때만. */
export function requiresDeemedTransferDate(asset: AssetForm): boolean {
  return isDeemedTransferApplicable(asset.nblLandType) && hasDeemedTransferReason(asset);
}
