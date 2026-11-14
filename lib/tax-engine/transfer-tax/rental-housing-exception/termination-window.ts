/**
 * §155㉓ 말소 후 5년 창 — 기한·대상 목·최초 말소일·호별 창 사유 (`eligibility.ts`에서 분리, 2026-11-14 PR-0 · 동작 불변).
 * 계획서 `docs/00-pm/rental-155-20-textbook-gaps.plan.md` PR-0 — PR-1(G-8 자동말소일 간주)이 이 파일에 들어온다.
 */

import { TRANSFER_RENTAL_HOUSING } from "../../legal-codes/transfer";
import { RA_CUT } from "../../rental-article/rules";
import { deadlineEndFrom, deadlineEndNote, type DeadlineEnd } from "../../civil-period";
import { deriveRentalArticle, deriveRegApplicationDate } from "./derive";
import type { EligibilityContext } from "./eligibility";
import type { RentalUnitInput, RentalArticle } from "./types";
/** §155㉓ 「등록이 말소된 이후 … 5년 이내에 거주주택을 양도」 — 기한 연수 (I-4) */
export const TERMINATION_TRANSFER_YEARS = 5;

/**
 * §155㉓ 5년 기한 말일 — 「~이내」(B 유형)라 초일 불산입 + 민법 §161(말일이 토요일·공휴일이면 익일).
 * 근거: 국세기본법 §4 → 민법 §157·§160·§161, 사전-2021-법령해석재산-1190(법령해석과-3656, 2021.10.21. —
 * 「~이내」 기한 말일이 공휴일이면 다음 날까지). L-1(`civil-period.ts`)과 같은 규칙이다.
 * UI(⑤ 카드의 호별 기한 표시)가 같은 함수를 쓴다.
 */
export function terminationDeadline(cancellationDate: Date): DeadlineEnd {
  return deadlineEndFrom(cancellationDate, TERMINATION_TRANSFER_YEARS);
}

/** ㉓ 대상 목 — 「제167조의3제1항제2호가목 및 다목부터 마목까지」 */
export function isTerminationEligibleArticle(article: RentalArticle): boolean {
  return article === "가" || article === "다" || article === "라" || article === "마";
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const validDate = (d: Date | undefined): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/**
 * §155㉓ 5년 창의 기산점 — 입력한 말소 호 중 가장 이른 말소일(기획재정부 재산세제과-1308, 2022.10.18. · 법규과-864, 2025.4.24.).
 * ㉓ 말소는 법률 제17482호(2020.8.18. 시행)가 만든 자진·자동 말소라 그 전 날짜와 양도일 뒤 말소는 창에 넣지 않는다.
 * 호별 판정(`evaluateRentalUnits`)과 판정 보류 고지(`one-house/holiday-notice-deadlines.ts`)가 같은 기산점을 쓴다.
 */
export function firstTerminationCancellation(
  rentalUnits: readonly RentalUnitInput[],
  transferDate: Date,
): { date: Date; unitIndex: number } | null {
  let first: { date: Date; unitIndex: number } | null = null;
  for (let i = 0; i < rentalUnits.length; i++) {
    const u = rentalUnits[i];
    const cd = u.registrationCancellationDate;
    if (!u.rentalAutoTermination || !validDate(cd)) continue;
    const art = deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, deriveRegApplicationDate(u));
    if (!isTerminationEligibleArticle(art)) continue;
    if (dayOf(cd) < RA_CUT.Y2020_08_18 || dayOf(cd) > dayOf(transferDate)) continue;
    if (!first || dayOf(cd) < dayOf(first.date)) first = { date: cd, unitIndex: i };
  }
  return first;
}

export const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/**
 * 말소되지 않고 등록·임대 중인 **폐지되는 유형** 호인가 — 법률 제17482호 부칙 제5조① 「이 법 시행(2020.8.18.) 당시 종전의 규정에
 * 따라 장기일반민간임대주택 중 아파트를 임대하는 민간매입임대주택 또는 단기민간임대주택을 등록한」 주택. 화면의 등록 유형에
 * 종전 단기(4년)는 없어(2025.6.4. 이후 단기 6년만 — 아·자목) 장기일반 아파트 매입만 남는다. ㉓ 대상 목(가·다·라·마)만 본다.
 */
