/**
 * §155의2(장기저당담보주택)·§155의3(상생임대주택) 거주기간 제한 면제 + §159의4 표2 거주 2년 요건 술어.
 *
 * `transfer-tax-exemption-requirements.ts`에서 800줄 정책으로 분리했다(OH-22 작업 중 803줄 도달).
 * 이 파일은 그 파일을 import하지 않는다(의존은 한 방향). 원 파일이 재export해 기존 import 경로를 지킨다.
 */
import type { TransferTaxInput } from "./types/transfer.types";
import { resolveLthdTable2Era } from "./data/lthd-table2-era";

/**
 * §155의2 적용 개시일 — 2005-01-01.
 *
 * 대통령령 제18705호(2005-02-19) 부칙 제11조: 「제155조의2의 개정규정은 이 영 **시행일이 속하는
 * 과세기간에 양도하는 분**부터 적용한다」. 시행일 2005-02-19가 속하는 과세기간 = 2005년.
 * ⇒ 2005-01-01 이후 양도분부터. 그 전 양도에 이 특례를 적용하면 법 근거 없는 유리 적용이다.
 */
export const LONG_TERM_MORTGAGE_EFFECTIVE_DATE = new Date("2005-01-01");
/** §155의2①1호 — 계약체결일 현재 가입자 나이. 2025-12-30 개정은 부처명만 바꿨다(요건 불변, 실독). */
export const LONG_TERM_MORTGAGE_MIN_AGE = 60;
/** §155의2①2호 — 계약기간(년) */
export const LONG_TERM_MORTGAGE_MIN_CONTRACT_YEARS = 10;

/** §155의3①1호 — 상생임대차계약 체결 기간 (2024-11-12 개정으로 2026-12-31까지 연장) */
export const WIN_WIN_CONTRACT_START = new Date("2021-12-20");
export const WIN_WIN_CONTRACT_END = new Date("2026-12-31");
/** §155의3①1호 — 임대보증금·임대료 증가율 상한 「100분의 5」 */
export const WIN_WIN_MAX_INCREASE_PCT = 5;
/** §155의3①2호 — 직전임대차계약 임대기간 「1년 6개월」 */
export const WIN_WIN_PRIOR_LEASE_MIN_MONTHS = 18;
/** §155의3①3호 — 상생임대차계약 임대기간 「2년」 */
export const WIN_WIN_LEASE_MIN_MONTHS = 24;

/**
 * §155의2 장기저당담보 **계약 요건**(①1~3호) 충족 + ③ 미해당 여부.
 *
 * 🔑 주택 수 구조(①의 1주택 / ②의 동거봉양 합가 2주택)는 **여기서 보지 않는다** —
 *    그 게이트는 호출부(`checkExemptionCore`의 분기)가 이미 하고 있고, 여기에 또 두면
 *    같은 판정이 두 곳에 생긴다.
 */
export function qualifiesLongTermMortgageContract(
  input: Pick<TransferTaxInput, "transferDate" | "longTermMortgageHouse">,
): boolean {
  const m = input.longTermMortgageHouse;
  if (!m) return false;
  // 부칙 제11조 — 2005년 과세기간 이후 양도분부터.
  if (input.transferDate < LONG_TERM_MORTGAGE_EFFECTIVE_DATE) return false;
  // ③ 계약기간 만료 이전 양도 → ①② 부적용.
  if (m.transferredBeforeMaturity) return false;
  return (
    m.borrowerAgeAtContract >= LONG_TERM_MORTGAGE_MIN_AGE &&
    m.contractYears >= LONG_TERM_MORTGAGE_MIN_CONTRACT_YEARS &&
    m.maturityLumpSumRepayment === true
  );
}

/**
 * §155의2①② **거주기간 면제** 성립 여부.
 *
 * 법문이 면제 대상을 「**장기저당담보주택은**」으로 한정하므로, ②에서 먼저 양도하는 주택이
 * 담보주택이 아니면 1주택 의제만 서고 거주요건은 그대로 본다.
 *
 * 🔴 이 술어를 `meetsOneHouseResidenceRequirement`(공통)에 넣지 않는다 — 넣으면 일시적 2주택
 *    (§155①)·혼인 합가(§155⑤) 같은 **다른 의제 경로에도 면제가 샌다**. §155의2①은 「국내에
 *    1주택을 소유한 1세대」, ②는 「동거봉양 합가」로 각각 한정돼 있어 법 근거가 없다.
 *    ⇒ 호출부 두 곳(1주택 E-4 · §155의2② 분기)에서만 주입한다.
 */
