/**
 * 국외주식 → 다종목 aggregate 편입 어댑터
 *
 * 계획서: docs/02-design/features/foreign-stock-118-6-limit-bc-apportionment.plan.md (§6.1 · Phase 4)
 *
 * ## 왜 어댑터가 필요한가
 *
 * 국내주식과 국외주식은 **3중으로 갈라져 있다**:
 *
 * |        | 국내주식                              | 국외주식                    |
 * |--------|---------------------------------------|-----------------------------|
 * | 입력   | `StockTransferInput`                  | `ForeignStockInput`         |
 * | 엔진   | `calculateStockTransferTaxInternal`   | `calculateForeignStockTax`  |
 * | 결과   | `StockTransferResult`                 | `ForeignStockResult`        |
 *
 * 그런데 **법령·서식은 둘을 한 그룹으로 본다**:
 *   · §102①2호 — 「제94조제1항제3호에 따른 소득」 한 호 ⇒ 양도차손 **통산 대상**
 *   · §103①2호 — 같은 호 ⇒ 기본공제 250만원 **공동 그룹**
 *   · 별지 제84호서식 부표 2 — 국외주식 코드(61·62)가 국내 코드와 **같은 코드표**에 있고,
 *     작성요령 7번이 「주식은 … **국내ㆍ국외주식 양도소득금액 통산액**에서 연 250만원을 공제」라 한다.
 *
 * ⇒ aggregate 파이프라인(통산 → 기본공제 배분 → 세율)에 **같은 배열로** 들어가야 한다.
 *   그래서 결과를 `StockTransferResult`로 변환한다.
 *
 * ## ⚠️ 변환에서 「없는 것」은 만들어내지 않는다
 *
 * 국내 전용 필드는 **의미 없는 값을 지어내지 않고** 중립값으로 둔다(대주주 판정·상장 관련 등).
 * 특히 **가산세·전자신고세액공제는 0**이다 — `calculateForeignStockTax`가 애초에 계산하지 않기
 * 때문이며, 이 어댑터가 임의로 채우면 단건 경로와 다종목 경로의 세액이 갈린다.
 * (국외주식 가산세 미구현은 이 작업과 **별개의 기존 갭**이다.)
 */

import type {
  StockTransferResult,
} from "./types/stock-transfer.types";
import type {
  ForeignStockInput,
  ForeignStockResult,
} from "./types/foreign-stock.types";
import type { StockTransferInput } from "./types/stock-transfer.types";

/** aggregate가 받는 종목 1건 — 국내 또는 국외 */
export type AggregateStockItemInput = StockTransferInput | ForeignStockInput;

/**
 * 국외주식 입력인지 판별.
 *
 * `marketType === "foreign_stock"`은 **`ForeignStockInput`에만** 있는 값이다
 * (`StockTransferInput.marketType`은 kospi·kosdaq·konex·unlisted·other_asset 5종).
 */
export function isForeignStockItem(
  input: AggregateStockItemInput,
): input is ForeignStockInput {
  return (input as ForeignStockInput).marketType === "foreign_stock";
}

/**
 * `ForeignStockResult` → `StockTransferResult`.
 *
 * 세액 관련 값은 **그대로 옮긴다**. 단건 경로와 값이 갈리면 안 된다.
 * 기본공제 재배분(§103②)과 외국납부세액 한도 안분(§118의6①1호 B/C)은
 * `stock-transfer-aggregate.ts`가 이 결과를 받아 **뒤에서** 패치한다.
 */
export function toStockTransferResult(
  input: ForeignStockInput,
  r: ForeignStockResult,
): StockTransferResult {
  const holdingDays = Math.max(
    0,
    Math.floor(
      (input.transferDate.getTime() - input.acquisitionDate.getTime()) / 86_400_000,
    ),
  );

  return {
    // §118의2 5년 요건 미충족이면 과세 대상이 아니다 — 그 상태를 그대로 옮긴다.
    taxCategory: r.isLiable ? "foreign_stock" : "out_of_scope_foreign",
    appliedSection94: "①3다",
    section94_2Applied: false,
    // 국외주식에 비과세 조문은 없다(K-OTC 중소·벤처 비과세는 국내 전용).
    // 5년 미충족은 「비과세」가 아니라 **납세의무 자체가 없는** 것이라 isExempt로 표현하지 않는다.
    isExempt: false,

    transferPrice: r.transferPriceKrw,
    acquisitionPrice: r.acquisitionPriceKrw,
    // §118의4 — 환산취득가액 제도가 없다(§97② 경로가 오지 않는다).
    acquisitionMode: "actual",
    usedEstimatedAcquisition: false,

    basicDeductionGroup: "stock",
    expenses: r.necessaryExpensesKrw,
    expenseMode: "actual",

    transferIncome: r.transferGain,
    basicDeduction: r.basicDeduction,
    taxBase: r.taxBase,
    appliedRate: r.appliedRate,
    progressiveDeduction: r.progressiveDeduction,
    calculatedTax: r.incomeTax,

    // ⚠️ 국외주식 엔진은 가산세·전자신고세액공제를 계산하지 않는다(기존 갭). 0으로 옮긴다.
    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,
    finalTax: r.finalTax,
    localIncomeTax: r.localIncomeTax,

    holdingPeriodMonths: Math.floor(holdingDays / 30),
    holdingPeriodDays: holdingDays,
    // §104①12호에 보유기간 구분이 없다 — 「1년 미만 30%」는 가·나목 전용이라 다목에 오지 않는다.
    isShortTermHolding: false,
    lthdStartDate: null,

    acquiredBeforeListing: false,

    // §104⑤ 비교과세 호별 echo — 국외주식은 §94①**3호**다목이라 §104⑤(1호·2호 및 4호) 대상이
    // **아니다**. 국내 주식 그룹과 같은 이유로 전부 0이다.
    clause1BucketTaxBase: 0,
    clause1BucketTax: 0,
    clause9TaxBase: 0,
    clause9Tax: 0,

    warnings: r.warnings,
    // 상위 `appliedRules`는 국내 분기 **태그 union**이라 조문 문자열을 섞지 않는다.
    // 국외 엔진이 만든 목록은 `foreignDetail.appliedRules`에 그대로 보존한다.
    appliedRules: ["국외주식§118②준용"],

    // 국외주식 전용 값 — 결과 카드·신고서식이 종목별로 쓴다.
    foreignDetail: {
      appliedRules: r.appliedRules,
      stockName: input.stockName,
      countryCode: input.countryCode,
      shareCount: r.shareCount,
      transferExchangeRate: r.transferExchangeRate,
      acquisitionExchangeRate: r.acquisitionExchangeRate,
      foreignTaxExchangeRate: r.foreignTaxExchangeRate,
      foreignTaxPaidKrw: r.foreignTaxPaidKrw,
      foreignTaxCreditLimit: r.foreignTaxCreditLimit,
      foreignTaxCreditApplied: r.foreignTaxCreditApplied,
      foreignTaxExpenseApplied: r.foreignTaxExpenseApplied,
      transferReceiptDetail: r.transferReceiptDetail,
      ineligibleReason: r.ineligibleReason,
    },
  };
}
