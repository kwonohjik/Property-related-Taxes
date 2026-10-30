/**
 * 부담부증여 인수 채무(임대보증금 + 담보차입금) — 자산 하나 / 함께 양도 묶음(신고 단위) 합계. ④(주 자산 `transferPrice` placeholder)와 ⑧(묶음의 채무 > 0 판정)이 같은 leaf 를 쓴다.
 *
 * 함께 부담부증여 묶음은 채무를 **신고 단위로** 본다 — 채무는 설정된 물건에만 입력하고, 시스템이 합계를 자산별 평가액 비율로 재배분한다(소령 §159 · `apportionCompanionBurdenedGiftDebt`).
 * 그래서 어느 한 자산(주 자산 포함)의 채무가 0 이어도 정상 입력이다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function burdenedGiftAssumedDebtOf(asset: Pick<AssetForm, "bgLendingDepositTotal" | "bgMortgageDebtAmount">): number {
  return (parseAmount(asset.bgLendingDepositTotal) || 0) + (parseAmount(asset.bgMortgageDebtAmount) || 0);
}

/** 묶음 전 자산의 인수 채무 합계(부담부증여가 아닌 자산은 칸이 비어 0). */
export function burdenedGiftAssumedDebtTotal(assets: ReadonlyArray<Pick<AssetForm, "bgLendingDepositTotal" | "bgMortgageDebtAmount">>): number {
  return assets.reduce((sum, a) => sum + burdenedGiftAssumedDebtOf(a), 0);
}
