/**
 * §168의11② 수입금액비율 테스트 (소득세법 시행령 §168조의11② + 시행규칙 §83조의4)
 *
 * 적용 대상: §168의11①2호다목(주차장운영업)·10호(광천지)·11호다목(양어장 기타)·12호(제조·학원·도소매).
 * 수입금액비율 = max(① 당해 수입÷당해 토지가액, ② (당해+직전 수입)÷(당해+직전 토지가액)).
 * 비율 ≥ 업종별 율(§83의4)이면 해당 토지 사업용 인정.
 */
import type { RevenueTestInput, RevenueTestResult } from "./types";
import { getNblRevenueThreshold } from "../legal-codes";

/**
 * 수입금액비율 산정. businessType "none"·토지가액 0 가드 포함.
 * @returns max(비율①, 비율②) 기준 pass 판정.
 */
export function computeRevenueTest(rt: RevenueTestInput): RevenueTestResult {
  const threshold = getNblRevenueThreshold(rt.businessType);

  // 비율① 당해 과세기간
  const ratioCurrent = rt.currentLandValue > 0 ? rt.currentRevenue / rt.currentLandValue : 0;

  // 비율② 당해+직전 (직전 제공 시)
  let ratioCombined: number | undefined;
  if (rt.priorRevenue !== undefined && rt.priorLandValue !== undefined) {
    const denom = rt.currentLandValue + rt.priorLandValue;
    ratioCombined = denom > 0 ? (rt.currentRevenue + rt.priorRevenue) / denom : 0;
  }

  // §168의11② "큰 것"
  const actualRatio = Math.max(ratioCurrent, ratioCombined ?? 0);
  const pass = threshold > 0 && actualRatio >= threshold;

  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return {
    businessType: rt.businessType,
    threshold,
    ratioCurrent,
    ratioCombined,
    actualRatio,
    pass,
    detail: pass
      ? `수입금액비율 ${pct(actualRatio)} ≥ 기준 ${pct(threshold)} → 사업용 인정`
      : `수입금액비율 ${pct(actualRatio)} < 기준 ${pct(threshold)} → 미충족`,
  };
}
