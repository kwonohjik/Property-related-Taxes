/**
 * 주식 양도소득세 다자산 합산 — **기타자산 그룹(§103①1호) 종목 1건** 처리
 *
 * `stock-transfer-aggregate.ts`가 781줄에 닿아 분리했다(800줄 정책 · 착지 목표 ≤700).
 * 이음매는 **§102①·§103① 「호」 축**이다 — 이 파일은 §103①**1호** 그룹(기타자산 §94①4호)
 * 종목 하나를 처리하고, 주식(§103①2호)·국외주식 분기와 오케스트레이션은 원래 파일에 남는다.
 *
 * ## 왜 「패치」인가 — 다시 돌리면 통산이 사라진다
 *
 * 종전에는 이 자리가 `calculateStockTransferTaxInternal(입력)`을 **통째로 다시 돌렸다**.
 * 그 구조에는 §102② 통산 후 소득을 주입할 자리가 없어, 기타자산 그룹은 차손이 있어도 세액이
 * **한 푼도 줄지 않았다** — 실측: 이익 1천만 + 차손 5백만에서 450,000(이익 단독과 동일),
 * 법령 정합값 150,000 대비 **3배 과대**.
 *
 * ⇒ 단건 엔진 결과(`raw`)를 바탕으로 **통산 후 소득부터 다시 계산**한다. 주식 분기가 쓰는
 *   규약과 같다(`stock-transfer-aggregate.ts` STEP 2 주식 갈래).
 *
 * ## 🔴 §104⑤ 호별 echo를 «함께» 다시 쓰지 않으면 조용히 틀린다
 *
 * `clause1BucketTaxBase`·`clause1BucketTax`·`clause9TaxBase`·`clause9Tax`·`cross1045Adjustment`
 * 다섯은 전부 `taxBase`·`calculatedTax` 파생이다(`stock-transfer-tax.ts:464-495`). `...recalc`
 * spread 는 **통산 전** 값을 그대로 덮어오는데, 그 값은 §104⑤ 크로스 조정 레이어
 * (`comparative-104-5-cross.ts`)가 부동산 §104①8호와 한 버킷으로 재합산할 때 읽는다.
 * 어긋나면 **주식 신고서에는 아무 흔적도 남지 않고 부동산 쪽만 틀린다.**
 * anchor: `__tests__/tax-engine/stock-transfer/loss-offset-102-2.anchor.test.ts` M-10-5.
 *
 * 계획서: docs/00-pm/stock-multi-asset-filing-loss-offset.plan.md §4.2 · §4.3
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { calculateStockTransferTaxInternal } from "./stock-transfer-tax";
import { floorTen } from "./stock-transfer-helpers";
import { applyStockTaxRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import { NBL_HEAVY_CORP_CATEGORIES } from "./stock-rate-tables";
import { NBL_HEAVY_CORP_BRACKETS } from "./stock-rate-tables";
import { computeCross89Adjustment } from "@/lib/tax-engine/comparative-104-5-cross";
import { BASIC_DEDUCTION_LIMIT } from "./stock-transfer-aggregate-deduction";
// 중소기업 판정은 정본 leaf를 그대로 쓴다 — 손술어 사본을 만들지 않는다
// ([[feedback_leaf_unification_leaves_one_handwritten_predicate]]).
import { smeFlag } from "./foreign-stock-aggregate-adapter";

export interface OtherAssetItemOutcome {
  result: StockTransferResult;
  /** 이 종목이 실제로 쓴 §103①1호 기본공제 — 호출자가 누적한다. */
  deducted: number;
}

/**
 * 기타자산 종목 1건을 **통산 후 소득 기준**으로 다시 계산한다.
 *
 * @param input            원본 입력
 * @param raw              단건 엔진 결과(기본공제 0으로 계산된 것 — 호출자 STEP 1)
 * @param income           §102② 통산 후 양도소득금액
 * @param otherAssetUsed   이 종목 **이전까지** 그룹이 소진한 기본공제(부동산 기소진액 포함)
 */
export function processOtherAssetItem(
  input: StockTransferInput,
  raw: StockTransferResult,
  income: number,
  otherAssetUsed: number,
): OtherAssetItemOutcome {
  // §103① 잔여 한도 안에서만 공제한다. §103②(먼저 양도한 자산부터)는 호출자의 순회 순서가 정한다.
  const remaining = Math.max(0, BASIC_DEDUCTION_LIMIT - otherAssetUsed);
  const deducted = Math.min(Math.max(0, income), remaining);

  // 단건 엔진은 **기본공제 외의** 필드(분류·평가·증권거래세 echo 등)를 위해 그대로 부른다.
  // 여기서 넘기는 `realEstateGroupBasicDeductionUsed`는 누적 후 값이라 엔진 자체 공제는 0이 된다.
  const recalc = calculateStockTransferTaxInternal({
    ...input,
    realEstateGroupBasicDeductionUsed: otherAssetUsed + deducted,
  });

  const taxBase = Math.floor(Math.max(0, income - deducted));
  const rateResult = applyStockTaxRate(
    taxBase,
    raw.taxCategory,
    smeFlag(input),
    raw.isShortTermHolding,
    raw.isExempt, // 비과세 분기 산식 echo — 호출자가 먼저 조기 반환하므로 항상 false
  );
  const calculatedTax = floorTen(rateResult.calculatedTax);
  const finalize = finalizeStockTax(calculatedTax, input);

  /** §104①9호(비사업용토지 과다소유법인) 버킷인가 — 영 §167의7 「100분의 50 이상」 */
  const isClause9 = NBL_HEAVY_CORP_CATEGORIES.has(raw.taxCategory);

  return {
    deducted,
    result: {
      ...recalc,
      transferIncome: income,
      basicDeduction: deducted,
      taxBase,
      appliedRate: rateResult.appliedRate,
      progressiveDeduction: rateResult.progressiveDeduction,
      calculatedTax,
      underReportPenalty: finalize.underReportPenalty,
      latePaymentPenalty: finalize.latePaymentPenalty,
      electronicFilingCredit: finalize.electronicFilingCredit,
      finalTax: finalize.finalTax,
      localIncomeTax: finalize.localIncomeTax,
      // §104⑤ 크로스 조정용 호별 echo — 위 🔴 참조.
      clause1BucketTaxBase: isClause9 ? 0 : taxBase,
      clause1BucketTax: isClause9 ? 0 : calculatedTax,
      clause9TaxBase: isClause9 ? taxBase : 0,
      clause9Tax: isClause9 ? calculatedTax : 0,
      // `cross1045Adjustment`는 사용자가 `crossClause8TaxBase`를 넣었을 때만 생기고
      // `clause9TaxBase: taxBase`로 계산된다 → 통산 후 값으로 재산정.
      ...(recalc.cross1045Adjustment && isClause9
        ? {
            cross1045Adjustment: computeCross89Adjustment({
              clause8TaxBase: input.crossClause8TaxBase ?? 0,
              clause9TaxBase: taxBase,
              nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
            }),
          }
        : {}),
    },
  };
}
