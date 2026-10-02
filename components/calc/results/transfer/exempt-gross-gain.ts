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
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { redevBranchTotals } from "./redev-acquisition-inverse";

type RedevDetailLike = NonNullable<TransferTaxResult["redevelopmentDetail"]>;

/**
 * 표시에 쓰는 「전체 양도차익」 — 비과세면 gross echo, 아니면 과세 차익.
 *
 * 🔴 재개발(§166)은 세 번째 축이다. 12억 안분이 걸리면 `transferGain`이 **안분 후 과세대상**이라
 *   (`transfer-tax-redevelopment.ts` — 분기별 `gain`을 합산) 「전체 양도차익」 자리에 그것을 쓰면
 *   신고서 양식(분기별 `gainBeforeAllocation` 합)과 어긋난다. 실측 2,100,000,000 vs 770,000,000.
 *   ⇒ 분기 합 leaf(`redevBranchTotals`)를 쓴다 — 안분이 없으면 두 값이 같아 무영향이다.
 */
export function effectiveGrossGain(r: {
  isExempt?: boolean;
  exemptGrossGain?: number;
  transferGain: number;
  redevelopmentDetail?: RedevDetailLike;
}): number {
  if (r.isExempt) return r.exemptGrossGain ?? 0;
  if (r.redevelopmentDetail) return redevBranchTotals(r.redevelopmentDetail).gain;
  return r.transferGain;
}

/**
 * 취득가액 역산 — 「양도가액 − 양도차익 − 필요경비」 (+ 취득가액 칸으로 옮겨 얹은 자본적지출).
 *
 * `capEx`에는 **원시 자본적지출이 아니라** `capExInAcquisitionColumn` 결과를 넘긴다 —
 * 실가 모드는 0이다(자본적지출은 필요경비 칸에 머문다).
 */
export function inverseAcquisitionForDisplay(a: {
  transferPrice: number;
  grossGain: number;
  expenses: number;
  capEx: number;
}): number {
  return a.transferPrice - a.grossGain - a.expenses + a.capEx;
}

/**
 * 신고서 「취득가액」 칸으로 옮겨 얹는 자본적지출 — **실가 모드에서는 0**이다.
 *
 * ## 축 (계획서 `docs/00-pm/transfer-depreciation-and-capex-display.plan.md` §3.1)
 *
 * 「소득세법」 §97①은 필요경비를 1호 취득가액 · **2호 자본적지출액** · 3호 양도비로 가른다.
 * 서식(시행규칙 별지 제84호서식 부표3)도 자본적지출(⑥)을 「기타 필요경비」(⑬ → 부표1 ⑭)에 넣는다.
 * 종전에는 「신고서 양식 표시 관행」이라며 취득가액 칸에 합산하고 필요경비 칸에는 양도비만 적었다 —
 * 사용자 제보 2026-10-02(취득 28,500,000 · 자본적지출 1,000,000 · 양도비 700,000 →
 * 취득가액 29,500,000 · 필요경비 700,000).
 *
 * ## 예외 둘 — 종전 표시(취득가액 칸 = 자본적지출 포함)를 유지한다
 *
 * · **§97②2호 단서(swap)** — 엔진이 취득가액을 차감하지 않고(0) 필요경비 전체를 나목으로 삼는 축이라
 *   PR #1636이 「취득가액 칸 = 나목」으로 고정했다(사용자 확인 화면). 전용 anchor
 *   `swap-97-2-display-identity.anchor.test.ts`가 지킨다.
 * · **이월과세 시나리오 A** — 취득가액 칸에 증여자 취득가액·증여자 자본적지출 승계를 함께 적는
 *   별도 산식(`carryover-statement-formula.anchor.test.ts`)이라 이번 전환 범위 밖이다.
 *
 * ⚠️ 판정은 **이 함수 하나**에서 한다 — 신고서(단건·다건)·명세서 합계·자산별·산식이 각자 판정하면
 *   칸마다 갈라져 항등식(양도가액 − 취득가액 − 필요경비 = 양도차익)이 깨진다.
 */
export function capExInAcquisitionColumn(d: {
  capitalExpenditureForDisplay?: number;
  swapApplied?: boolean;
  carryoverScenarioA?: boolean;
}): number {
  return d.swapApplied || d.carryoverScenarioA ? (d.capitalExpenditureForDisplay ?? 0) : 0;
}

/** 단건 결과 → 취득가액 칸으로 옮겨 얹는 자본적지출. */
export function capExInAcquisitionColumnOfResult(r: TransferTaxResult): number {
  return capExInAcquisitionColumn({
    capitalExpenditureForDisplay: r.capitalExpenditureForDisplay,
    swapApplied: r.swapApplied,
    carryoverScenarioA: r.carryoverTaxationDetail?.adoptedScenario === "A",
  });
}

/** 자산별(breakdown) → 취득가액 칸으로 옮겨 얹는 자본적지출. */
export function capExInAcquisitionColumnOfProperty(p: PerPropertyBreakdown): number {
  return capExInAcquisitionColumn({
    capitalExpenditureForDisplay: p.capitalExpenditureForDisplay,
    swapApplied: p.filingDisplay?.swapApplied,
    carryoverScenarioA: p.carryoverTaxationDetail?.adoptedScenario === "A",
  });
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
