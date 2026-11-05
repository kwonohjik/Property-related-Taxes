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
import { reductionAcquisitionCauseOf } from "./transfer-reductions/new-99-acquisition-cause";
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
    // 부담부증여는 `input.transferPrice`가 채무액 placeholder라 증여가액(STEP 0.48이 `effectiveInput`에 싣는다)이 우선한다 — §89 판정과 같은 소스 (NH-10).
    burdenedGiftDenominator: effectiveInput.burdenedGiftDenominator,
    // 토지만 본인 소유면 §99·§99의3 불성립 — STEP 0.45 중과 배제 선판정과 같은 값 (NH-08).
    selfOwns: effectiveInput.selfOwns,
    // 상속·증여(지분 포함)로 받은 주택은 §99·§99의3 불성립 (NH-03 · NH-17 · NH-40) — 이월과세 B는 실제 취득 원인 (NH-34)
    acquisitionCause: reductionAcquisitionCauseOf(input),
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
