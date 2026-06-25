/**
 * §41의2 초과배당 — 정산 2-pass 및 구법 산출세액공제
 *
 * 단방향 의존: gift-deemed/ → gift-tax.ts (역방향 아님)
 * 현행(2021~): 율표 소득세 기준 당초 증여세 → 실제소득세 기준 정산 증여세
 * 구법(2018~2020): calcGiftTax 1회 → min(소득세상당액, 산출세액) 공제
 */
import { calcGiftTax } from "../gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
} from "../types/inheritance-gift.types";
import type { ExcessDividendGiftTaxContext, ExcessDividendDetail } from "./types";
import type { DonorRelation } from "../types/inheritance-gift-deduction.types";

// ──────────────────────────────────────────────────────────────
// 내부 헬퍼: 최소 GiftTaxInput 구성
// ──────────────────────────────────────────────────────────────

/**
 * 정산용 최소 GiftTaxInput 조립.
 * 초과배당 deemedGiftValue를 재산 1건으로 구성.
 */
function buildMinimalGiftTaxInput(
  deemedGiftValue: number,
  dividendDate: Date,
  context: ExcessDividendGiftTaxContext,
): GiftTaxInput {
  const giftDateStr = dividendDate.toISOString().slice(0, 10);

  // ExcessDividendGiftTaxContext.donorRelationship → DonorRelation 매핑
  const donorRelation: DonorRelation = context.donorRelationship;

  // 재산 1건 구성 (초과배당 deemedGiftValue)
  const giftItem: EstateItem = {
    id: "excess_dividend_item",
    category: "financial", // 금융자산 카테고리
    name: "초과배당 증여재산",
    marketValue: deemedGiftValue,
  };

  // 기증여 공제 계산
  const priorDeductionApplied = context.priorDeductionApplied ?? 0;

  return {
    giftDate: giftDateStr,
    donorRelation,
    donor: "other", // 법인 배당 → 증여자는 법인/기타
    giftItems: [giftItem],
    priorGiftsWithin10Years: [],
    isGenerationSkip: context.isGenerationSkip ?? false,
    isMinorDonee: context.isMinorGenerationSkip ?? false,
    deductionInput: {
      donorRelation,
      priorUsedDeduction: priorDeductionApplied,
    },
    creditInput: {
      isFiledOnTime: context.isWithinFilingDeadline ?? true,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// 현행(2021~) 정산 2-pass
// ──────────────────────────────────────────────────────────────

/**
 * §41의2②③ 정산 2-pass (현행 2021~).
 *
 * Pass 1 (㉮): 율표 소득세 기준 초과배당 deemedGiftValue → 당초 증여세
 * Pass 2 (⑭): 실제소득세 기준 재산정 deemedGiftValue → 정산 증여세
 * 정산납부액 = 정산 − 당초 (음수: 환급)
 */
export function runSettlement2Pass(params: {
  excessDividendAmount: number;
  initialIncomeTax: number;    // ㉮ 율표 소득세 (pass 1 기준)
  actualIncomeTax: number;     // ⑭ 실제소득세 (pass 2 기준)
  dividendDate: Date;
  giftTaxContext: ExcessDividendGiftTaxContext;
}): ExcessDividendDetail["settlement"] {
  const { excessDividendAmount, initialIncomeTax, actualIncomeTax, dividendDate, giftTaxContext } =
    params;

  // Pass 1: 당초 증여세 (율표 소득세 기준 deemedGiftValue)
  const initialDeemedValue = Math.max(0, excessDividendAmount - initialIncomeTax);
  const pass1Input = buildMinimalGiftTaxInput(initialDeemedValue, dividendDate, giftTaxContext);
  const pass1Result = calcGiftTax(pass1Input);
  const initialGiftTax = pass1Result.finalTax;

  // Pass 2: 정산 증여세 (실제소득세 기준 deemedGiftValue)
  const settlementDeemedValue = Math.max(0, excessDividendAmount - actualIncomeTax);
  const pass2Input = buildMinimalGiftTaxInput(settlementDeemedValue, dividendDate, giftTaxContext);
  const pass2Result = calcGiftTax(pass2Input);
  const settlementGiftTax = pass2Result.finalTax;

  const settlementDue = settlementGiftTax - initialGiftTax;
  const isRefund = settlementDue < 0;

  return {
    initialGiftTax,
    settlementGiftTax,
    settlementDue,
    isRefund,
  };
}

// ──────────────────────────────────────────────────────────────
// 구법(2018~2020) 산출세액공제
// ──────────────────────────────────────────────────────────────

/**
 * 구법 §41의2 산출세액공제.
 * 과세표준 = 초과배당금액 전액 → calcGiftTax → 산출세액 산정
 * legacyCreditAmount = min(소득세상당액, 산출세액)
 * finalTax = 산출세액 − legacyCreditAmount (0 미만 없음)
 *
 * anchor A5: excessDividendAmount=400M, incomeTaxEquivalent=134.6M
 *   → calcGiftTax(400M, 기타친족 공제1천만) → 산출세액 57M
 *   → min(134.6M, 57M) = 57M → finalTax = 0
 */
export function runLegacyCredit(params: {
  excessDividendAmount: number;
  incomeTaxEquivalent: number;
  dividendDate: Date;
  giftTaxContext: ExcessDividendGiftTaxContext;
}): ExcessDividendDetail["legacyCredit"] {
  const { excessDividendAmount, incomeTaxEquivalent, dividendDate, giftTaxContext } = params;

  // 과세표준 = 초과배당금액 전액 (구법: 소득세 미차감)
  const giftInput = buildMinimalGiftTaxInput(excessDividendAmount, dividendDate, giftTaxContext);
  const giftResult = calcGiftTax(giftInput);
  const grossGiftTax = giftResult.computedTax + giftResult.generationSkipSurcharge;

  // legacyCreditAmount = min(소득세상당액, 산출세액) — 상한: 산출세액
  const legacyCreditAmount = Math.min(incomeTaxEquivalent, grossGiftTax);
  // finalTax = 산출세액 − 공제 (0 미만 없음)
  const finalTax = Math.max(0, grossGiftTax - legacyCreditAmount);

  return {
    grossGiftTax,
    legacyCreditAmount,
    finalTax,
  };
}
