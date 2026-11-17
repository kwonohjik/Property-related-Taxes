/**
 * 합산배제 추징 계산기 — §10③ 추징 배제 판정 + 추징세액·이자상당가산액 (종합부동산세법 §17⑤1호 · 시행령 §10)
 *
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-recapture-calculator.plan.md §5.2 · §7(Q-1~Q-12 확정)
 *
 * - §10① 금액(합산 대상으로 본 세액 − 제외하고 계산한 세액)은 계산하지 않는다 — 연도별 경감세액을 입력으로 받는다.
 * - 이자(§10②): `comprehensive-recapture-interest.ts` — 구간별 율·기산일 이월.
 * - §10③ 배제 시기(Q-5 · 2026-11-17 사용자 결정으로 V-5·V-6 닫음):
 *   1호 = 고지일 2020.2.11. 이후(부칙<제30404호> §5 「시행 이후 추징하는 분부터」).
 *   2·3호 = 고지일 2020.10.7. 이후(부칙<제31085호>에 §10 적용례 없음 — 1호 기준을 따른다).
 *   10·11호의 1호 = 경감받은 연도의 납세의무 성립일(6.1.)이 2025.6.4. 이후인 연도분(2026년분)부터
 *   (부칙<제35352호> §2②) — 그 전 연도분은 추징한다(`fromTaxYear`).
 * - 배제면 금액은 0(Q-7). 고지일이 2009.2.4. 전이면 던지지 않고 failReasons로 둔다(Q-6 — 거부는 Zod).
 * - 자동 안분·추정 없음: 입력에 없는 사실은 불성립 또는 「확인 필요」로 둔다.
 */

import { addMonths, addYears, parseISO, startOfDay } from "./utc-date";
import { COMPREHENSIVE_EXCL, COMPREHENSIVE_EXCL_CONST } from "./legal-codes";
import { mandatoryPeriod } from "./comprehensive-exclusion";
import { rentViolationApplies } from "./comprehensive-exclusion-rent-violation";
import { calculateRecaptureAnnualInterest } from "./comprehensive-recapture-interest";
import type {
  RecaptureExemptionInput,
  RecaptureExemptionResult,
  RecaptureInput,
  RecaptureResult,
} from "./types/comprehensive-recapture.types";

const C = COMPREHENSIVE_EXCL_CONST;
const X = COMPREHENSIVE_EXCL;

const T_1HO = parseISO(C.RECAPTURE_EXEMPT_1HO_START);
const T_23HO = parseISO(C.RECAPTURE_EXEMPT_23HO_START);
const T_6Y = parseISO(C.RECAPTURE_EXEMPT_6Y_START);
/** 10·11호 §10③1호를 적용하는 첫 과세연도 — 납세의무 성립일(6.1.)이 2025.6.4. 이후인 첫 해(= 2026) */
const FIRST_6Y_TAX_YEAR = (() => {
  const y = T_6Y.getUTCFullYear();
  return parseISO(`${y}-06-01`) >= T_6Y ? y : y + 1;
})();
const T_3HO_PROVISO_END = parseISO(C.RECAPTURE_EXEMPT_3HO_PROVISO_END);
const T_3HO_GA_FROM = parseISO(C.RECAPTURE_EXEMPT_3HO_GA_FROM);
const T_INTEREST_RULE = parseISO(C.RECAPTURE_INTEREST_RULE_START);

const NOT_EXEMPT = (failReasons: string[], notices: string[] = []): RecaptureExemptionResult => ({
  exempt: false,
  clause: null,
  legalBasis: null,
  fromTaxYear: null,
  failReasons,
  notices,
});

