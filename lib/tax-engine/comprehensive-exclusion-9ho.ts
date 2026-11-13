/**
 * 종부령 §3①9호(「소유」) — 「제1호에 해당하는 공공건설임대주택 또는 제2호에 해당하는 공공매입임대주택 중 … 분양전환공공임대주택으로서
 * 같은 영 제54조에 따른 임대의무기간이 만료된 후 분양전환이 이루어지지 않은 주택(임대의무기간 만료일의 다음 날부터 2년 이내인 경우로 한정)」.
 * 대통령령 제33696호(2023.9.5.) 신설 · 부칙 제2조 → 2023년 납세의무 성립분부터.
 * 1·2호의 면적·공시가격·임대료(가·다목)는 공통 판정이 바탕 유형(건설=공공건설 · 매입=공공매입)으로 본다 — 5년 임대·임대 계속은 면제
 * (계획서 Q-4 a · 「제1호에 해당하는」의 승계 범위 직접 해석 0건 — V-1). 「2년 이내」는 만료일 + 2년 당일까지(V-3). 모름은 불성립 + 확인 필요.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md §4.2
 */
import { addYears } from "./utc-date";
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

const IN_FORCE_FROM = Date.UTC(2023, 0, 1);

/** 9호의 면적·가격·임대료를 볼 바탕 유형. 9호가 아니거나 구분을 모르면 null. */
export function conversion9hoBaseType(input: RentalExclusionInput): "public_construction" | "public_purchase" | null {
  if (input.registrationType !== "public_conversion_pending") return null;
  if (input.conversionBase === "construction") return "public_construction";
  if (input.conversionBase === "purchase") return "public_purchase";
  return null;
}

/** 9호 고유 불성립 사유(9호가 아니면 빈 배열) */
export function conversionPending9hoIssues(input: RentalExclusionInput): string[] {
  if (input.registrationType !== "public_conversion_pending") return [];
  const asmt = input.assessmentDate.getTime();
  if (asmt < IN_FORCE_FROM) return [COMPREHENSIVE_EXCL.CONV_9HO_NOT_IN_FORCE];
  const out: string[] = [];
  if (conversion9hoBaseType(input) === null) out.push(COMPREHENSIVE_EXCL.CONV_9HO_BASE_UNKNOWN);
  if (input.isConversionPublicRental === false) out.push(COMPREHENSIVE_EXCL.CONV_9HO_NOT_CONVERSION);
  else if (input.isConversionPublicRental == null) out.push(COMPREHENSIVE_EXCL.CONV_9HO_CONVERSION_UNKNOWN);
  const end = input.mandatoryPeriodEndDate;
  if (!end || Number.isNaN(end.getTime())) out.push(COMPREHENSIVE_EXCL.CONV_9HO_END_UNKNOWN);
  else if (asmt <= end.getTime()) out.push(COMPREHENSIVE_EXCL.CONV_9HO_NOT_EXPIRED);
  else if (asmt > addYears(end, 2).getTime()) out.push(COMPREHENSIVE_EXCL.CONV_9HO_OVER_2Y);
  if (input.conversionCompleted === true) out.push(COMPREHENSIVE_EXCL.CONV_9HO_CONVERTED);
  else if (input.conversionCompleted == null) out.push(COMPREHENSIVE_EXCL.CONV_9HO_CONVERTED_UNKNOWN);
  return out;
}
