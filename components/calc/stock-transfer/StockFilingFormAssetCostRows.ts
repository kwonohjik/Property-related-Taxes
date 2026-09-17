/**
 * 별지 제84호서식 — **자산·양도가액·취득가액·필요경비 구간(01~17행)** 행 빌더.
 *
 * `StockFilingFormTableHelpers.ts` 800줄 정책 분리(2026-09-14). 원본은 `buildRows` 하나가
 * 자산정보부터 신고란까지 전 구간을 한 함수에 담고 있었고, 영 §158② 기신고 합산 부기 6행이
 * 붙으며 840줄이 됐다. **거대 단일 함수라 «구조분해»로 가른다** — 파일을 자르는 게 아니라
 * 구간별 빌더로 나눈다([[feedback_800line_split_playbook]]).
 *
 * 🔑 **경계를 넘는 값은 `hasPriorAggregation` 하나뿐이다.** [B] 에서 판정해 [C]·[D] 와
 *    **행 수 가드**가 함께 쓰므로 반환값으로 돌려준다 — 양쪽에서 다시 계산하면 두 벌이 되어
 *    갈린다.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { RowDef, StockAggregateMeta } from "./StockFilingFormTableHelpers";
import {
  sectionLabel,
  acquisitionModeLabel,
  taxCategoryLabel,
} from "./StockFilingFormLabels";

/** 구간 빌더가 공유하는 최소 문맥 — `buildRows` 지역 헬퍼를 그대로 넘긴다. */
export interface FilingRowCtx {
  result: StockTransferResult;
  aggregate?: StockAggregateMeta;
  val: (
    singleVal: number | string | null,
    totalFn?: (agg: StockTransferAggregateResult) => number | string | null,
    itemFn?: (item: StockTransferResult) => number | string | null,
  ) => Record<string, number | string | null>;
  holdingMonthsStr: (r: StockTransferResult) => string;
  basicDeductGroupLabel: (r: StockTransferResult) => string;
}

/**
 * [A]~[D] 구간(01~17행)을 `rows` 에 밀어 넣는다.
 *
 * @returns `hasPriorAggregation` — [C]·[D] 와 행 수 가드가 함께 쓰는 판정.
 */