/** §10③1호 — 최소 임대의무기간이 지난 뒤 5% 요건을 충족하지 않게 된 경우 (대상: 제3조제1항 1·2·7·8·10·11호) */
function evaluate1ho(
  input: Extract<RecaptureExemptionInput, { reason: "rent_over_5pct" }>,
  noticeDate: Date,
): RecaptureExemptionResult {
  // §3⑧ 5% 위반 제외와 같은 호 집합이다(`rentViolationApplies`) — 3·4·5·6·9호는 5% 요건이 없다.
  if (!rentViolationApplies(input.registrationType)) return NOT_EXEMPT([X.RECAPTURE_EXEMPT_1HO_NOT_TARGET]);
  const is6y = input.registrationType.startsWith("private_short_term_6y");
  if (noticeDate < T_1HO) return NOT_EXEMPT([X.RECAPTURE_EXEMPT_1HO_NOT_IN_FORCE]);

  const notices: string[] = [X.RECAPTURE_NOTICE_1HO_BOUNDARY];
  const { years, applicationUnknown } = mandatoryPeriod({
    registrationType: input.registrationType,
    rentalApplicationDate: input.rentalApplicationDate,
    rentalRegistrationDate: input.rentalRegistrationDate,
  });
  if (applicationUnknown) notices.push(X.RECAPTURE_NOTICE_APPLICATION_UNKNOWN);

  // 「최소 임대의무기간이 지난 후」 — 기산일부터 N년이 만료된 날의 다음 날 이후(= 기산일 + N년 당일부터, V-4)
  const periodPassed = startOfDay(input.ceasedDate) >= addYears(startOfDay(input.rentalStartDate), years);
  if (!periodPassed) return NOT_EXEMPT([X.RECAPTURE_EXEMPT_1HO_PERIOD_NOT_MET], notices);
  return {
    exempt: true,
    clause: "10③1호",
    legalBasis: X.RECAPTURE_EXEMPT_RENT_5PCT,
    // 10·11호는 연도별 — 그 전 연도분은 `calculateRecapture`가 추징한다
    fromTaxYear: is6y ? FIRST_6Y_TAX_YEAR : null,
    failReasons: [],
    notices,
  };
}

/** §10③2호 — 민간임대주택법 §6①11호·⑤에 따른 등록 말소(대상 주택 한정은 그 조문에 있다 — Q-4) */
function evaluate2ho(
  input: Extract<RecaptureExemptionInput, { reason: "registration_cancelled" }>,
  noticeDate: Date,
): RecaptureExemptionResult {
  if (noticeDate < T_23HO) return NOT_EXEMPT([X.RECAPTURE_EXEMPT_23HO_NOT_IN_FORCE]);
  const notices = [X.RECAPTURE_NOTICE_2HO_TARGET_HOUSING];
  if (input.cancelClause === "other") return NOT_EXEMPT([X.RECAPTURE_EXEMPT_2HO_NOT_CLAUSE], notices);
  return {
    exempt: true,
    clause: "10③2호",
    legalBasis: X.RECAPTURE_EXEMPT_CANCELLATION,
    fromTaxYear: null,
    failReasons: [],
    notices,
  };
}

/** §10③3호 — 정비사업·리모델링으로 새로 취득한 주택 가목(2020.7.11. 이후 등록 신청)·나목(미등록) */
function evaluate3ho(
  input: Extract<RecaptureExemptionInput, { reason: "replacement_housing" }>,
  noticeDate: Date,
): RecaptureExemptionResult {
  if (noticeDate < T_23HO) return NOT_EXEMPT([X.RECAPTURE_EXEMPT_23HO_NOT_IN_FORCE]);
  const notices = [X.RECAPTURE_NOTICE_3HO_PROVISO_COUNT];
  const h = input.newHousing;
  // 단서 — 준공일부터 6개월이 되는 날이 2020.7.10. 이전이면 3호 제외(그 날 당일 포함)
  if (addMonths(startOfDay(h.completionDate), 6) <= T_3HO_PROVISO_END) {
    return NOT_EXEMPT([X.RECAPTURE_EXEMPT_3HO_BEFORE_PROVISO], notices);
  }
  const app = h.application;
  const isGa =
    !!app && app.kind !== "other" && startOfDay(app.date) >= T_3HO_GA_FROM;
  // 나목 — 아파트(당초가 단기민간임대면 모든 주택)이면서 임대사업자 등록을 하지 않았을 것
  const isNa = (h.isApartment || input.originalKind === "short_term") && !h.registeredAsRental;
  if (!isGa && !isNa) return NOT_EXEMPT([X.RECAPTURE_EXEMPT_3HO_NO_ITEM], notices);
  return {
    exempt: true,
    clause: isGa ? "10③3호 가목" : "10③3호 나목",
    legalBasis: X.RECAPTURE_EXEMPT_REPLACEMENT_HOUSING,
    fromTaxYear: null,
    failReasons: [],
    notices,
  };
}

