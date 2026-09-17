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
 * ⚠️ **가산세는 쓰임에 따라 갈린다** — 다종목 편입은 0(신고 단위로 1회 매겨진다), 단건 서식은
 * 엔진 값 그대로다(`ToStockTransferResultOptions`). 종전 주석은 「엔진이 애초에 계산하지
 * 않는다」였으나 **stale** 이었다 — `foreign-stock.ts:405·438-439`가 둘 다 계산한다.
 * 전자신고 세액공제는 국외주식 엔진에 개념이 없어 여전히 0이다.
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
 * 중소기업 플래그 — 국내(§104①11호나목1))·국외(§104①12호가목) 모두 세율을 가른다.
 *
 * 🔑 종전에는 국외를 무조건 false로 눌렀다. 영 §157의3 **2호**가 「내국법인이 발행한 주식등으로서
 *    해외 증권시장에 상장된 것」을 국외주식에 포함시키므로, 내국 중소기업의 해외상장 주식은
 *    §104①12호**가목 10%**에 닿는다. 미입력이면 나목 20%다(자동 추정 금지).
 */
export function smeFlag(input: AggregateStockItemInput): boolean {
  return isForeignStockItem(input)
    ? input.isSmallMediumEnterprise === true
    : input.isSmallMediumEnterprise;
}

/**
 * 변환이 **실제로 읽는** 입력 필드만 추린 타입.
 *
 * 🔑 `ForeignStockInput` 전체를 요구하면 **UI 단건 경로가 이 어댑터를 못 쓴다** — 결과 화면이
 *   들고 있는 것은 폼 문자열이지 Zod 를 통과한 엔진 input 이 아니고, 쓰이지도 않는 환율·통화·
 *   가산세 20여 개를 결과 화면에서 다시 지어내는 것은 **두 번째 진실**을 만드는 일이다.
 *   그래서 변환이 읽는 5개로 좁힌다. 엔진 호출부는 `ForeignStockInput` 을 그대로 넘기면 된다
 *   (구조적 타이핑 — 호출부 무변경).
 */
/**
 * 이 결과가 **신고 1건 전체**인가.
 *
 * 🔑 가산세는 국세기본법 §47조의2·§47조의3·§47조의4상 **신고 1건 단위 1회**다.
 *
 * | 쓰임 | `filingUnitIsThisItem` | 가산세 |
 * |---|---|---|
 * | 다종목 aggregate 편입 | `false`(기본) | **0** — `stock-transfer-aggregate.ts`가 신고 단위로 1회 매기고 `stripItemPenalties`가 종목별을 0으로 만든다. 여기서 실으면 **이중 계산**이다. |
 * | 단건 결과 화면·서식 | `true` | 엔진 값 그대로 — 그 종목이 곧 신고 1건이다. |
 *
 * 🔴 종전에는 옵션이 없어 **무조건 0**이었고, 그 근거 주석(「엔진이 애초에 계산하지 않는다」)은
 *   **stale** 이었다 — `foreign-stock.ts:405·438-439`가 둘 다 계산한다. 그 결과 단건 서식이
 *   `25행 19,500,000 / 26·27행 0 / 29행 21,950,000`으로 **자기모순**이었다(차액 2,450,000이
 *   어느 행에도 없었다).
 */
export interface ToStockTransferResultOptions {
  filingUnitIsThisItem?: boolean;
}

export type ForeignStockFilingMeta = Pick<
  ForeignStockInput,
  "transferDate" | "acquisitionDate" | "shareCount" | "stockName" | "countryCode"
>;

/**
 * `ForeignStockResult` → `StockTransferResult`.
 *
 * 세액 관련 값은 **그대로 옮긴다**. 단건 경로와 값이 갈리면 안 된다.
 * 기본공제 재배분(§103②)과 외국납부세액 한도 안분(§118의6①1호 B/C)은
 * `stock-transfer-aggregate.ts`가 이 결과를 받아 **뒤에서** 패치한다.
 *
 * 다종목 aggregate 편입 외에 **결과 화면의 별지 제84호서식**도 이 변환을 쓴다 — 서식은
 * `StockTransferResult` 한 타입만 읽으므로, 국외주식이 서식에 실리는 길은 여기뿐이다.
 * 두 쓰임은 **가산세 축에서 갈린다** — `opts.filingUnitIsThisItem` 참조.
 */
export function toStockTransferResult(
  input: ForeignStockFilingMeta,
  r: ForeignStockResult,
  opts: ToStockTransferResultOptions = {},
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

    // 이력 복원용 echo
    shareCount: input.shareCount,
    transferPrice: r.transferPriceKrw,
    // 국외주식(`①3다`)은 §94①4 다목이 아니라 영 §158② 합산 대상이 **아니다** —
    // own* 은 합산 전후가 같다.
    ownTransferPrice: r.transferPriceKrw,
    acquisitionPrice: r.acquisitionPriceKrw,
    ownAcquisitionPrice: r.acquisitionPriceKrw,
    // §118의4 — 환산취득가액 제도가 없다(§97② 경로가 오지 않는다).
    acquisitionMode: "actual",
    usedEstimatedAcquisition: false,

    basicDeductionGroup: "stock",
    expenses: r.necessaryExpensesKrw,
    ownExpenses: r.necessaryExpensesKrw,
    expenseMode: "actual",

    transferIncome: r.transferGain,
    basicDeduction: r.basicDeduction,
    taxBase: r.taxBase,
    appliedRate: r.appliedRate,
    progressiveDeduction: r.progressiveDeduction,
    calculatedTax: r.incomeTax,

    // 가산세는 **신고 1건 단위 1회**라 쓰임에 따라 갈린다(`ToStockTransferResultOptions`).
    underReportPenalty: opts.filingUnitIsThisItem ? (r.underReportPenalty ?? 0) : 0,
    latePaymentPenalty: opts.filingUnitIsThisItem ? (r.latePaymentPenalty ?? 0) : 0,
    // ⚠️ 전자신고 세액공제는 **국외주식 엔진에 개념 자체가 없다**(`foreign-stock.ts` grep 0건) —
    //    가산세와 달리 옵션으로 가를 것이 없어 0 그대로다.
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
