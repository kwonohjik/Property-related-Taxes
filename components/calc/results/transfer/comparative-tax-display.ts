/**
 * §104⑤ 비교과세 표시 — 5단계 산출세액·요약 카드가 **같은 판정**을 쓰는 단일 소스.
 *
 * 채택된 쪽이 감면 전 금액으로 항상 큰 것은 아니다: 감면이 있으면 §104⑤ 괄호에 따라
 * 「감면세액을 뺀 세액이 더 큰 쪽」을 고르므로 작은 금액이 채택될 수 있다. 그래서
 * 「큰 금액을 결정」은 채택액이 실제로 최대일 때만 말한다(`reason`).
 */
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { GroupTaxResult } from "@/lib/tax-engine/types/transfer-aggregate.types";

export interface ComparativeTaxView {
  /** 방법 A — 전체 과세표준에 누진세율 */
  methodA: number;
  /** 방법 B — 세율군별 분리 산출 합 */
  methodB: number;
  applied: "groups" | "general";
  /** 채택된 방법의 감면 전 금액 */
  chosenAmount: number;
  /** `larger` = 채택액이 두 금액 중 큰 쪽 · `after_reduction` = 감면세액을 뺀 세액이 더 커서 채택 */
  reason: "larger" | "after_reduction";
}

/** 비교과세가 적용되지 않은 합산(`none`)이거나 두 금액이 없으면 `null`. */
export function comparativeTaxView(
  r: Pick<AggregateTransferResult, "calculatedTaxByGeneral" | "calculatedTaxByGroups" | "comparedTaxApplied">,
): ComparativeTaxView | null {
  const applied = r.comparedTaxApplied;
  const methodA = r.calculatedTaxByGeneral;
  const methodB = r.calculatedTaxByGroups;
  // 옛 저장 결과·부분 객체엔 두 금액이 없을 수 있다 — NaN 문구를 만들지 않는다.
  if (applied !== "groups" && applied !== "general") return null;
  if (!Number.isFinite(methodA) || !Number.isFinite(methodB)) return null;
  const chosenAmount = applied === "groups" ? methodB : methodA;
  return {
    methodA,
    methodB,
    applied,
    chosenAmount,
    reason: chosenAmount >= Math.max(methodA, methodB) ? "larger" : "after_reduction",
  };
}

const METHOD_LABEL = { general: "전체 누진세율", groups: "세율군별" } as const;

/** 결정 사유 한 문장 — 5단계 산출세액 행과 세율군 카드가 같이 쓴다. */
export function describeComparativeDecision(v: ComparativeTaxView): string {
  return v.reason === "larger"
    ? `두 금액 중 큰 금액인 ${METHOD_LABEL[v.applied]} ${v.chosenAmount.toLocaleString()}을(를) 산출세액으로 결정했습니다`
    : `감면세액을 뺀 세액이 더 큰 ${METHOD_LABEL[v.applied]} ${v.chosenAmount.toLocaleString()}을(를) 산출세액으로 결정했습니다(§104⑤ 괄호)`;
}

/** 5단계 산출세액 행의 산식 문구 — A·B 두 금액과 결정 사유. */
export function describeComparativeTax(v: ComparativeTaxView): string {
  return `전체 누진세율 적용(방법 A) ${v.methodA.toLocaleString()} ↔ 세율군별 분리 산출(방법 B) ${v.methodB.toLocaleString()} — ${describeComparativeDecision(v)}. 소득세법 §104⑤ 비교과세`;
}

/**
 * 세율군 카드의 세율 문구. 단일 세율이 **군 산출세액을 재현할 때만** 적는다.
 *
 * 대리 지표(「표시용 최고세율」) 대신 주장하는 항등식 자체를 검산한다 — 한 군에 과세표준 > 0인
 * 호가 둘 이상이고 세율이 다르면 `과세표준 × 최고세율`이 거짓이다. 과세표준 0원 군은 세액이 0이라
 * 어떤 세율이든 성립하므로 자기 세율을 그대로 보여준다.
 */
export function groupRateText(
  g: Pick<
    GroupTaxResult,
    "groupTaxBase" | "groupCalculatedTax" | "appliedRate" | "surchargeRate" | "progressiveDeduction"
  >,
): string {
  const reproduces =
    g.groupTaxBase === 0 ||
    Math.floor(g.groupTaxBase * g.appliedRate) - g.progressiveDeduction === g.groupCalculatedTax;
  if (!reproduces) return "(호별 합계)";
  const surcharge = g.surchargeRate ? ` +${(g.surchargeRate * 100).toFixed(0)}%p` : "";
  return `(${(g.appliedRate * 100).toFixed(1)}%${surcharge})`;
}