/**
 * §10③ 추징 배제 판정 — 입력한 사유가 추징하지 않는 경우에 해당하는가.
 * `noticeDate`(고지일)로 시기를 가른다(Q-5).
 */
export function evaluateRecaptureExemption(
  exemption: RecaptureExemptionInput,
  noticeDate: Date,
): RecaptureExemptionResult {
  const notice = startOfDay(noticeDate);
  switch (exemption.reason) {
    case "rent_over_5pct":
      return evaluate1ho(exemption, notice);
    case "registration_cancelled":
      return evaluate2ho(exemption, notice);
    case "replacement_housing":
      return evaluate3ho(exemption, notice);
    case "other":
      return NOT_EXEMPT([]);
  }
}

/**
 * 합산배제 추징 계산 — §10③ 배제면 0 + 근거(Q-7), 아니면 연도별 경감세액 합계 + 이자상당가산액.
 */
export function calculateRecapture(input: RecaptureInput): RecaptureResult {
  const zero = {
    totalRecoveryTax: 0,
    interestAmount: 0,
    totalPayable: 0,
    recoveryPeriodYears: 0,
    annualInterest: [],
  };

  if (startOfDay(input.noticeDate) < T_INTEREST_RULE) {
    return {
      ...zero,
      calculated: false,
      exempt: false,
      exemption: NOT_EXEMPT([]),
      exemptTaxYears: [],
      failReasons: [X.RECAPTURE_NOTICE_BEFORE_INTEREST_RULE],
      notices: [],
    };
  }

  let exemption = evaluateRecaptureExemption(input.exemption, input.noticeDate);
  // 배제가 일부 연도분부터만 적용되면(10·11호) 그 전 연도분은 추징한다
  const from = exemption.exempt ? exemption.fromTaxYear : null;
  const rows = from === null ? (exemption.exempt ? [] : input.rows) : input.rows.filter((r) => r.taxYear < from);
  const exemptTaxYears = exemption.exempt
    ? input.rows.filter((r) => from === null || r.taxYear >= from).map((r) => r.taxYear)
    : [];
  if (exemption.exempt && exemptTaxYears.length === 0) {
    // 입력한 연도가 모두 적용 전 — 배제 불성립
    exemption = NOT_EXEMPT([X.RECAPTURE_EXEMPT_1HO_6Y_NOT_IN_FORCE], exemption.notices);
  } else if (rows.length === 0) {
    return { ...zero, calculated: true, exempt: true, exemption, exemptTaxYears, failReasons: [], notices: exemption.notices };
  }

  const { annualInterest, notices } = calculateRecaptureAnnualInterest(rows, input.noticeDate);
  const totalRecoveryTax = annualInterest.reduce((sum, r) => sum + r.amount, 0);
  const interestAmount = annualInterest.reduce((sum, r) => sum + r.interest, 0);
  return {
    calculated: true,
    exempt: false,
    exemption,
    exemptTaxYears: exemption.exempt ? exemptTaxYears : [],
    totalRecoveryTax,
    interestAmount,
    totalPayable: totalRecoveryTax + interestAmount,
    recoveryPeriodYears: annualInterest.length,
    annualInterest,
    failReasons: [],
    notices: [...notices, ...exemption.notices.filter((n) => !notices.includes(n))],
  };
}
