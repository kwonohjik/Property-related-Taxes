/**
 * 실가 입력 방식(양도·취득)의 **유효값** — ④ API 변환과 ⑤ Step2 가 같은 술어를 쓴다(3중 패턴).
 *
 * 분할 모드(`lotsMode === "split"`)에서는 lot 별 1주당 단가가 정본이라 「합계 직접 입력」이
 * 성립하지 않는다. 그런데 폼 기본값은 둘 다 `"total"` 이고(`calc-wizard-stock-form.ts`),
 * Step2 는 분할 모드에서 그 라디오를 바꿀 수 없다. 저장된 값을 그대로 쓰면 Zod 분할 방어선이
 * 거부해 결과가 「Validation failed」로 끝났다(계획서 `stock-split-lots-ui-bugfix.plan.md` D-4).
 *
 * ⇒ 폼에 저장된 값이 아니라 `lotsMode` 에서 **파생**한다. 토글 시점에 값을 바꿔 저장하는 방식은
 *    이미 `split + total` 로 저장된 이력을 복원하면 다시 깨지므로 쓰지 않는다.
 * ⑧ validate 는 분할 모드에서 입력 방식을 보지 않으므로(`validate-step2` 조기 반환) 이 술어가 필요 없다.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

type InputModeSlice = Pick<
  StockTransferFormData,
  "lotsMode" | "transferActualInputMode" | "acquisitionActualInputMode"
>;

export function isSplitLotsMode(form: Pick<StockTransferFormData, "lotsMode">): boolean {
  return form.lotsMode === "split";
}

/** 양도가액 실가 입력 방식 — 분할이면 1주당 단가 고정, 아니면 3중 패턴 default "total" */
export function effectiveTransferActualInputMode(
  form: InputModeSlice,
): NonNullable<StockTransferFormData["transferActualInputMode"]> {
  if (isSplitLotsMode(form)) return "per_share";
  return form.transferActualInputMode || "total";
}

/** 취득가액 실가 입력 방식 — 분할이면 1주당 단가 고정, 아니면 구 이력 부재값 fallback "per_share" */
export function effectiveAcquisitionActualInputMode(
  form: InputModeSlice,
): NonNullable<StockTransferFormData["acquisitionActualInputMode"]> {
  if (isSplitLotsMode(form)) return "per_share";
  return form.acquisitionActualInputMode || "per_share";
}
