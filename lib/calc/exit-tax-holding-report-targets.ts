/**
 * 별지 제104호서식(국외전출자 주식등 보유현황 신고서) 신고 대상 종목 선택
 *
 * 서식 각주 — 「소득세법 시행령」 제178조의8제2항에 따라 국외전출자 주식등에서 제외되는 국외주식등만
 * 보유한 국외전출자는 신고대상에서 제외된다. 엔진이 종목을 `scope: "excluded"`로 판정하면
 * (5억 이하·외국인근로자·2026 이전 출국 국외) 그 종목은 표에서 뺀다.
 *
 * 판정은 **엔진 echo만 읽는다**(화면이 5억 합계를 다시 계산하지 않는다 — UI 계획 §4.4).
 * `scope`가 없는 종전 결과·`holdingDetails`가 비어 있는 조기 반환(요건 미충족) 결과는
 * 어느 종목도 제외하지 않는다 — 2026 이전 출국 경로의 서식 출력은 불변이다.
 */

import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-types";
import type { ExitTaxHoldingResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

export function selectHoldingReportTargets(
  holdings: ExitTaxHoldingForm[],
  holdingDetails: ExitTaxHoldingResult[] | undefined,
): ExitTaxHoldingForm[] {
  const excludedIds = new Set(
    (holdingDetails ?? []).filter((d) => d.scope === "excluded").map((d) => d.id),
  );
  if (excludedIds.size === 0) return holdings;
  return holdings.filter((h) => !excludedIds.has(h.id));
}

/**
 * 제104호 서식을 인쇄 선택지(`availableIds`)에 둘지 — 종목을 입력하지 않았다면 종전처럼 빈 서식을,
 * 입력했는데 전부 제외됐다면 서식이 없는 것으로 본다(데이터 없는 서식을 고르게 두면 거짓 선택).
 */
export function hasHoldingReportTargets(
  holdings: ExitTaxHoldingForm[],
  holdingDetails: ExitTaxHoldingResult[] | undefined,
): boolean {
  return holdings.length === 0 || selectHoldingReportTargets(holdings, holdingDetails).length > 0;
}
