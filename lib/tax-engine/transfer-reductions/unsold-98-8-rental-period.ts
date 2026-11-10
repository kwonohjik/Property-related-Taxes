/**
 * §98의8① 5년 이상 임대 판정 — 조특령 §98의7⑤(→ 조특령 §98의5⑤ 준용), 법 §98의8① 괄호
 *
 * §98의6 2호 임대기간(`unsold-98-6.ts` `evaluate986RentalPeriod`, 2단계 K #3078)과 같은 규칙을 §98의8 원문으로 확인해 옮겼다.
 * 기산일·공실 구간·만 개월 계산은 `unsold-98-6-rental-period.ts`의 공용 헬퍼를 그대로 쓴다(재정의 금지).
 *
 * 원문 대조(KoreanLaw MST 288915·284389, 2026-11-10 실독):
 * - 령 §98의7⑤ 「임대기간은 제98조의5제5항을 준용하여 계산한다」 → 령 §98의5⑤1호 「…사업자등록과 …임대사업자등록을 하거나 …공공주택사업자로
 *   지정된 후 임대를 개시하는 날부터 기산할 것」(초일 산입·등록 후 기산), 2호 상속 합산 — §98의6과 문언이 같다.
 * - 법 §98의8① 괄호 「거주자가 …사업자등록과 …임대사업자등록을 하고 2015년 12월 31일 이전에 임대계약을 체결한 경우로 한정한다」 —
 *   §98의6①2호 괄호(2011년 12월 31일)와 구조가 같고 기한 연도만 다르다. §98의6에서 사용자가 정한(2026-11-09) 「등록도 기한까지」 해석을
 *   §98의8에도 같은 방식으로 적용했다 — 해석례 없음, §98의8 자체에 대한 사용자 결정은 **확인 필요**.
 * - §98의6과 다른 점: §98의8은 1호·2호 구분이 없다(임대가 곧 요건 — 5년 이상 임대 단일 경로). 공실 3월 이내 산입 규정은 령 §98의5⑤에 없다.
 */

import { TRANSFER, TRANSFER_REDUCTION_ARTICLE } from "../legal-codes/transfer";
import { UNSOLD_98_DECREE } from "../legal-codes/transfer-house";
import {
  unsold986RentalBasisDate,
  unsold986RentalMonthsExcludingVacancy,
} from "./unsold-98-6-rental-period";
import type { Unsold986VacancyDates } from "./unsold-98-6-rental-period";
import type { Unsold986RentalPeriodEcho } from "./unsold-hybrid";

/** 법 §98의8① 괄호 — 임대계약 체결(및 등록) 시한 (UTC 자정, T suffix 금지) */
export const UNSOLD_98_8_RENTAL_CONTRACT_TO = new Date("2015-12-31");
/** 임대 의무기간 (5년 = 60개월) */
export const UNSOLD_98_8_RENTAL_MONTHS = 60;

export type Unsold988RentalReasonCode =
  | "MISSING_RENTAL_START"
  | "MISSING_RENTAL_REGISTRATION"
  | "RENTAL_DATE_ORDER"
  | "RENTAL_VACANCY_ORDER"
  | "INVALID_INHERITED_RENTAL_MONTHS"
  | "REGISTRATION_AFTER_DEADLINE"
  | "RENTAL_PERIOD_SHORT";

export interface Unsold988RentalReason {
  code: Unsold988RentalReasonCode;
  message: string;
  legalBasis: string;
}

export interface Unsold988RentalInput {
  transferDate: Date;
  rentalContractDate?: Date;
  rentalStartDate?: Date;
  rentalEndDate?: Date;
  businessRegistrationDate?: Date;
  rentalRegistrationDate?: Date;
  rentalVacancies?: readonly Unsold986VacancyDates[];
  inheritedRentalMonths?: number;
}

/**
 * 일자 모순·미입력은 사유로 막고(조용히 보정하지 않는다), 임대종료일이 양도일을 넘는 경우만 양도일로 자른다(화면 ⑧은 차단).
 * 등록 기한 위반은 임대기간 계산을 막지 않는다 — 5년 사유와 함께 낸다.
 */
