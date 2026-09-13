/**
 * 다종목 합산 — **`each_item` · 단건 단축 경로**
 *
 * `"aggregate"` 본경로(§103① 그룹 한도 + §103② 배분 순서)와 달리 여기는 **종목별 계산을
 * 그대로 더한다**. 두 경우에만 탄다:
 *
 *   · `inputs.length === 1` — §104⑤ 법문 요건이 「자산을 **둘 이상** 양도하는 경우」다.
 *   · `each_item` — §103① 기본공제 **중복을 허용**하는 진단 모드라 애초에 유효한 신고가
 *     아니다. 실제 신고 경로는 `"aggregate"`이며 Zod 기본값도 그쪽이다.
 *
 * 🔴 **조기 반환 분기는 하류 단계를 통째로 건너뛴다.** 손익통산·기본공제 배분·§104⑤ 비교과세가
 *    전부 빠지므로, 본경로에 신고-단위 항목(외국납부세액공제·전자신고공제·가산세)을 추가하면
 *    **여기에도 같이** 넣어야 한다 — anchor FA-2-2 가 실제로 그 누락을 잡았다
 *    ([[feedback_early_return_branch_skips_pipeline_stages]]).
 *
 * [800줄 정책] `stock-transfer-aggregate.ts`(777줄)에서 추출.
 */

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import type { AggregateStockItemInput } from "./foreign-stock-aggregate-adapter";
import { floorTen } from "./stock-transfer-helpers";
import { sumSecuritiesTransactionTax } from "./securities-transaction-tax";
import { taxableField } from "./stock-transfer-aggregate-deduction";
import {
  pickFilingAxisInput,
  stripItemPenalties,
  computeFilingUnitPenalty,
  penaltyEcho,
} from "./stock-transfer-aggregate-penalty";
// ⚠️ **타입 전용 import** — 값으로 가져오면 main 과 순환이 된다(main 이 이 파일을 부른다).
import type { StockTransferAggregateResult } from "./stock-transfer-aggregate";

/** 종목 1건 단건 계산 — 국내·국외 엔진을 가르는 일은 호출부(main)가 한다. */
export type CalcOneFn = (
  input: AggregateStockItemInput,
  over?: Partial<StockTransferInput>,
) => StockTransferResult;

export function aggregateEachItem(
  inputs: AggregateStockItemInput[],
  calcOne: CalcOneFn,
): StockTransferAggregateResult {
  // 단건 또는 each_item 모드 — 개별 계산 합산
  //
  // §104⑤ 비교과세를 여기서는 적용하지 않는다:
  //   · `inputs.length === 1` — 법문 요건이 「자산을 **둘 이상** 양도하는 경우」다.
  //   · `each_item` — §103① 기본공제 **중복을 허용**하는 진단 모드라 애초에 유효한 신고가
  //     아니다(위 함수 주석). 실제 신고 경로는 `"aggregate"`이며 Zod 기본값도 그쪽이다
  //     (`lib/api/stock-transfer-tax-schema.ts:548`).
  // 가산세는 신고 단위 1회라 종목별 값은 버린다(`stripItemPenalties` 주석 참조).
  const items = stripItemPenalties(inputs.map((input) => calcOne(input)));
  // 합계가 음수면 과세 소득은 0이다 — 양도소득에 결손금 이월이 없다(§102①후단·§102②).
  // 부동산 정본과 대칭(`multi-parcel-transfer.ts:478`). 종전에는 clamp가 없어 신고서식에
  // **음수 양도소득금액**이 그대로 흘렀다.
  // 비과세 종목의 echo 는 총계에 산입하지 않는다(리뷰 #1 — `taxableField` 주석 참조).
  const totalTransferIncome = Math.max(
    0,
    items.reduce((s, r) => s + taxableField(r, "transferIncome"), 0),
  );
  const totalCalculatedTax = items.reduce((s, r) => s + taxableField(r, "calculatedTax"), 0);
  /**
   * 🔴 G-45: **입력값**으로 판정한다 — 긴 분기(`anyElectronic`)와 같은 소스다.
   *
   * 종전에는 종목 **결과값**(`r.electronicFilingCredit > 0`)을 봤는데, 국외 종목은 어댑터가
   * 그 필드를 항상 0으로 눌러 놓아 영영 잡히지 않았다. 그래서 같은 「전자신고」 선언인데
   * **종목 수만으로** 공제 적용 여부가 갈리고, 그 20,000원이 곧바로 가산세 base 를 움직였다
   * (실측: 국외 1건 → 가산세 7,800,000 / 국외 2건 → 7,872,000).
   *
   * 조특법 §104의8①의 공제는 「전자신고의 방법으로 … 신고를 하는 경우」이므로 **신고 단위**
   * 1회다 — 종목이 국내인지 국외인지와 무관하다.
   */
  const electronicFilingCredit = inputs.some((inp) => inp.isElectronicFiling) ? 20_000 : 0;
  // §118의6①1호 외국납부세액공제는 **산출세액에서 차감**된다. 이 단축 분기(단건·each_item)도
  // 반드시 빼야 한다 — 국외 종목의 `finalTax`에는 이미 반영돼 있는데 총계에서 빠지면
  // 종목 세액과 결정세액이 어긋난다(anchor FA-2-2가 이 누락을 잡았다).
  const totalForeignTaxCreditShort = items.reduce(
    (s, r) => s + (r.foreignDetail?.foreignTaxCreditApplied ?? 0),
    0,
  );
  // 신고 단위 결정세액 = 산출세액 − 세액공제. 가산세 base 가 바로 이 금액이다.
  const determinedTotal = Math.max(
    0,
    totalCalculatedTax - totalForeignTaxCreditShort - electronicFilingCredit,
  );
  const unitPenalty = computeFilingUnitPenalty(determinedTotal, pickFilingAxisInput(inputs));
  const totalUnderReportPenalty = unitPenalty.filing;
  const totalLatePaymentPenalty = unitPenalty.late;
  // 결정세액 10원 미만 절사 — 단건 finalizeStockTax·aggregate 분기와 대칭
  // (구성요소가 모두 10배수라 현재 실수치 불변이나, 향후 변경 대비 정합 유지)
  const totalFinalTax = Math.max(
    0,
    floorTen(determinedTotal + totalUnderReportPenalty + totalLatePaymentPenalty),
  );
  const totalLocalIncomeTax =
    Math.floor(((totalCalculatedTax - totalForeignTaxCreditShort) * 0.10) / 10) * 10;

  return {
    items,
    totalTransferIncome,
    basicDeductionByGroup: {
      stock: items
        .filter((r) => r.basicDeductionGroup === "stock")
        .reduce((s, r) => s + taxableField(r, "basicDeduction"), 0),
      real_estate_and_other_asset: items
        .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
        .reduce((s, r) => s + taxableField(r, "basicDeduction"), 0),
    },
    totalTaxBase: items.reduce((s, r) => s + taxableField(r, "taxBase"), 0),
    totalCalculatedTax,
    totalUnderReportPenalty,
    totalLatePaymentPenalty,
    // 🔴 G-46: 기준금액·조문·가목나목 분해 echo — 다종목에서 산식이 사라지지 않도록.
    ...penaltyEcho(unitPenalty),
    electronicFilingCredit,
    totalFinalTax,
    totalLocalIncomeTax,
    totalSecuritiesTransactionTax: sumSecuritiesTransactionTax(items),
  };
}
