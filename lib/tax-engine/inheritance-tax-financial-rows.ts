/**
 * §22 금융재산 분해 rows[] 집계 — inheritance-tax.ts에서 800줄 정책에 따라 분리 (2026-06-02).
 *
 * financialDeductionDetail.rows 표시용. 공제 base(suggestNetFinancialAssets)와 정합:
 *   Σ(§22 적격 금융자산) − 금융채무(debtItem) − 담보 금융저당(collateral). §22② 최대주주 제외.
 *
 * M-5 수정 (2026-06-04):
 *   isFinancialAssetEligible(엔진 단일 헬퍼)로 판정 통일 →
 *   unlisted_stock undefined·cash_trust 신탁 누락(dual-truth) 해소.
 *   (lib/calc/financial-deduction-resolver import 금지 — lib/tax-engine 측 헬퍼 사용)
 */
import type {
  DebtItem,
  DerivedCollateralDebt,
  EstateItem,
  FinancialBreakdownRow,
} from "./types/inheritance-gift.types";
import { resolveEstateItemValue } from "./valuation/resolve-estate-item-value";
import { sumCollateralFinancialDebt } from "./inheritance-collateral-debt";
import { isFinancialAssetEligible } from "./inheritance-tax-financial-eligibility";

export function buildPhaseDFinancialRows(
  estateItems: EstateItem[],
  debtItems: DebtItem[] | undefined,
  collateralDebts: DerivedCollateralDebt[],
): FinancialBreakdownRow[] {
  // 자산 종류별 집계: 예금·상장주식·보험금·기타금융 구분
  let depositTotal = 0;
  let listedStockTotal = 0;
  let insuranceTotal = 0;
  let otherFinancialTotal = 0;
  for (const item of estateItems) {
    // §22 적격 판정 — 단일 헬퍼(isFinancialAssetEligible)로 판정.
    // 우선순위: §22② 최대주주 강제 배제 > 명시값 > deemedCategory > 카테고리 default.
    if (!isFinancialAssetEligible(item)) continue;
    const val = resolveEstateItemValue(item);
    if (val <= 0) continue;
    // 표시 레이블 분류 (§22 적격 통과 후)
    if (item.deemedCategory === "insurance") {
      insuranceTotal += val;
    } else if (item.category === "listed_stock") {
      listedStockTotal += val;
    } else if (item.category === "financial") {
      depositTotal += val;
    } else {
      // unlisted_stock(undefined/true), cash_trust, 명시 포함 기타 자산
      otherFinancialTotal += val;
    }
  }
  // 금융채무 집계 (category=financial debtItem)
  let financialDebtTotal = 0;
  for (const debt of debtItems ?? []) {
    if (debt.category !== "financial") continue;
    if (debt.isFinancialDebtForDeduction === false) continue;
    financialDebtTotal += debt.amount;
  }
  // 담보 금융저당 (estate item §14 자동공제 ON + 금융채무) — §22 순금융 차감.
  // suggestNetFinancialAssets(공제 base, deduction-suggest.ts:121)와 정합 —
  // 누락 시 표시 rows 합 > 실제 공제 base 가 되는 dual-truth 발생.
  const collateralFinancialTotal = sumCollateralFinancialDebt(collateralDebts);
  const rows: FinancialBreakdownRow[] = [];
  if (depositTotal > 0) rows.push({ label: "예금", amount: depositTotal });
  if (listedStockTotal > 0) rows.push({ label: "상장주식", amount: listedStockTotal });
  if (insuranceTotal > 0) rows.push({ label: "보험금", amount: insuranceTotal });
  if (otherFinancialTotal > 0) rows.push({ label: "기타금융", amount: otherFinancialTotal });
  if (financialDebtTotal > 0) rows.push({ label: "금융채무", amount: financialDebtTotal });
  if (collateralFinancialTotal > 0)
    rows.push({ label: "담보 금융저당", amount: collateralFinancialTotal });
  return rows;
}
