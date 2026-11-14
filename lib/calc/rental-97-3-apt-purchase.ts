/**
 * §97의3 G-1 질문(종전 §97의3① 괄호 — 2020.7.11. 이후 등록 신청 아파트 매입임대)의 폼 단위 판정 — ④ ⑤ ⑧ 공용.
 * 구간 규칙은 엔진 leaf `aptPurchase973QuestionApplies` 하나다. 여기는 폼 값을 그 leaf 입력으로 옮길 뿐이다.
 */
import { aptPurchase973QuestionApplies } from "@/lib/tax-engine/transfer-reductions/rental-97-3-apt-purchase-exclusion";
import { rental973LongRegistrationDate } from "./transfer-tax-validate-rental-conversion";

type Rental973AptPurchaseFacts = Parameters<typeof rental973LongRegistrationDate>[0];

/** 질문을 보이고 답을 요구할지 — 변경신고(「before」·「after」) 주택은 묻지 않는다(Q-2). */
export function rental973AptPurchaseQuestionApplies(r: Rental973AptPurchaseFacts): boolean {
  return aptPurchase973QuestionApplies({
    longRegistrationDate: rental973LongRegistrationDate(r),
    isShortTermConversion: (r.shortTermConversionMode ?? "none") !== "none",
  });
}
