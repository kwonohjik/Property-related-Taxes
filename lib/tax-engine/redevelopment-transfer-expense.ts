/**
 * 재개발·재건축(§166) 양도비의 인가 전·후 안분.
 *
 * 「소득세법 시행령」 §166①은 인가 전·후 산식 모두에 「소득세법」 §97①3호 필요경비 항을 두지만, 양도비를 나누는 비율은 정하지 않았다.
 * 전액 인가 후로 넣으면 인가 전 분 양도차익이 그만큼 커져 그 분의 장기보유특별공제가 과다해지므로 평가액 : (양도가액 − 평가액)으로 나눈다.
 * 이 비율은 사용자 결정이고 정면 해석례는 확보하지 못했다(계획서 `docs/02-design/features/redev-total-transfer-expense.plan.md` Q-2).
 *
 * - 인가 전 몫은 `preApprovalExpenses`에 더한다. 환산이면 §166①의 택일(「§97①2·3호 또는 §163⑥」)로 개산공제가 쓰여 공제되지 않는다(`preApprovalNecessaryExpense`).
 * - 승계조합원은 인가 전 분이 없고, 청산금 수령분 단독 신고는 인가 전·후 구분 없이 종전 부동산의 필요경비로 합쳐지므로 인가 후 칸에 그대로 둔다.
 * - 양도가액이 평가액 이하면 인가 후 몫이 없어 전액 인가 전 분이다.
 */
import { safeMultiplyThenDivide } from "./tax-utils";
import type { RedevelopmentInfo } from "./types/transfer-redevelopment.types";

export function apportionRedevTransferExpense(info: RedevelopmentInfo, transferPrice: number): RedevelopmentInfo {
  const expense = info.transferExpense ?? 0;
  if (expense <= 0) return info;
  const noPreApprovalPart =
    info.isSuccessorMember === true ||
    (info.subject === "apt" && info.settlementDirection === "receive" && info.receiveOnlyMode === true);
  const preShare = noPreApprovalPart
    ? 0
    : transferPrice > info.rightsValue
      ? safeMultiplyThenDivide(expense, info.rightsValue, transferPrice)
      : expense;
  return {
    ...info,
    transferExpense: undefined,
    preApprovalExpenses: info.preApprovalExpenses + preShare,
    postApprovalExpenses: (info.postApprovalExpenses ?? 0) + (expense - preShare),
  };
}
