/**
 * 양도세 STEP 4.5~6 — 양도소득금액 · 차감형 감면(§99의3·§99·§98의8) · 기본공제 · 과세표준.
 *
 * `transfer-tax.ts` 800줄 정책 분리 — 로직은 오케스트레이터에서 **그대로** 옮겼다(동작 불변).
 */
import { TRANSFER } from "./legal-codes";
import { calcBasicDeduction } from "./transfer-tax-helpers";
import type { ParsedRates } from "./transfer-tax-helpers";
import { buildIncomeDeductionStep, resolveIncomeDeduction } from "./transfer-reductions/income-deduction-router";
import type { New993Result } from "./transfer-reductions/new-99-3";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";

export function runIncomeAndBaseSteps(args: {
  input: TransferTaxInput;
  effectiveInput: TransferTaxInput;
  parsedRates: ParsedRates;
  taxableGain: number;
  longTermHoldingDeduction: number;
  steps: CalculationStep[];
}) {
  const { input, effectiveInput, parsedRates, taxableGain, longTermHoldingDeduction, steps } = args;
  // STEP 4.5: 양도소득금액 = 양도차익 − 장기보유특별공제 (소득세법 §95 ①)
  const transferIncomeBefore993 = Math.max(0, taxableGain - longTermHoldingDeduction);
  steps.push({
    label: "양도소득금액",
    formula: `양도차익 ${taxableGain.toLocaleString()} - 장기보유특별공제 ${longTermHoldingDeduction.toLocaleString()}`,
    amount: transferIncomeBefore993,
    legalBasis: TRANSFER.LONG_TERM_DEDUCTION,
  });

  // STEP 4.6: 차감형 감면(§99의3·§99·§98의8) — 양도소득금액 차감 방식 (income-deduction-router)
  // 5년 내 = 발생분 전액(§98의8은 50%) / 5년 후 = 기준시가 안분. 농특세는 finalize 2-pass.
  let transferIncome = transferIncomeBefore993;
  // 조특법 §129② — 미등기면 차감형도 적용하지 않는다(D15, `unregisteredReductionNotice`).
  const incomeDeduction = resolveIncomeDeduction(input.isUnregistered ? undefined : input.reductions, {
    transferDate: input.transferDate,
    acquisitionDate: input.acquisitionDate,
    assetContractDate: input.assetContractDate,
    transferPrice: input.transferPrice,
    // 고가주택 가액 요건은 물건 전체 기준 — §89 12억 안분(:447-465)과 같은 소스를 쓴다.
    totalPropertyTransferPrice: input.totalPropertyTransferPrice,
    standardPriceAtTransfer: input.standardPriceAtTransfer,
    transferIncome: transferIncomeBefore993,
  });
  const new993PreliminaryResult: New993Result | undefined = incomeDeduction.new993Detail;
  if (incomeDeduction.appliedId) {
    transferIncome = Math.max(0, transferIncomeBefore993 - incomeDeduction.reducible);
  }
  if (incomeDeduction.stepLabel) {
    steps.push(buildIncomeDeductionStep(incomeDeduction, transferIncomeBefore993, transferIncome));
  }

  // STEP 5: 기본공제 (aggregate 엔진에서 호출 시 skipBasicDeduction=true로 스킵)
  const basicDeduction = effectiveInput.skipBasicDeduction
    ? 0
    : calcBasicDeduction(
        taxableGain,
        longTermHoldingDeduction,
        effectiveInput.annualBasicDeductionUsed,
        effectiveInput.isUnregistered,
        parsedRates.basicDeductionRules,
      );
  if (!effectiveInput.skipBasicDeduction) {
    steps.push({
      label: "기본공제",
      formula: `연 한도 ${parsedRates.basicDeductionRules.annualLimit.toLocaleString()} - 기사용 ${effectiveInput.annualBasicDeductionUsed.toLocaleString()}`,
      amount: basicDeduction,
      legalBasis: TRANSFER.BASIC_DEDUCTION,
    });
  }

  // STEP 6: 과세표준 = 양도소득금액 − 기본공제 (소득세법 §92 — 원 단위, 절사 규정 없음)
  const taxBase = Math.max(0, transferIncome - basicDeduction);
  steps.push({
    label: "과세표준",
    formula: `양도소득금액 ${transferIncome.toLocaleString()} - 기본공제 ${basicDeduction.toLocaleString()}`,
    amount: taxBase,
    legalBasis: TRANSFER.TAX_BASE_CALC,
  });
  return { transferIncome, incomeDeduction, new993PreliminaryResult, basicDeduction, taxBase, transferIncomeBefore993 };
}