export function evaluateUnsold988Rental(input: Unsold988RentalInput): {
  reasons: Unsold988RentalReason[];
  rentalMonths: number;
  echo?: Unsold986RentalPeriodEcho;
} {
  const out: Unsold988RentalReason[] = [];
  const basis = UNSOLD_98_DECREE.D98_8_RENTAL_PERIOD;
  const t = (d: Date) => d.getTime();
  const inherited = input.inheritedRentalMonths ?? 0;

  if (!input.rentalStartDate) {
    out.push({
      code: "MISSING_RENTAL_START",
      message: `실제 임대개시일이 입력되지 않았습니다 (사업자등록과 임대사업자등록 후 임대를 개시하는 날부터 기산 — ${basis}, ${TRANSFER.UNSOLD_98_6_DECREE_RENTAL_PERIOD}1호 준용).`,
      legalBasis: basis,
    });
  }
  if (!input.businessRegistrationDate || !input.rentalRegistrationDate) {
    out.push({
      code: "MISSING_RENTAL_REGISTRATION",
      message: `사업자등록일·임대사업자등록일이 입력되지 않았습니다 (법 §98의8① 괄호 — 사업자등록과 임대사업자등록, 기산일은 ${basis}).`,
      legalBasis: basis,
    });
  }
  if (!input.rentalStartDate || !input.businessRegistrationDate || !input.rentalRegistrationDate) {
    return { reasons: out, rentalMonths: 0 };
  }

  const start = input.rentalStartDate;
  const deadlineReasons: Unsold988RentalReason[] = [];
  const lateRegistrations = [
    t(input.businessRegistrationDate) > t(UNSOLD_98_8_RENTAL_CONTRACT_TO) ? "사업자등록" : undefined,
    t(input.rentalRegistrationDate) > t(UNSOLD_98_8_RENTAL_CONTRACT_TO) ? "임대사업자등록" : undefined,
  ].filter((x): x is string => x !== undefined);
  if (lateRegistrations.length > 0) {
    deadlineReasons.push({
      code: "REGISTRATION_AFTER_DEADLINE",
      message: `${lateRegistrations.join("·")}이 2016.1.1. 이후에 이뤄졌습니다 — 법 §98의8① 괄호는 「사업자등록과 임대사업자등록을 하고 2015년 12월 31일 이전에 임대계약을 체결한 경우로 한정」한다고 정합니다. 등록도 2015.12.31.까지(2016.1.1. 이후 등록은 부적격) 해야 하는 것으로 처리했습니다 (§98의6①2호 사용자 결정 준용 — 해석례 없음, 확인 필요).`,
      legalBasis: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_8,
    });
  }
  if (input.rentalContractDate && t(input.rentalContractDate) > t(start)) {
    out.push({
      code: "RENTAL_DATE_ORDER",
      message: "임대계약 체결일이 실제 임대개시일보다 늦습니다 — 임대계약 체결일 ≤ 임대개시일이어야 합니다 (법 §98의8①).",
      legalBasis: TRANSFER_REDUCTION_ARTICLE.UNSOLD_98_8,
    });
  }
  if (input.rentalEndDate && t(input.rentalEndDate) < t(start)) {
    out.push({
      code: "RENTAL_DATE_ORDER",
      message: `임대종료일이 실제 임대개시일보다 앞섭니다 — 임대개시일 ≤ 임대종료일이어야 합니다 (${basis}).`,
      legalBasis: basis,
    });
  }
  const vacancies = input.rentalVacancies ?? [];
  if (vacancies.some((v) => t(v.endDate) < t(v.startDate))) {
    out.push({ code: "RENTAL_VACANCY_ORDER", message: "공실 구간의 종료일이 시작일보다 앞섭니다.", legalBasis: basis });
  }
  if (!Number.isInteger(inherited) || inherited < 0) {
    out.push({
      code: "INVALID_INHERITED_RENTAL_MONTHS",
      message: `상속 합산 임대기간(개월)은 0 이상의 정수여야 합니다 (${TRANSFER.UNSOLD_98_6_DECREE_RENTAL_PERIOD}2호 준용).`,
      legalBasis: basis,
    });
  }
  if (out.length > 0) return { reasons: [...out, ...deadlineReasons], rentalMonths: 0 };

  const basisDate = unsold986RentalBasisDate(start, input.businessRegistrationDate, input.rentalRegistrationDate);
  const rentalEnd = input.rentalEndDate && t(input.rentalEndDate) < t(input.transferDate) ? input.rentalEndDate : input.transferDate;
  const ownMonths = unsold986RentalMonthsExcludingVacancy(basisDate, rentalEnd, vacancies);
  const rentalMonths = ownMonths + inherited;
  const echo: Unsold986RentalPeriodEcho = {
    basisDate: basisDate.toISOString().slice(0, 10),
    rentalMonths,
    vacancyMonths: Math.max(0, unsold986RentalMonthsExcludingVacancy(basisDate, rentalEnd, []) - ownMonths),
    inheritedMonths: inherited,
  };
  if (rentalMonths < UNSOLD_98_8_RENTAL_MONTHS) {
    const vacancyNote = vacancies.length > 0 ? ", 공실 구간 제외" : "";
    out.push({
      code: "RENTAL_PERIOD_SHORT",
      message: `임대기간이 5년(60개월) 미만입니다 (인정 임대기간 ${rentalMonths}개월 — 등록 후 임대를 개시한 날(초일 산입)부터 기산${vacancyNote}${inherited ? `, 피상속인 ${inherited}개월 합산` : ""}).`,
      legalBasis: basis,
    });
  }
  return { reasons: [...out, ...deadlineReasons], rentalMonths, echo };
}
