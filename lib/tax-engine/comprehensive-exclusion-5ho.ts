/**
 * 종부령 §3①5호 — 부동산투자회사(또는 부동산간접투자기구)가 「2008년 1월 1일부터 2008년 12월 31일까지 취득 및 임대하는
 * 매입임대주택으로서 다음 각 목의 요건을 모두 갖춘 주택이 5호 이상인 경우의 그 주택」.
 * 가목 「2008년도 과세기준일의 공시가격이 6억원 이하」(현재 공시가격이 아니다 — 예/아니오 사실) · 다목 수도권 밖.
 * 가목 149㎡는 공통 `getAreaLimit` · 나목 10년은 공통 경고(`MANDATORY_PERIOD_BY_TYPE`). 임대료 요건은 없다(§3⑧에 5호 없음).
 * 취득만 판정하고 2008년 중 임대 개시는 판정하지 않는다(V-7). 5호 이상은 같은 시·도 합산 대상이 아니다(§3⑤에 5호 없음).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-4-5-9ho-types.plan.md §4.3
 */
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

const ACQ_FROM = Date.UTC(2008, 0, 1);
const ACQ_TO = Date.UTC(2008, 11, 31);

/** 5호 고유 불성립 사유(5호가 아니면 빈 배열) */
export function reitPurchase5hoIssues(input: RentalExclusionInput): string[] {
  if (input.registrationType !== "reit_purchase") return [];
  const out: string[] = [];
  const acq = input.reitAcquisitionDate;
  if (!acq || Number.isNaN(acq.getTime())) out.push(COMPREHENSIVE_EXCL.REIT_5HO_ACQ_UNKNOWN);
  else if (acq.getTime() < ACQ_FROM || acq.getTime() > ACQ_TO) out.push(COMPREHENSIVE_EXCL.REIT_5HO_NOT_2008);
  const u = input.reitRental5hoCount;
  if (typeof u !== "number" || !Number.isFinite(u)) out.push(COMPREHENSIVE_EXCL.REIT_5HO_UNITS_UNKNOWN);
  else if (u < 5) out.push(COMPREHENSIVE_EXCL.REIT_5HO_UNITS_UNDER_5);
  if (input.reitPrice2008Under6eok === false) out.push(COMPREHENSIVE_EXCL.REIT_5HO_PRICE_2008_EXCEEDED);
  else if (input.reitPrice2008Under6eok == null) out.push(COMPREHENSIVE_EXCL.REIT_5HO_PRICE_2008_UNKNOWN);
  if (input.location === "metro") out.push(COMPREHENSIVE_EXCL.REIT_5HO_METRO);
  return out;
}
