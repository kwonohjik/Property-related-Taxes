/**
 * 종부령 §3①4호 미임대 민간건설임대주택(「소유」) — 다목 「사용승인을 받은 날 … 부터 과세기준일 현재까지의 기간 동안 임대된 사실이
 * 없고, 그 임대되지 아니한 기간이 2년 이내일 것」. 가목 149㎡·나목 9억/6억은 `comprehensive-exclusion.ts` 공통 판정
 * (나목 6억/9억은 부칙<제31447호> §2 — `comprehensive-exclusion-price-era.ts`).
 * 임대개시일·임대료·2호 이상·의무임대기간·2018.3.31. 단서는 없다(4호 문언 · 계획서 §4.1 4-8).
 * 「2년 이내」는 사용승인일 + 2년 당일까지 포함(V-3 · 직접 해석 0건). 「모름」은 불성립 + 확인 필요.
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md §4.1
 */
import { addYears } from "./utc-date";
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

/** 4호 고유 불성립 사유(4호가 아니면 빈 배열) */
export function vacantConstruction4hoIssues(input: RentalExclusionInput): string[] {
  if (input.registrationType !== "vacant_construction") return [];
  const out: string[] = [];
  if (input.neverRentedSinceApproval === false) out.push(COMPREHENSIVE_EXCL.VACANT_4HO_RENTED);
  else if (input.neverRentedSinceApproval == null) out.push(COMPREHENSIVE_EXCL.VACANT_4HO_RENTED_UNKNOWN);
  const approval = input.usageApprovalDate;
  if (!approval || Number.isNaN(approval.getTime())) {
    out.push(COMPREHENSIVE_EXCL.VACANT_4HO_APPROVAL_UNKNOWN);
  } else if (input.assessmentDate.getTime() > addYears(approval, 2).getTime()) {
    out.push(COMPREHENSIVE_EXCL.VACANT_4HO_OVER_2Y);
  }
  return out;
}
