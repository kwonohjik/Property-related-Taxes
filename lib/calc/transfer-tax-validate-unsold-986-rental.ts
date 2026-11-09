/**
 * §98의6 2호 임대기간 입력 검증 (⑧) — US-24·US-25·US-60 (그룹 K, 2026-11-09)
 *
 * `transfer-tax-validate-reductions.ts` 블록의 연장. ④(`toVacancyPeriods986`·`toInheritedMonths986`)·엔진
 * (`evaluate986RentalPeriod`)과 같은 규칙을 본다 — UI 통과↔validate 차단 모순 금지.
 */

import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { ValidationIssue } from "./transfer-tax-validate";
import { fieldError } from "./transfer-tax-validate-field";

type R986 = Extract<AssetReductionForm, { type: "unsold_98_6" }>;

/** 상속 합산 개월 칸이 0 이상의 정수 문자열인가 */
export const isWholeMonthsText = (v: string | undefined): boolean => /^\d+$/.test((v ?? "").trim());

export function unsold986RentalIssue(args: {
  fail: (message: string) => ValidationIssue;
  r: R986;
  form: TransferFormData;
}): ValidationIssue | null {
  const { fail, r, form } = args;
  if (!r.rentalContractDate986)
    return fail(fieldError("reduction.unsold_98_6.rentalContractDate986", "§98의6 2호 적용: 임대계약 체결일을 입력하세요 (2011.12.31 이전 한정)."));
  if (!r.rentalStartDate986)
    return fail(fieldError("reduction.unsold_98_6.rentalStartDate986", "§98의6 2호 적용: 임대개시일을 입력하세요 (실제로 임대를 개시한 날 — 기산일은 등록일과 비교해 늦은 날)."));
  if (!r.businessRegistrationDate986)
    return fail(fieldError("reduction.unsold_98_6.businessRegistrationDate986", "§98의6 2호 적용: 사업자등록일을 입력하세요 (소득세법 §168 — 임대기간은 등록 후 임대를 개시하는 날부터 기산, 조특령 §98의5⑤1호)."));
  if (!r.rentalRegistrationDate986)
    return fail(fieldError("reduction.unsold_98_6.rentalRegistrationDate986", "§98의6 2호 적용: 임대사업자등록일을 입력하세요 (민간임대주택법 §5 — 임대기간은 등록 후 임대를 개시하는 날부터 기산, 조특령 §98의5⑤1호)."));

  // 모순된 임대 일자(US-25) — ISO 날짜 문자열은 사전순 = 시간순
  if (r.rentalContractDate986 > r.rentalStartDate986)
    return fail(fieldError("reduction.unsold_98_6.rentalContractDate986", "§98의6 2호: 임대계약 체결일이 임대개시일보다 늦습니다. 임대계약 체결일 ≤ 임대개시일이어야 합니다."));
  if (r.rentalEndDate986 && r.rentalEndDate986 < r.rentalStartDate986)
    return fail(fieldError("reduction.unsold_98_6.rentalEndDate986", "§98의6 2호: 임대종료일이 임대개시일보다 앞섭니다. 임대개시일 ≤ 임대종료일이어야 합니다."));
  if (r.rentalEndDate986 && form.transferDate && r.rentalEndDate986 > form.transferDate)
    return fail(fieldError("reduction.unsold_98_6.rentalEndDate986", "§98의6 2호: 임대종료일이 양도일보다 늦습니다. 양도 후의 임대는 양도인의 임대기간이 아니므로 양도일 이전으로 입력하세요 (비우면 양도일까지)."));

  // 공실 구간(US-24)
  const vacancies = r.rentalVacancyPeriods986 ?? [];
  if (vacancies.some((v) => !v.startDate || !v.endDate))
    return fail(fieldError("reduction.unsold_98_6.rentalVacancyPeriods986", "§98의6 2호 적용: 공실 구간의 시작일·종료일을 모두 입력하세요. 해당 없으면 구간을 삭제하세요."));
  if (vacancies.some((v) => v.endDate < v.startDate))
    return fail(fieldError("reduction.unsold_98_6.rentalVacancyPeriods986", "§98의6 2호: 공실 구간의 종료일이 시작일보다 앞섭니다."));

  // 상속 합산 개월(US-25) — 소수·음수·문자는 ④가 싣지 못하므로 여기서 막는다
  const inherited = (r.inheritedRentalMonths986 ?? "").trim();
  if (inherited !== "" && !isWholeMonthsText(inherited))
    return fail(fieldError("reduction.unsold_98_6.inheritedRentalMonths986", "§98의6 2호: 상속 합산 임대기간(피상속인)은 0 이상의 정수 개월로 입력하세요. 소수 개월은 받지 않습니다."));
  return null;
}
