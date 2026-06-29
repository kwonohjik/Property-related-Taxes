/**
 * §168의11② 수입금액비율 테스트 (소득세법 시행령 §168조의11② + 시행규칙 §83조의4)
 *
 * 적용 대상: §168의11①2호다목(주차장운영업)·10호(광천지)·11호다목(양어장 기타)·12호(제조·학원·도소매).
 * 수입금액비율 = max(① 당해 수입÷당해 토지가액, ② (당해+직전 수입)÷(당해+직전 토지가액)).
 * 비율 ≥ 업종별 율(§83의4)이면 해당 토지 사업용 인정.
 *
 * §168의11③3호 연환산: 1과세기간 중 사업영위 기간이 1년 미만(토지 양도·신규개시·폐업 등)이면
 * 당해 기간 수입금액을 1년간으로 환산하여 연간수입금액을 산정한다. ①·② 분자 모두 환산값 사용.
 */
import { differenceInCalendarDays, getDaysInYear } from "date-fns";

import type { RevenueTestInput, RevenueTestResult } from "./types";
import { getNblRevenueThreshold } from "../legal-codes";

/**
 * 사업영위 일수 (초일산입 inclusive). 매퍼·UI preview 공용 단일 진실.
 * @param endDate   기간 종료일 (당해=양도일, 직전=직전연도 종료/폐업일)
 * @param startDate 기간 개시일 (당해=과세기간개시일·취득일·사업개시일 중 늦은 날)
 */
export function deriveBusinessDays(endDate: Date, startDate: Date): number {
  return differenceInCalendarDays(endDate, startDate) + 1;
}

/**
 * 당해 과세기간 영위일수·과세연도 도출. 매퍼·UI preview 공용 단일 진실.
 * 영위 개시일 = max(과세기간개시일 1.1, 당해연도 취득일, 사업개시일 override).
 * @param transferDate    양도일(=당해 과세기간 종료일, §168의11④)
 * @param acquisitionDate 취득일 (당해연도 취득 시 영위 개시 하한)
 * @param startOverride   사업개시일 직접입력 (있으면 우선)
 */
export function deriveCurrentBusinessDays(
  transferDate: Date,
  acquisitionDate: Date,
  startOverride?: Date,
): { days: number; taxYear: number } {
  const taxYear = transferDate.getFullYear();
  const starts: Date[] = [new Date(taxYear, 0, 1)];
  if (acquisitionDate.getFullYear() === taxYear) starts.push(acquisitionDate);
  if (startOverride) starts.push(startOverride);
  const start = starts.reduce((latest, d) => (d > latest ? d : latest));
  return { days: deriveBusinessDays(transferDate, start), taxYear };
}

/**
 * §168의11③3호 연환산. 영위일수·과세연도 제공 + 영위일수 < 해당연도총일수일 때만 환산.
 * @returns 환산 후 연간수입금액(정수 floor) + 적용 여부.
 */
function annualizeRevenue(
  revenue: number,
  businessDays: number | undefined,
  taxYear: number | undefined,
): { value: number; applied: boolean } {
  if (!businessDays || !taxYear || businessDays <= 0) return { value: revenue, applied: false };
  const yearDays = getDaysInYear(new Date(taxYear, 0, 1)); // 365 / 366(윤년)
  if (businessDays >= yearDays) return { value: revenue, applied: false };
  return { value: Math.floor((revenue * yearDays) / businessDays), applied: true };
}

/**
 * 수입금액비율 산정. businessType "none"·토지가액 0 가드 포함.
 * §168의11③3호 연환산을 당해·직전에 각각 적용 후 max(비율①, 비율②) 기준 pass 판정.
 */
export function computeRevenueTest(rt: RevenueTestInput): RevenueTestResult {
  const threshold = getNblRevenueThreshold(rt.businessType);

  // §168의11③3호 연환산 (당해·직전 각각)
  const annCurrent = annualizeRevenue(rt.currentRevenue, rt.currentBusinessDays, rt.currentTaxYear);
  const currentRevenue = annCurrent.value;

  let annualizedPriorRevenue: number | undefined;
  let priorApplied = false;
  if (rt.priorRevenue !== undefined) {
    const annPrior = annualizeRevenue(rt.priorRevenue, rt.priorBusinessDays, rt.priorTaxYear);
    annualizedPriorRevenue = annPrior.value;
    priorApplied = annPrior.applied;
  }

  // 비율① 당해 과세기간 (연환산 수입)
  const ratioCurrent = rt.currentLandValue > 0 ? currentRevenue / rt.currentLandValue : 0;

  // 비율② 당해+직전 (직전 제공 시)
  let ratioCombined: number | undefined;
  if (annualizedPriorRevenue !== undefined && rt.priorLandValue !== undefined) {
    const denom = rt.currentLandValue + rt.priorLandValue;
    ratioCombined = denom > 0 ? (currentRevenue + annualizedPriorRevenue) / denom : 0;
  }

  // §168의11② "큰 것"
  const actualRatio = Math.max(ratioCurrent, ratioCombined ?? 0);
  const pass = threshold > 0 && actualRatio >= threshold;
  const annualizationApplied = annCurrent.applied || priorApplied;

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return {
    businessType: rt.businessType,
    threshold,
    ratioCurrent,
    ratioCombined,
    actualRatio,
    pass,
    annualizedCurrentRevenue: currentRevenue,
    annualizedPriorRevenue,
    currentBusinessDays: rt.currentBusinessDays,
    priorBusinessDays: rt.priorBusinessDays,
    annualizationApplied,
    detail: pass
      ? `수입금액비율 ${pct(actualRatio)} ≥ 기준 ${pct(threshold)} → 사업용 인정`
      : `수입금액비율 ${pct(actualRatio)} < 기준 ${pct(threshold)} → 미충족`,
  };
}
