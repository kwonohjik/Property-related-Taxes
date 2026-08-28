/**
 * 비과세 자산의 **표시용 양도차익·취득가액 역산** — 단일 소스.
 *
 * ## 왜 필요한가
 *
 * 전액 비과세 자산은 엔진 `transferGain`이 **0**이다(과세 대상이 없다). 화면이 그 필드를
 * 그대로 쓰면 「양도차익 0」이 되고, 취득가액을 「양도가액 − 양도차익 − 필요경비」로 역산하는
 * 표시부는 **취득가액 = 양도가액**이라는 값을 만들어낸다 — 사용자가 입력한 취득가액과 무관하다.
 *
 * 그래서 엔진은 `exemptGrossGain` echo를 싣는다. 정본 규칙은 신고서 양식에 이미 있었다:
 *   `result.isExempt ? (result.exemptGrossGain ?? 0) : result.transferGain`
 *
 * 그런데 같은 규칙이 **네 곳에 필요한데 두 곳에만** 있었다(결과탭 코드리뷰 #011 #012 #020
 * #084 #094 #102). 같은 화면의 신고서와 상세명세서가 취득가액·양도차익을 **다르게** 표시했다.
 * ⇒ 여기 한 곳에 두고 전부 이것을 부른다(memory `feedback_ui_engine_dual_truth_avoidance`).
 */

/** 표시에 쓰는 「전체 양도차익」 — 비과세면 gross echo, 아니면 과세 차익. */
export function effectiveGrossGain(r: {
  isExempt?: boolean;
  exemptGrossGain?: number;
  transferGain: number;
}): number {
  return r.isExempt ? (r.exemptGrossGain ?? 0) : r.transferGain;
}

/**
 * 취득가액 역산 — 「양도가액 − 양도차익 − 필요경비」.
 *
 * ⚠️ 신고서 표시 관행상 **자본적지출은 취득가액에 합산**한다. 그래서 `capEx`를 더한 값을
 *   돌려주고, 필요경비 쪽에서는 그만큼 빼야 한다(`displayExpenses`).
 */
export function inverseAcquisitionForDisplay(a: {
  transferPrice: number;
  grossGain: number;
  expenses: number;
  capEx: number;
}): number {
  return a.transferPrice - a.grossGain - a.expenses + a.capEx;
}

/** 집계 breakdown(자산별)도 같은 규칙을 탄다. */
export function effectiveGrossGainOfProperty(p: {
  isExempt?: boolean;
  exemptGrossGain?: number;
  transferGain: number;
}): number {
  return effectiveGrossGain(p);
}

/**
 * 자산별 **과세대상 양도차익** — 12억 초과 고가주택 안분 후의 값.
 *
 * 엔진 breakdown은 안분 결과를 `income`(양도소득금액)으로만 남기므로 표시부가 역산한다:
 *   과세대상 = min(gross, max(0, income) + 장특공제)
 *
 * 🔴 다건 자산별 신고서 어댑터는 이 역산을 하지 않고 `Math.max(0, b.transferGain)`을 썼다.
 *   12억 초과 고가주택에서 **과세대상·양도소득금액이 안분 전 값으로 부풀었다**(#019).
 *   같은 화면의 합산 서식(`FilingFormTableAggregateHelpers.ts:171-176`)은 정확히 역산하고
 *   있어 두 표가 어긋났다.
 */
export function assetTaxableGain(p: {
  isExempt?: boolean;
  exemptGrossGain?: number;
  transferGain: number;
  income: number;
  longTermHoldingDeduction: number;
}): number {
  const gross = effectiveGrossGain(p);
  if (p.isExempt) return 0;
  return gross > 0 ? Math.min(gross, Math.max(0, p.income) + p.longTermHoldingDeduction) : gross;
}

/** 자산별 비과세 양도차익 = gross − 과세대상. */
export function assetExemptGain(p: Parameters<typeof assetTaxableGain>[0]): number {
  return Math.max(0, effectiveGrossGain(p) - assetTaxableGain(p));
}