export function isRegisteredAbolishedTypeUnit(u: RentalUnitInput): boolean {
  if (u.rentalAutoTermination || !u.isApartment || u.rentalAcquisitionType !== "purchase" || u.rentalCategory !== "long_general") {
    return false;
  }
  const app = deriveRegApplicationDate(u);
  if (!app || !validDate(app) || dayOf(app) >= RA_CUT.Y2020_08_18) return false;
  return isTerminationEligibleArticle(deriveRentalArticle(u.rentalCategory, u.rentalAcquisitionType, app));
}

/**
 * §155㉓ 5년 창 — 말소 호 하나의 불충족 사유(I-4). 비어 있으면 창 요건 충족.
 * 입력이 모자라면 판정하지 않는다(간주 충족 없음) — OH-39 등록 유형 미입력과 같은 처리.
 */
export function terminationWindowIssues(
  i: number,
  unit: RentalUnitInput,
  ctx: EligibilityContext,
  first: { date: Date; unitIndex: number } | null,
  firstDeadline: DeadlineEnd | null,
): string[] {
  const n = i + 1;
  const law = TRANSFER_RENTAL_HOUSING.PIT_RD_155_23;
  const cd = unit.registrationCancellationDate;
  if (!validDate(cd)) {
    return [`${n}호: 등록 말소일을 입력해야 ${law}(말소 이후 5년 이내 거주주택 양도)을 판정할 수 있습니다.`];
  }
  if (dayOf(cd) < RA_CUT.Y2020_08_18) {
    // 자진말소(민특법 §6①11호)·자동말소(§6⑤)는 법률 제17482호(2020.8.18. 시행)로 생겼다.
    // ㉓은 2020.8.18. 이후 말소분부터 적용한다(부칙<제31083호, 2020.10.7.> 제3조②).
    return [`${n}호: 등록 말소일(${ymd(cd)})이 2020.8.18. 전이라 ${law} 말소 특례 대상이 아닙니다(대통령령 제31083호 부칙 제3조②).`];
  }
  if (dayOf(cd) > dayOf(ctx.transferDate)) {
    return [`${n}호: 등록 말소일(${ymd(cd)})이 양도일(${ymd(ctx.transferDate)}) 뒤입니다 — 양도일 현재 등록 중인 주택이면 말소 표시를 끄고, 말소일을 확인하세요.`];
  }
  const issues: string[] = [];
  if (dayOf(ctx.residenceAcquisitionDate) > dayOf(cd)) {
    issues.push(
      `${n}호: 등록 말소일(${ymd(cd)}) 후에 취득한 거주주택(취득일 ${ymd(ctx.residenceAcquisitionDate)})에는 ${TRANSFER_RENTAL_HOUSING.PIT_RD_155_20}이 적용되지 않습니다(${law} · 기획재정부 재산세제과-1308, 2022.10.18.).`,
    );
  }
  if (first && firstDeadline && dayOf(ctx.transferDate) > dayOf(firstDeadline.end)) {
    const base = first.unitIndex === i ? "등록 말소일" : `최초 말소일 ${ymd(first.date)}(${first.unitIndex + 1}호)`;
    const note = deadlineEndNote(firstDeadline);
    issues.push(
      `${n}호: ${first.unitIndex === i ? `${base} ${ymd(first.date)}` : base}부터 5년 이내(${ymd(firstDeadline.end)}까지)에 거주주택을 양도해야 합니다 — 양도일 ${ymd(ctx.transferDate)}은 기한이 지났습니다(${law}${first.unitIndex === i ? "" : " — 2호 이상이면 최초로 말소된 호 기준"})${note ? `. ${note}` : ""}.`,
    );
  }
  return issues;
}