export function pushAssetAndCostRows(
  rows: RowDef[],
  ctx: FilingRowCtx,
): { hasPriorAggregation: boolean } {
  const { result, aggregate, val, holdingMonthsStr, basicDeductGroupLabel } = ctx;

  // ── [A] 자산 정보 (01~06) ──────────────────────────────────────

  // 01. 적용 조문
  rows.push({
    label: "01. 적용 조문 (§94)",
    values: val(
      sectionLabel(result.appliedSection94),
      () => "— (종목별 상이)",
      (item) => sectionLabel(item.appliedSection94),
    ),
    separatorAfter: false,
  });

  // 02. 분류 (대주주·비대주주 등)
  rows.push({
    label: "02. 과세 분류",
    values: val(
      taxCategoryLabel(result.taxCategory),
      () => "— (종목별 상이)",
      (item) => taxCategoryLabel(item.taxCategory),
    ),
  });

  // 03. 기본공제 그룹
  rows.push({
    label: "03. 기본공제 그룹",
    values: val(
      basicDeductGroupLabel(result),
      () => "— (종목별 상이)",
      (item) => basicDeductGroupLabel(item),
    ),
  });

  // 04. 취득가액 산정 방식
  rows.push({
    label: "04. 취득가액 산정 방식",
    values: val(
      acquisitionModeLabel(result.acquisitionMode),
      () => "— (종목별 상이)",
      (item) => acquisitionModeLabel(item.acquisitionMode),
    ),
  });

  // 05. 보유기간
  rows.push({
    label: "05. 보유기간",
    values: val(
      holdingMonthsStr(result),
      () => "— (종목별 상이)",
      (item) => holdingMonthsStr(item),
    ),
  });

  // 06. 단기보유 여부
  rows.push({
    label: "06. 단기보유 (1년 미만)",
    values: val(
      result.isShortTermHolding ? "해당 (30% 적용)" : "해당없음",
      () => "— (종목별 상이)",
      (item) => (item.isShortTermHolding ? "해당" : "해당없음"),
    ),
    separatorAfter: true,
  });

  // ── [B] 양도가액 (07~10) ──────────────────────────────────────

  // 07. 양도가액
  rows.push({
    label: "07. 양도가액 (①)",
    values: val(
      result.transferPrice,
      (agg) => agg.items.reduce((s, r) => s + r.transferPrice, 0),
      (item) => item.transferPrice,
    ),
    highlight: false,
  });

  /**
   * 07-1·07-2 — 영 §158② 기신고분 합산 내역 (조건부)
   *
   * 07행은 **합산 «후» 총액**이다(과세표준 산식 근거). 사용자가 「2,100,000,000 이 어디서
   * 나왔는가」를 검산할 수 있게 기신고분·당회차분을 펼친다.
   *
   * 🔴 **엔진 echo 를 그대로 읽는다** — 총액에서 빼서 만들지 않는다. 화면이 산식을 다시 적으면
   *    엔진이 분기를 바꿔도 표가 따라오지 않는다([[feedback_aggregate_display_rederives_engine_value]]).
   */
  const hasPriorAggregation =
    result.priorAggregation !== undefined ||
    (aggregate?.items.some((r) => r.priorAggregation !== undefined) ?? false);
  if (hasPriorAggregation) {
    rows.push({
      label: "07-1.  기신고분 합산 (영 §158②)",
      values: val(
        result.priorAggregation?.transferPrice ?? null,
        (agg) => agg.items.reduce((s, r) => s + (r.priorAggregation?.transferPrice ?? 0), 0),
        (item) => item.priorAggregation?.transferPrice ?? null,
      ),
      indent: true,
    });
    rows.push({
      label: "07-2.  당회차분",
      values: val(
        result.ownTransferPrice,
        (agg) => agg.items.reduce((s, r) => s + r.ownTransferPrice, 0),
        (item) => item.ownTransferPrice,
      ),
      indent: true,
    });
  }

  // 08. 교환 - 부동산 정상가액 (조건부)
  const hasExchange = result.transferPriceBreakdown !== undefined;
  rows.push({
    label: "08.   교환 — 부동산 정상가액",
    values: val(
      hasExchange ? (result.transferPriceBreakdown?.property ?? null) : null,
      () => null,
      (item) => item.transferPriceBreakdown?.property ?? null,
    ),
    indent: true,
  });

  // 09. 교환 - 채무면제액 (조건부)
  rows.push({
    label: "09.   교환 — 채무면제액",
    values: val(
      hasExchange ? (result.transferPriceBreakdown?.debt ?? null) : null,
      () => null,
      (item) => item.transferPriceBreakdown?.debt ?? null,
    ),
    indent: true,
  });

  // 10. 교환 - 현금 (조건부)
  rows.push({
    label: "10.   교환 — 현금",
    values: val(
      hasExchange ? (result.transferPriceBreakdown?.cash ?? null) : null,
      () => null,
      (item) => item.transferPriceBreakdown?.cash ?? null,
    ),
    indent: true,
    separatorAfter: true,
  });

  // ── [C] 취득가액 (11~13) ──────────────────────────────────────

  // 11. 취득가액
  rows.push({
    // 환산 모드에서는 이 값이 곧 §163⑨ 환산취득가액이다 — 12-1·12-2가 그 분자·분모다.
    label: result.usedEstimatedAcquisition ? "11. 취득가액 (② = 환산취득가액)" : "11. 취득가액 (②)",
    values: val(
      result.acquisitionPrice,
      (agg) => agg.items.reduce((s, r) => s + r.acquisitionPrice, 0),
      (item) => item.acquisitionPrice,
    ),
  });

  // 11-1·11-2 — 영 §158② 기신고분 합산 내역 (07-1·07-2와 같은 규약)
  if (hasPriorAggregation) {
    rows.push({
      label: "11-1.  기신고분 합산 (영 §158②)",
      values: val(
        result.priorAggregation?.acquisitionPrice ?? null,
        (agg) => agg.items.reduce((s, r) => s + (r.priorAggregation?.acquisitionPrice ?? 0), 0),
        (item) => item.priorAggregation?.acquisitionPrice ?? null,
      ),
      indent: true,
    });
    rows.push({
      label: "11-2.  당회차분",
      values: val(
        result.ownAcquisitionPrice,
        (agg) => agg.items.reduce((s, r) => s + r.ownAcquisitionPrice, 0),
        (item) => item.ownAcquisitionPrice,
      ),
      indent: true,
    });
  }

  // 12~13. §163⑨ 환산취득가액 산식 — 분자·분모 (모두 **1주당**)
  //
  // 종전에는 「12. 환산 base (취득기준시가)」 한 줄에 **총액**을 보여줬다. 라벨이 「환산…」으로
  // 시작하는데 값은 환산의 base라, 정작 환산취득가액(11행)이 어떻게 나왔는지는 화면 어디에도
  // 드러나지 않았다. 산식을 분자·분모로 펼쳐 11행과 이어지게 한다.
  //
  // ⚠️ 12·13은 **1주당**, `estimatedBase`는 **총액**이다. 섞으면 항등식이 깨진다 —
  //    총액 base는 17행(개산공제 §163⑥4)이 이미 그 역할로 쓰고 있다.
  rows.push({
    label: "12-1.  환산 분자 — 취득 당시 1주당 기준시가",
    values: val(
      result.valuationDetail?.conversionAcqStdPerShare ?? null,
      () => null,
      (item) => item.valuationDetail?.conversionAcqStdPerShare ?? null,
    ),
    indent: true,
  });

  /**
   * 분모 라벨은 **무조건**이다 — 종전에는 「미입력 · 1주당 양도가액으로 대체」를 병기했는데,
   * 그 자동 대체 자체를 없앴다(Q-1 차단 정본, 2026-09-10). 분모가 비면 이제 12-2도 0이다.
   */
  const TRANSFER_STD_LABEL = "12-2.  환산 분모 — 양도 당시 1주당 기준시가";

  rows.push({
    label: TRANSFER_STD_LABEL,
    values: val(
      result.valuationDetail?.conversionTransferStd ?? null,
      () => null,
      (item) => item.valuationDetail?.conversionTransferStd ?? null,
    ),
    indent: true,
  });

  // 13. 액면가 합계 (face_value 모드)
  rows.push({
    label: "13.   액면가 합계 (장부분실 §99①4)",
    values: val(
      result.acquisitionMode === "face_value" ? result.acquisitionPrice : null,
      () => null,
      (item) => (item.acquisitionMode === "face_value" ? item.acquisitionPrice : null),
    ),
    indent: true,
    separatorAfter: true,
  });

  // ── [D] 필요경비 (14~17) ──────────────────────────────────────

  // 14. 필요경비 합계
  rows.push({
    label: "14. 필요경비 합계 (③)",
    values: val(
      result.expenses,
      (agg) => agg.items.reduce((s, r) => s + r.expenses, 0),
      (item) => item.expenses,
    ),
  });

  // 14-1·14-2 — 영 §158② 기신고분 합산 내역 (07-1·07-2와 같은 규약)
  if (hasPriorAggregation) {
    rows.push({
      label: "14-1.  기신고분 합산 (영 §158②)",
      values: val(
        result.priorAggregation?.expenses ?? null,
        (agg) => agg.items.reduce((s, r) => s + (r.priorAggregation?.expenses ?? 0), 0),
        (item) => item.priorAggregation?.expenses ?? null,
      ),
      indent: true,
    });
    rows.push({
      label: "14-2.  당회차분",
      values: val(
        result.ownExpenses,
        (agg) => agg.items.reduce((s, r) => s + r.ownExpenses, 0),
        (item) => item.ownExpenses,
      ),
      indent: true,
    });
  }

  // 15. 증권거래세
  //   소득세법상 필요경비(§163①6호)이지만 사용자가 actualExpenses에 포함해 입력.
  //   echo 채우기 시 필요경비 이중 차감 왜곡 → null 유지.
  //   정보용 STX 계산·표시는 SecuritiesTransactionTaxCard(결과뷰·Step3 인라인) 참조.
  //   설계: docs/02-design/features/stock-transfer-tax.ui.design.md §2-5
  rows.push({
    label: "15.   증권거래세",
    values: val(
      null,
      () => null,
      () => null,
    ),
    indent: true,
  });

  // 16. 매매수수료·기타 양도비용
  const otherExpenses = (r: StockTransferResult) =>
    r.expenseMode === "actual"
      ? r.expenses - (r.estimatedDeduction ?? 0)
      : null;

  rows.push({
    label: "16.   매매수수료·기타 양도비용 (actual 모드)",
    values: val(
      otherExpenses(result),
      // 🔑 바로 아래 17행(개산공제)과 **같은 모양**으로 집계한다. 종전에는 이 자리만
      //    `() => null` 이라 합계 열이 「–」였고, 14행 합계(③)의 **출처를 표가 설명하지 못했다**
      //    — 종목 열에는 값이 찍히는데 합계만 비어 있는 비대칭이었다.
      // ⚠️ `otherExpenses` 는 estimated 모드 종목에 null 을 준다(그 종목은 0으로 집계된다).
      //    라벨의 「(actual 모드)」가 그 범위를 이미 말한다 — 혼재 시 14행과 갈리는 것은
      //    **의도된 범위 차이**다(계획서 §4.3 V-2).
      () => aggregate?.items.reduce((s, r) => s + (otherExpenses(r) ?? 0), 0) ?? null,
      (item) => otherExpenses(item),
    ),
    indent: true,
  });

  // 17. 개산공제 §163⑥4
  rows.push({
    label: "17.   개산공제 §163⑥4 (취득기준시가 × 1%)",
    values: val(
      result.estimatedDeduction ?? null,
      () => aggregate?.items.reduce((s, r) => s + (r.estimatedDeduction ?? 0), 0) ?? null,
      (item) => item.estimatedDeduction ?? null,
    ),
    indent: true,
    separatorAfter: true,
  });

  return { hasPriorAggregation };
}
