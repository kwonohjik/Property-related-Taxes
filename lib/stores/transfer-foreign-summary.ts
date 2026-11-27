/**
 * ⑥ 국외자산 부동산 사이드바 합계 — **순수 함수** (소득세법 §118의2~§118의8).
 *
 * 호출부는 `useMemo(() => computeForeignRealEstateSummary(formData, result), [...])` — 새 객체를 돌려주므로
 * zustand selector에 직접 쓰지 않는다(`useSyncExternalStore` 무한 루프).
 *
 * - 계산 **전**: 입력으로 계산할 수 있는 항목만 — 자산별 양도가액·취득가액·필요경비(자본적지출 + 양도비)의 원화 환산.
 *   환산은 엔진 leaf(`tryToKrw`)를 그대로 쓴다(인라인 floor 복제 금지). 입력이 비었거나 환산할 수 없는 칸은 0으로 두고 표시하지 않는다.
 * - 계산 **후**: 엔진 값(`result.rows`·합계) — 양도차익·양도소득금액·기본공제·과세표준·산출세액·외국납부세액공제·총 납부세액.
 * - 0원·null은 항목을 만들지 않는다(표시 규약 — `components/calc/CLAUDE.md`).
 */
import { parseDecimal } from "@/lib/calc/number-parse";
import { foreignAssetLabel } from "@/lib/calc/transfer-foreign-body";
import type { ForeignMoneyRowForm } from "@/lib/stores/calc-wizard-form-foreign";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { tryToKrw } from "@/lib/tax-engine/foreign-realestate/fx";

export interface ForeignSummaryRow {
  /** 0-based 카드 순번 */
  index: number;
  label: string;
  transferKrw: number;
  acquisitionKrw: number;
  /** 자본적지출 + 양도비 (원화 환산 합) */
  expenseKrw: number;
}

export interface ForeignRealEstateSummary {
  rows: ForeignSummaryRow[];
  totalTransferKrw: number;
  totalAcquisitionKrw: number;
  totalExpenseKrw: number;
  /** 결과 도착 후에만 — 그 전에는 null */
  hasResult: boolean;
  /** §118의2 5년 미만 — 세액 0 */
  notLiable: boolean;
  capitalGainTotal: number | null;
  incomeAmountTotal: number | null;
  basicDeduction: number | null;
  taxBase: number | null;
  calculatedTax: number | null;
  foreignTaxCreditApplied: number | null;
  localIncomeTax: number | null;
  totalTax: number | null;
}

/** 입력 문자열 한 쌍 → 원화(환산할 수 없으면 0). 엔진 환산 leaf와 같은 값. */
function krw(amount: string, rate: string): number {
  if (amount.trim() === "" || rate.trim() === "") return 0;
  const r = tryToKrw(parseDecimal(amount), parseDecimal(rate));
  return "krw" in r ? r.krw : 0;
}

const rowsKrw = (rows: readonly ForeignMoneyRowForm[]) => rows.reduce((s, r) => s + krw(r.amountForeign, r.exchangeRate), 0);

const orNull = (n: number): number | null => (n > 0 ? n : null);

type SummaryForm = Pick<TransferFormData, "foreignAssets">;

export function computeForeignRealEstateSummary(
  form: SummaryForm,
  result: ForeignRealEstateResult | null,
): ForeignRealEstateSummary {
  const rows: ForeignSummaryRow[] = result
    ? result.rows.map((r, index) => ({
        index,
        label: foreignAssetLabel(index),
        transferKrw: r.transferValueKrw,
        acquisitionKrw: r.acquisitionValueKrw,
        expenseKrw: r.capitalExpenditureKrw + r.transferCostKrw,
      }))
    : form.foreignAssets.map((a, index) => ({
        index,
        label: foreignAssetLabel(index),
        transferKrw: krw(a.transferAmount, a.transferRate),
        acquisitionKrw: krw(a.acquisitionAmount, a.acquisitionRate),
        expenseKrw: rowsKrw(a.capitalRows) + rowsKrw(a.costRows),
      }));
  const sum = (pick: (r: ForeignSummaryRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
  const liable = result?.isLiable === true;
  return {
    rows,
    totalTransferKrw: sum((r) => r.transferKrw),
    totalAcquisitionKrw: sum((r) => r.acquisitionKrw),
    totalExpenseKrw: sum((r) => r.expenseKrw),
    hasResult: result !== null,
    notLiable: result !== null && !result.isLiable,
    // 양도차익은 차손일 수 있어 0만 숨긴다(음수는 그대로 보인다)
    capitalGainTotal: result && result.capitalGainTotal !== 0 ? result.capitalGainTotal : null,
    incomeAmountTotal: liable ? orNull(result.incomeAmountTotal) : null,
    basicDeduction: liable ? orNull(result.basicDeduction) : null,
    taxBase: liable ? orNull(result.taxBase) : null,
    calculatedTax: liable ? orNull(result.calculatedTax) : null,
    foreignTaxCreditApplied: liable ? orNull(result.foreignTaxCreditApplied) : null,
    localIncomeTax: liable ? orNull(result.localIncomeTax) : null,
    totalTax: liable ? orNull(result.totalTax) : null,
  };
}