export function qualifiesLongTermMortgageResidenceExemption(
  input: Pick<TransferTaxInput, "transferDate" | "longTermMortgageHouse">,
): boolean {
  return (
    qualifiesLongTermMortgageContract(input) &&
    input.longTermMortgageHouse?.isTransferredHouseMortgaged === true
  );
}

/**
 * §155의3① 상생임대주택 요건(1~3호) 충족 여부.
 *
 * 🔑 이것은 **의제가 아니라 거주기간 제한 면제**다. 성립해도 주택 수는 그대로이고
 *    중과 배제(§167의10①15호)와도 무관하다 — 15호는 「제155조 또는 조세특례제한법」만 열거한다.
 * 🔑 ①의 괄호가 「제155조, 제155조의2, 제156조의2, 제156조의3 및 그 밖의 법령에 따라 1세대1주택으로
 *    **보는 경우를 포함**」이므로 **의제 1주택 세대에도 적용**된다 ⇒ 공통 술어에 둔다.
 */
export function qualifiesWinWinRental(
  input: Pick<TransferTaxInput, "winWinRentalHouse">,
): boolean {
  const w = input.winWinRentalHouse;
  if (!w) return false;
  return (
    w.winWinContractDate >= WIN_WIN_CONTRACT_START &&
    w.winWinContractDate <= WIN_WIN_CONTRACT_END &&
    w.increaseRatePct <= WIN_WIN_MAX_INCREASE_PCT &&
    w.priorLeaseMonths >= WIN_WIN_PRIOR_LEASE_MIN_MONTHS &&
    w.winWinLeaseMonths >= WIN_WIN_LEASE_MIN_MONTHS
  );
}

/** 「소득세법 시행령」 §159의4 — 표2 대상 「보유기간 중 **거주기간이 2년 이상**」. */
export const TABLE2_MIN_RESIDENCE_YEARS = 2;

/**
 * §159의4 표2의 **거주 2년 요건** 충족 여부 — 표2 게이트의 단일 소스.
 *
 * §155의3①이 「제154조제1항, 제155조제20항제1호 및 **제159조의4**를 적용할 때 해당 규정에 따른
 * 거주기간의 제한을 받지 않는다」고 **명시**하므로 상생임대주택은 이 요건이 면제된다.
 *
 * 🔴 이 술어를 만든 이유는 게이트가 **여러 곳에 흩어져 있기** 때문이다(단건 경로만 5곳: 본체·
 *    컴패니언 부수토지·§95⑤ 용도변경·§98의2 특칙·표시 문구). 한 곳만 고치면 「공제율은 표2인데
 *    문구는 표1」 같은 축 어긋남이 난다(`feedback_enumerate_all_write_sites_before_fixing`).
 *
 * @param table2ResidenceYears §154⑧3호 통산을 반영한 거주 연수(호출부가 이미 계산해 둔 값을 받는다 —
 *   여기서 다시 계산하면 통산 규칙이 두 벌이 된다).
 *
 * OH-31 — 거주 2년 요건은 **2020-01-01 이후 양도분**부터다(시행령 §159의3 <개정 2018.10.23>,
 * 대통령령 제29242호 부칙 제1조 단서·제3조). 2009-01-01~2019-12-31 양도분은 요건이 없다
 * (`data/lthd-table2-era.ts`). `transferDate`가 없는 호출(겸용주택 — 2022년 이후 양도만)은 현행대로 본다.
 */
export function meetsTable2ResidenceRequirement(
  input: Pick<TransferTaxInput, "winWinRentalHouse"> & Partial<Pick<TransferTaxInput, "transferDate">>,
  table2ResidenceYears: number,
): boolean {
  if (input.transferDate && resolveLthdTable2Era(input.transferDate) === "holding_8pct") return true;
  return table2ResidenceYears >= TABLE2_MIN_RESIDENCE_YEARS || qualifiesWinWinRental(input);
}
