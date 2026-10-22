/**
 * 화면에 보이는 양도비만 계산에 쓴다 — 폼-수준 「총 양도비」와 자산 카드 ④ 「양도비」는 배타다 (O-9).
 *
 * 계획서 `docs/00-pm/burdened-gift-residuals-o9-o11.plan.md` §5 (Q-1 기본안 「화면을 따른다」).
 *
 * - **총 양도비**는 자산이 2건 이상일 때만 화면에 있다(Step1). 「함께 양도」를 끄거나 세션 복원으로 단건이 되면 칸이 사라지는데
 *   값은 남았고, 단건 ④가 그 값을 필요경비로 썼다(실측: 숨은 1천만 → 필요경비 1천만).
 * - **자산 양도비**는 총 양도비가 쓰이면 칸이 꺼진다(`AssetSectionExpense`). 꺼지기 전 값이 남으면 그 자산 몫의 공통 양도비를
 *   **대체**했다(실측: 총 1천만 · 숨은 300만 → 그 자산 300만 · Σ 800만).
 *
 * ④(단건·다건 계산기)·⑥은 입구에서 `withInScopeTransferExpenses(form)`을 한 번 거친다 — 자산 양도비를 읽는 곳이 많아(일반건물·재개발·겸용·추계 미리보기 등)
 * 지점마다 고치면 빠뜨린다. 화면(⑤)은 `formTotalTransferExpenseInScope`로 칸 노출·비활성을 같은 술어로 정한다.
 * ⑧은 바꾸지 않았다 — 두 값을 읽는 규칙은 파트 이월과세의 이전 형식 규칙(`transfer-tax-validate-split-carryover.ts`) 하나인데, 실측으로
 * 함께 양도에서는 첫 자산 파트 이월과세가 먼저 막히고 두 번째 자산이면 그 규칙이 나오지 않았다. ⑧에 이 값을 읽는 규칙을 더하면 이 leaf를 거칠 것.
 */
import { parseAmount } from "./number-parse";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

type ExpenseForm = Pick<TransferFormData, "assets" | "totalTransferExpense">;

/** 총 양도비 칸이 화면에 있는가 — 자산 2건 이상. */
export function formTotalTransferExpenseInScope(form: Pick<TransferFormData, "assets">): boolean {
  return (form.assets?.length ?? 0) > 1;
}

/** 계산에 쓰이는 총 양도비 — 칸이 없으면 0. */
export function appliedFormTotalTransferExpense(form: ExpenseForm): number {
  return formTotalTransferExpenseInScope(form) ? parseAmount(form.totalTransferExpense || "0") : 0;
}

/** 화면에 없는 총 양도비와 꺼진 자산 양도비를 비운 폼. 바꿀 것이 없으면 같은 객체를 돌려준다. */
export function withInScopeTransferExpenses<F extends ExpenseForm>(form: F): F {
  const entered = (v: string | undefined) => parseAmount(v || "0") > 0;
  const dropTotal = !formTotalTransferExpenseInScope(form) && entered(form.totalTransferExpense);
  const dropAsset = appliedFormTotalTransferExpense(form) > 0 && form.assets.some((a) => entered(a.transferExpense));
  if (!dropTotal && !dropAsset) return form;
  return {
    ...form,
    ...(dropTotal ? { totalTransferExpense: "" } : {}),
    ...(dropAsset ? { assets: form.assets.map((a) => (entered(a.transferExpense) ? { ...a, transferExpense: "" } : a)) } : {}),
  };
}
