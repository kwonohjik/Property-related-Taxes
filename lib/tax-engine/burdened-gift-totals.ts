/**
 * 부담부증여 §159 명세의 자산 합계 — 토지·건물 두 부분의 양도가액·취득가액·개산공제 합(소득세법 시행령 §159①).
 *
 * 표시 층(엔진 표시 echo · 신고서 · 계산명세서 · 사이드바 · 결과 카드)이 같은 합을 쓴다. 종전에는 결과 카드만 이 합을 읽고,
 * 다른 곳은 route 입력(화면에 없는 자산 일반 칸)이나 폼 계약금액을 읽어 취득가액 300,000,000(정본 250,000,000)·필요경비 음수·
 * 입주권 합계 취득가액 −400,000,000이 나왔다(계획서 `docs/00-pm/burdened-gift-display-acquisition.plan.md` §1).
 */
import type { TransferBurdenedGiftBreakdown } from "./types/transfer-burdened-gift.types";
import type { TransferTaxResult } from "./types/transfer.types";
import { redevBranchExpenseParts, redevFilingTotals, type RedevExpenseParts } from "./redev-acquisition-inverse";

export function burdenedGiftPerAssetTotals(brkd: Pick<TransferBurdenedGiftBreakdown, "perAsset">): {
  transferPrice: number;
  acquisitionPrice: number;
  estimatedDeduction: number;
} {
  const { land, building } = brkd.perAsset;
  return {
    transferPrice: (land?.transferPrice ?? 0) + (building?.transferPrice ?? 0),
    acquisitionPrice: (land?.acquisitionPrice ?? 0) + (building?.acquisitionPrice ?? 0),
    estimatedDeduction: (land?.estimatedDeduction ?? 0) + (building?.estimatedDeduction ?? 0),
  };
}

/**
 * §166 신고서 역산(`redevFilingTotals`)에 넣을 양도가액 — 부담부증여 §166 자산(원조합원 입주권 등)은 §159 양도가액이다.
 * 폼 계약금액은 부담부증여 화면에 칸이 없어 0이라, 그대로 넣으면 합계 취득가액이 `0 − 필요경비 − 차익`(음수)이 된다.
 */
export function redevInverseTransferPrice(
  result: Pick<TransferTaxResult, "redevelopmentDetail" | "transferBurdenedGiftBreakdown">,
  fallback: number,
): number {
  const bg = result.redevelopmentDetail ? result.transferBurdenedGiftBreakdown : undefined;
  return bg ? burdenedGiftPerAssetTotals(bg).transferPrice : fallback;
}

/**
 * 부담부증여 §166 자산(원조합원 입주권·재개발 완공 아파트)의 신고서 취득가액 합계·필요경비 분기별 구성 — 신고서 표(`FilingFormTableHelpers`)와 같은 역산.
 * 명세 카드가 인가 전 분(`perAsset`)과 이 합계를 잇는 데 쓴다. §166 자산이 아니거나 부담부증여가 아니면 undefined.
 * 취득가액과 필요경비를 한 호출에서 같은 인자로 구해 두 값이 갈리지 않게 한다.
 */
export function bgRedevFiling(
  result: Pick<TransferTaxResult, "redevelopmentDetail" | "transferBurdenedGiftBreakdown">,
): { acquisition: number; expenses: RedevExpenseParts } | undefined {
  if (!result.redevelopmentDetail || !result.transferBurdenedGiftBreakdown) return undefined;
  return {
    acquisition: redevFilingTotals(result.redevelopmentDetail, redevInverseTransferPrice(result, 0)).acquisition,
    expenses: redevBranchExpenseParts(result.redevelopmentDetail),
  };
}

export function bgRedevFilingAcquisition(
  result: Pick<TransferTaxResult, "redevelopmentDetail" | "transferBurdenedGiftBreakdown">,
): number | undefined {
  return bgRedevFiling(result)?.acquisition;
}

/**
 * 부담부증여 §159 명세 카드의 **필요경비 줄 판별**(계획서 `bg-card-necessary-expense-row.plan.md` Q-1~Q-4) — 단건·묶음 카드가 같은 값을 읽는다.
 *
 * `perAsset.*.estimatedDeduction` 슬롯은 개산공제만이 아니라 카드의 필요경비 전부다:
 *  · `swap`: 환산(K-5)에서 자본적지출·양도비가 환산취득가액 + 개산공제보다 커 §97②2호 단서 나목을 채택한 경우 — 슬롯 = (자본적지출 + 양도비) × 채무비율.
 *  · `actual`: 개산공제율 echo가 없는 경로(실지 K-4 · 의제취득일 전 ①② 실지거래가액 의제) — 슬롯 = (자본적지출 + 양도비) × 채무비율.
 *  · `estimated`: 개산공제 — 슬롯 = 취득시(의제 카드는 의제취득일) 기준시가 × 채무비율 × 개산공제율.
 * 이월과세 증여세 상당액(`carryoverGiftTax.applied`, 법 §97의2①3호)은 슬롯에 더해져 있으므로 떼어 별도로 돌려준다.
 * 판별 순서가 곧 우선순위다 — 환산 단서 나목 채택은 율 echo가 남아 있어 먼저 가른다.
 */
export type BgNecessaryExpenseView =
  | {
      kind: "actual" | "swap";
      amount: number;
      /** 실비 입력 echo — 없으면(파트별 계산 등) 문구가 입력값 없이 「자본적지출·양도비 × 채무비율」만 적는다. */
      input?: { capitalExpenditure: number; transferExpense: number };
      carryoverGiftTax: number;
    }
  | { kind: "estimated"; amount: number; stdBase: number; rate: number; carryoverGiftTax: number };

export function bgNecessaryExpenseOf(bg: TransferBurdenedGiftBreakdown): BgNecessaryExpenseView | undefined {
  const { land, building } = bg.perAsset;
  const slot = (land?.estimatedDeduction ?? 0) + (building?.estimatedDeduction ?? 0);
  const carryoverGiftTax = bg.carryoverGiftTax?.applied ?? 0;
  const amount = slot - carryoverGiftTax;
  if (amount <= 0 && carryoverGiftTax <= 0) return undefined;
  const input = bg.necessaryExpenseInput
    ? { capitalExpenditure: bg.necessaryExpenseInput.capitalExpenditure, transferExpense: bg.necessaryExpenseInput.transferExpense }
    : undefined;
  if (bg.necessaryExpenseSwap?.chosen === "direct") return { kind: "swap", amount, input, carryoverGiftTax };
  const rate = building?.estimatedDeductionRate ?? land?.estimatedDeductionRate;
  if (rate === undefined) return { kind: "actual", amount, input, carryoverGiftTax };
  return {
    kind: "estimated",
    amount,
    stdBase: (land?.stdPriceAtAcquisition ?? 0) + (building?.stdPriceAtAcquisition ?? 0),
    rate,
    carryoverGiftTax,
  };
}
