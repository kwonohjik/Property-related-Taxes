/**
 * §22 금융재산 분해 rows[] 집계 — inheritance-tax.ts에서 800줄 정책에 따라 분리 (2026-06-02).
 *
 * financialDeductionDetail.rows 표시용. 공제 base(suggestNetFinancialAssets)와 정합:
 *   Σ(§22 적격 금융자산) − 금융채무(debtItem) − 담보 금융저당(collateral). §22② 최대주주 제외.
 * (lib/calc/financial-deduction-resolver import 금지 — 판정 로직 인라인, 판정 기준 §22①·②)
 */
import type {
  DebtItem,
  DerivedCollateralDebt,
  EstateItem,
  FinancialBreakdownRow,
} from "./types/inheritance-gift.types";
import { resolveEstateItemValue } from "./valuation/resolve-estate-item-value";
import { sumCollateralFinancialDebt } from "./inheritance-collateral-debt";

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
    // §22② 최대주주 강제 배제 (엔진 내부 판정 — lib/calc 미사용)
    const isMajorShareholder =
      item.isSection22MajorShareholder === true ||
      item.unlistedStockValuationV2?.isSection22MajorShareholder === true;
    if (isMajorShareholder) continue;
    // 사용자 명시 배제
    if (item.isFinancialAssetForDeduction === false) continue;
    // §22 적격 판정 (카테고리 기반 — financial·listed_stock + deemedCategory insurance)
    const val = resolveEstateItemValue(item);
    if (val <= 0) continue;
    if (item.deemedCategory === "insurance") {
      insuranceTotal += val;
    } else if (item.category === "listed_stock") {
      listedStockTotal += val;
    } else if (item.category === "financial") {
      // 사용자 명시 포함이거나 카테고리 default true
      if (item.isFinancialAssetForDeduction === true || item.isFinancialAssetForDeduction === undefined) {
        depositTotal += val;
      }
    } else if (item.category === "unlisted_stock") {
      if (item.isFinancialAssetForDeduction === true) {
        otherFinancialTotal += val;
      }
    } else {
      // 그 외: 사용자 명시 포함만
      if (item.isFinancialAssetForDeduction === true) {
        otherFinancialTotal += val;
      }
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
