/**
 * StockFilingFormTable 순수 계산 헬퍼 — 800줄 분리 정책 준수
 *
 * 32행 고정 신고서 양식 (별지 제84호 서식 — 주식 적용)
 * 부동산 FilingFormTableHelpers.ts 패턴 차용.
 */

import { pushAssetAndCostRows } from "./StockFilingFormAssetCostRows";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { sumBasicDeductionByGroup } from "@/lib/tax-engine/stock-transfer/stock-basic-deduction-total";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
/**
 * 라벨 헬퍼는 `StockFilingFormLabels.ts`로 나갔다(800줄 정책) — 이음매는 **역할**이다.
 * 이쪽은 행값 계산, 저쪽은 enum·세율을 사람이 읽는 문자열로 옮기는 일만 한다.
 */
import {
  sectionLabel,
  rateGroupLabel,
  acquisitionModeLabel,
  taxCategoryLabel,
  rateLabel,
  isForeignStockCategory,
  isExitTaxCategory,
} from "./StockFilingFormLabels";

// ── Props ──────────────────────────────────────────────────────

/**
 * 다자산 합산(aggregate) 모드 메타 — 종목별 컬럼 + 합계 컬럼
 */
export interface StockAggregateMeta {
  /** 종목별 단건 결과 배열 (StockTransferAggregateResult.items) */
  items: StockTransferResult[];
  aggregated: StockTransferAggregateResult;
}

export interface StockFilingFormTableProps {
  /** 단건 모드: 단건 result / 다자산 모드: aggregate.aggregated에서 파생한 합계 result-유사 객체 */
  result: StockTransferResult;
  /** 다자산 시 본 prop 제공 → 종목별 컬럼 분기 */
  aggregate?: StockAggregateMeta;
  onPrint?: () => void;
  title?: string;
  subtitle?: string;
  /** 신고서 상단 표시할 종목명 (단건 전용) */
  stockName?: string;
  // ── 신고서 헤더 확장 (디자인 §4.2) ──
  /** 양도인 성명 (useUserProfile 또는 의뢰인 이름) */
  taxpayerName?: string;
  /** 종목코드 */
  stockCode?: string;
  /** 증권사명 */
  brokerName?: string;
  /** 계좌번호 마스킹 */
  accountNumber?: string;
  /** 과세연도 (transferDate에서 자동 추출) */
  filingYear?: number;
}

// ── 내부 타입 ──────────────────────────────────────────────────

export type ColumnKey = string;

export interface Column {
  key: ColumnKey;
  label: string;
}

export interface RowDef {
  label: string;
  /** 열별 값 (number=금액, string=날짜·기간 등 텍스트) */
  values: Record<ColumnKey, number | string | null>;
  indent?: boolean;
  highlight?: boolean;
  /** true면 행 하단에 두꺼운 구분선 */
  separatorAfter?: boolean;
  /** 열별 주석 (일반) */
  notes?: Record<ColumnKey, string>;
  /** 열별 rose 주석 (비과세·단서 등 법령 안내) */
  roseNotes?: Record<ColumnKey, string>;
}

// ── 숫자 포맷 ──────────────────────────────────────────────────

export function fmtCell(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return v;
  if (v === 0) return "0";
  return v.toLocaleString("ko-KR");
}

// ── 컬럼 도출 ──────────────────────────────────────────────────

/** 단건 → 합계 1열 / 다자산 → 합계 + 종목별 N열 */
export function deriveColumns(
  _result: StockTransferResult,
  aggregate?: StockAggregateMeta,
): { columns: Column[] } {
  if (!aggregate || aggregate.items.length <= 1) {
    return {
      columns: [{ key: "total", label: "합계" }],
    };
  }

  // 🔴 종전에는 `${item.taxCategory}`를 그대로 찍어 **내부 enum id가 신고서에 인쇄**됐다
  //    (「종목 1 (listed_major)」·「종목 2 (foreign_stock)」). 바로 아래 `taxCategoryLabel`이
  //    있는데 호출조차 하지 않았다 (memory `feedback_no_internal_id_in_result`).
  const stockCols: Column[] = aggregate.items.map((item, i) => ({
    key: `stock${i}`,
    label: `종목 ${i + 1} (${taxCategoryLabel(item.taxCategory)})`,
  }));

  return {
    columns: [{ key: "total", label: "합계" }, ...stockCols],
  };
}

// ── 단건 값 채우기 (향후 다자산 통합 시 활용 예정) ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function singleValues(
  key: string,
  singleResult: StockTransferResult,
  v: number | string | null,
): Record<string, number | string | null> {
  return { [key]: v };
}

// ── aggregate 행값 빌더 ─────────────────────────────────────────

function aggValues(
  columns: Column[],
  aggregate: StockAggregateMeta | undefined,
  totalFn: (agg: StockTransferAggregateResult) => number | string | null,
  itemFn: (item: StockTransferResult, idx: number) => number | string | null,
  totalFallback: number | string | null = null,
): Record<string, number | string | null> {
  const values: Record<string, number | string | null> = {};

  if (!aggregate) {
    values["total"] = totalFallback;
    return values;
  }

  values["total"] = totalFn(aggregate.aggregated);
  aggregate.items.forEach((item, i) => {
    values[`stock${i}`] = itemFn(item, i);
  });
  return values;
}

// ── 32행 buildRows ─────────────────────────────────────────────

/**
 * 32행 고정 신고서 행 생성.
 *
 * 조건 미충족 행: 값 "-" (null). 행 자체 생략 없음.
 * 비과세 시: 1~7행 의미 있는 값, 나머지 "-".
 */
export function buildRows(
  result: StockTransferResult,
  columns: Column[],
  aggregate?: StockAggregateMeta,
): RowDef[] {
  const isMulti = Boolean(aggregate && aggregate.items.length > 1);
  const col = columns[0].key; // 단건 시 "total"

  // 단건 값 헬퍼 (aggregate 없을 때)
  function sv(v: number | string | null): Record<string, number | string | null> {
    if (!isMulti) return { [col]: v };
    return {};
  }

  // 다자산 값 헬퍼
  function av(
    totalFn: (agg: StockTransferAggregateResult) => number | string | null,
    itemFn: (item: StockTransferResult) => number | string | null,
  ): Record<string, number | string | null> {
    return aggValues(columns, aggregate, totalFn, itemFn);
  }

  // 단건/다자산 통합 값
  function val(
    singleVal: number | string | null,
    totalFn?: (agg: StockTransferAggregateResult) => number | string | null,
    itemFn?: (item: StockTransferResult) => number | string | null,
  ): Record<string, number | string | null> {
    if (isMulti && totalFn && itemFn) {
      return av(totalFn, itemFn);
    }
    return sv(singleVal);
  }

  // 비과세 여부 (다자산 시 종목별 판단)
  const allExempt = isMulti
    ? (aggregate?.items.every((i) => i.isExempt) ?? false)
    : result.isExempt;

  /**
   * **전부** 국외주식인가 — 열이 하나뿐인 행(24·32)의 조문을 가른다.
   *
   * ⚠️ 「하나라도 국외」가 아니라 **전부**다. 국내가 섞이면 그 행의 국내 근거(§104①11·§105①2호)가
   *   여전히 맞으므로, 국외 기준으로 갈아끼우면 이번엔 국내 종목 쪽이 틀린 안내를 받는다.
   */
  const allForeign = isMulti
    ? (aggregate?.items.every((i) => isForeignStockCategory(i)) ?? false)
    : isForeignStockCategory(result);

  /**
   * 국외전출세인가 — **다종목이 될 수 없다**(§118의10④ 별도 그룹이라 합산 배열에서 차단된다).
   * 그래서 `isMulti` 분기가 필요 없고 단건 `result`만 보면 된다.
   */
  const isExit = isExitTaxCategory(result);

  // 보유기간 문자열
  //
  // 🔑 국외전출세는 **간주양도**(§118의9)라 보유기간이 세율을 가르지 않고(§118의11은
  //   §104①11가목2)만 준용), 종목마다 취득일이 달라 합계 열 하나로 대표시킬 수도 없다.
  //   어댑터가 0을 싣는 것을 그대로 찍으면 「0개월 보유」라는 **틀린 사실**이 인쇄된다.
  const holdingMonthsStr = (r: StockTransferResult) =>
    isExitTaxCategory(r) ? "-" : `${r.holdingPeriodMonths}개월`;

  // 기본공제 그룹 라벨
  //
  // ⚠️ 국외전출세는 `basicDeductionGroup`이 union 상 `stock`이지만 **실제 그룹은 §118의10④**로
  //   주식 그룹(§103①2호)과 **별개**다. 그래서 합산 배열에도 넣지 않는다(`assertNoExitTaxItem`).
  //   union 값만 보고 §103①2호를 인쇄하면 「같은 250만원을 두 번 받는다」는 오해를 부른다.
  const basicDeductGroupLabel = (r: StockTransferResult) =>
    isExitTaxCategory(r)
      ? "§118의10④ (국외전출세 별도 그룹)"
      : r.basicDeductionGroup === "stock"
        ? "§103①2호 (주식 그룹)"
        : "§103①1호 (부동산·기타자산 그룹)";

  const rows: RowDef[] = [];

  // ── [A]~[D] 자산·양도가액·취득가액·필요경비 (01~17) ──────────────
  //    800줄 정책 분리 — 구간 빌더에 위임한다(`StockFilingFormAssetCostRows.ts`).
  //    `hasPriorAggregation` 은 그 안에서 판정해 돌려받는다 — 행 수 가드가 쓴다.
  const { hasPriorAggregation } = pushAssetAndCostRows(rows, {
    result,
    aggregate,
    val,
    holdingMonthsStr,
    basicDeductGroupLabel,
  });

  // ── [E] 양도차익·소득금액 (18~19) ─────────────────────────────

  // 18. 양도차익 — **통산 «전»**.
  //
  // 🔑 `item.transferIncome`을 쓰면 안 된다. 다자산 경로에서 그 값은
  //    `stock-transfer-aggregate.ts:429-431`이 **통산 후로 갈아끼운** 것이라, 이 행이
  //    자기 라벨의 산식(①−②−③)과 어긋나고 바로 아래 18-1행이 **이중 차감처럼** 읽힌다
  //    (`18행 + 18-1행 ≠ 19행`). 통산 «전» 값은 엔진이 `transferIncomeBeforeOffset`으로
  //    이미 내보낸다(`aggregate.ts:473-477` — 5개 return 을 한 자리에서 덮어 **조건 없이** 실린다).
  //
  // ⚠️ 합계 열도 **같은 축**이어야 한다. `agg.totalTransferIncome`은 통산 후 합계라
  //    차손이 전액 흡수되는 케이스에서만 우연히 일치하고, **잔여 차손이 소멸하는 케이스**
  //    (`unusedLoss > 0`)에서는 갈린다 — anchor V-1b 실측: 라벨 산식 −20,000,000 vs 현행 0.
  //
  // ⚠️ optional 필드라 `??` fallback 을 둔다 — 단건 경로(`aggregate` 없음)는 애초에 통산이
  //    없어 `transferIncome`이 곧 통산 전 값이다(anchor A-3 이 고정).
  const incomeBeforeOffset = (r: StockTransferResult) =>
    r.transferIncomeBeforeOffset ?? r.transferIncome;

  rows.push({
    label: "18. 양도차익 (①−②−③)",
    values: val(
      result.transferIncome,
      (agg) => agg.items.reduce((s, r) => s + incomeBeforeOffset(r), 0),
      (item) => incomeBeforeOffset(item),
    ),
    highlight: true,
  });

  // 18-1. 양도차손 통산 (§102② · 시행령 §167의2) — 다자산 모드에서 통산이 일어난 경우만.
  //   부동산 정본이 `calculationSteps`에 한 행으로 노출하는 것과 대칭이다
  //   (`transfer-tax-aggregate.ts` 「양도차손 통산 (§102② · 시행령 §167의2)」).
  //   잔여 차손은 **소멸**한다(양도소득에 결손금 이월 없음) — 그 사실을 라벨에 남긴다.
  //   ⚠️ 엔진 `lossOffset` 은 **§102① 호별**(주식 2호 / 기타자산 1호)로 나뉜다. 별지 제84호서식은
  //      이 자리에 행이 **하나**뿐이므로 두 호를 더해 싣는다 — 호별 분해는 결과 화면
  //      (`StockAggregateSummaryCard`)이 보여준다. 합산해도 「호를 넘어 통산했다」는 뜻이
  //      **아니다**(통산 자체는 엔진이 호별로만 했다).
  if (aggregate?.aggregated.lossOffset) {
    const lo = aggregate.aggregated.lossOffset;
    // 18-1 합계는 이제 **종목 열의 합**으로 낸다(흡수와 유출이 상쇄돼야 하므로) —
    // `lo.*.totalOffset`(흡수분만)은 더 이상 쓰이지 않는다.
    const unusedLoss = lo.stock.unusedLoss + lo.real_estate_and_other_asset.unusedLoss;
    /**
     * 종목 열 = 흡수는 **음수**(소득이 줄었다), 유출은 **양수**(차손이 나갔다).
     *
     * 🔴 종전에는 유출 쪽을 `null`로 비웠다. 그래서 열 방향은 맞는데
     *   (`24,600,000 − 6,000,000 = 18,600,000`) **가로 합계가 어긋났다**:
     *   `18행 62,000,000 + 18-1행 −20,000,000 = 42,000,000 ≠ 19행 62,000,000` (제보).
     *   유출을 양수로 실으면 합계 열이 0이 되어 `18 + 18-1 = 19`가 성립한다.
     *
     * ⚠️ 합계 열도 **종목 열의 합**으로 바꾼다. `-totalOffset`은 흡수분만 세므로 유출과
     *   상쇄되지 않는다.
     */
    const offsetCell = (item: StockTransferResult): number | null => {
      const absorbed =
        (item.lossOffsetFromSameGroup ?? 0) + (item.lossOffsetFromOtherGroup ?? 0);
      if (absorbed > 0) return -absorbed;
      const given = item.lossOffsetGivenAway ?? 0;
      return given > 0 ? given : null;
    };

    rows.push({
      label: "18-1. 양도차손 통산 (§102②·영 §167의2)",
      values: val(
        0,
        (agg) => agg.items.reduce((s, r) => s + (offsetCell(r) ?? 0), 0),
        offsetCell,
      ),
    });

    /**
     * 18-2. 통산되지 못한 차손 **소멸** — 「통산」이 아니므로 18-1과 가른다.
     *
     * 양도소득에는 결손금 이월이 없다. 소멸분까지 더해야 차손 종목의 19행이 0이 된다
     * (`−30,000,000 + 10,000,000 + 20,000,000 = 0`).
     *
     * ⚠️ **소멸이 없으면 행 자체를 만들지 않는다** — 0을 채우면 「소멸 0원」과 「소멸 자체가
     *   없음」이 구분되지 않는다(18-1의 기존 규약과 같다). 종전에는 이 사실이 18-1 라벨의
     *   문구로만 있었다.
     */
    if (unusedLoss > 0) {
      rows.push({
        label: "18-2. 통산되지 못한 차손 소멸 (이월 불가)",
        values: val(
          0,
          (agg) => agg.items.reduce((s, r) => s + (r.lossOffsetExpired ?? 0), 0),
          (item) => item.lossOffsetExpired ?? null,
        ),
      });
    }
  }

  // 19. 양도소득금액 (LTHD 미적용 — 주식은 동일)
  rows.push({
    label: "19. 양도소득금액 (= 양도차익, 장특공제 없음)",
    values: val(
      result.transferIncome,
      (agg) => agg.totalTransferIncome,
      (item) => item.transferIncome,
    ),
    highlight: true,
    separatorAfter: true,
  });

  // ── [F] 과세표준 (20~22) ──────────────────────────────────────

  // 20. 기본공제 (§103① 그룹)
  rows.push({
    // 국외전출세의 250만원은 §103①이 아니라 **§118의10④**다 — 03행과 같은 축이다.
    label: isExit
      ? "20. 기본공제 (§118의10④ 250만 한도)"
      : "20. 기본공제 (§103① 그룹별 250만 한도)",
    values: val(
      result.basicDeduction,
      (agg) => sumBasicDeductionByGroup(agg.basicDeductionByGroup),
      (item) => item.basicDeduction,
    ),
  });

  // 21. 부동산 그룹 사용액 (§94② 발동 시)
  const section94_2 = (r: StockTransferResult) =>
    r.section94_2Applied ? r.basicDeduction : null;

  rows.push({
    label: "21.   §94② 우선 — 부동산·기타자산 그룹 사용액",
    values: val(
      section94_2(result),
      (agg) => agg.basicDeductionByGroup.real_estate_and_other_asset || null,
      (item) => section94_2(item),
    ),
    indent: true,
  });

  // 22. 과세표준
  rows.push({
    label: "22. 과세표준 (§47② 1원 미만 절사)",
    values: val(
      result.taxBase,
      (agg) => agg.totalTaxBase,
      (item) => item.taxBase,
    ),
    highlight: true,
    separatorAfter: true,
  });

  // ── [G] 세율·산출세액 (23~25) ─────────────────────────────────

  // 23. 적용 세율
  rows.push({
    label: "23. 적용 세율",
    values: val(
      allExempt ? "비과세" : rateLabel(result),
      () => "— (종목별 상이)",
      (item) => rateLabel(item),
    ),
  });

  // 23-1. ③ 세율구분 그룹 — 별지 제84호서식 작성요령 4번
  //
  // > 4. ③ 세율구분란: 주식의 경우에는 주식양도소득금액계산명세서(별지 제84호서식 부표 2)의
  // >    ④ 주식등 종류코드란의 **세율이 같은 자산**(기타자산 주식은 제외합니다)을 합산하여 적습니다.
  //
  // 이 표는 종목별 열이라 실제 서식의 ③란에 **어느 종목끼리 한 칸에 합산되는지**가 드러나지
  // 않는다. 그 그룹 키를 그대로 보여 옮겨 적을 때 헷갈리지 않게 한다.
  // 🔑 국외주식(코드 61·62)은 국내 비대주주와 **같은 축**이다 — 세율이 같으면 같은 칸이다.
  if (isMulti) {
    rows.push({
      label: "23-1.   ③ 세율구분 그룹 (작성요령 4번 — 세율이 같은 자산을 합산)",
      values: val(
        null,
        () => "— (아래 종목별 그룹 참조)",
        (item) => rateGroupLabel(item),
      ),
      indent: true,
    });
  }

  // 24. 누진공제 (조건부)
  rows.push({
    // 국외주식 §104①12호에는 누진 구간 자체가 없다 — §55·§104①11 가목2)를 근거로 달면 틀리다.
    label: isExit
      ? "24.   누진공제 (§118의11 → §104①11 가목2) 준용)"
      : allForeign
        ? "24.   누진공제 (§104①12 — 누진 구간 없음)"
        : "24.   누진공제 (§55 / §104①11 가목2)",
    values: val(
      result.progressiveDeduction ?? null,
      () => null,
      (item) => item.progressiveDeduction ?? null,
    ),
    indent: true,
  });

  // 24-1·24-2. 영 §168② — 대주주로서 납부하였거나 납부할 세액 차감
  //
  // 🔑 이 차감은 **세액공제가 아니라 「산출세액」의 정의**다(영 §168②: 「차감하여 계산한 금액을
  //    양도소득산출세액으로 한다」). 그래서 25행 «앞»에 놓고, 25행은 **차감 후** 값이다.
  if (result.clause168_2Credit) {
    rows.push({
      label: "24-1. 산출세액 (차감 전)",
      values: val(
        result.clause168_2Credit.grossCalculatedTax,
        (agg) => agg.totalCalculatedTax + (agg.totalClause168_2Deducted ?? 0),
        (item) => item.clause168_2Credit?.grossCalculatedTax ?? item.calculatedTax,
      ),
    });
    rows.push({
      label: "24-2. △ 대주주로서 납부하였거나 납부할 세액 (소득세법 시행령 §168②)",
      values: val(
        -result.clause168_2Credit.deducted,
        (agg) => -(agg.totalClause168_2Deducted ?? 0),
        (item) => -(item.clause168_2Credit?.deducted ?? 0),
      ),
    });
  }

  // 25. 산출세액
  rows.push({
    label: result.clause168_2Credit
      ? "25. 산출세액 (영 §168② 차감 후 · §47① 10원 미만 절사)"
      : "25. 산출세액 (§47① 10원 미만 절사)",
    values: val(
      result.calculatedTax,
      (agg) => agg.totalCalculatedTax,
      (item) => item.calculatedTax,
    ),
    highlight: true,
    separatorAfter: true,
  });

  // 25-1. 외국납부세액공제 §118의6①1호 — 별지 제84호서식 ⑫란
  //
  // 서식은 ⑩ 산출세액 → ⑪ 감면세액 → **⑫ 외국납부세액공제** 순서다. 국외주식(§94①3호다목)이
  // 있을 때만 값이 생기므로, 종목이 하나도 해당하지 않으면 행 자체를 넣지 않는다.
  //
  // 🔑 한도 = A × B / C (A = 국외주식 산출세액 합계 · B = 해당 종목 양도소득금액 ·
  //    C = 국외주식 양도소득금액 합계). 단건은 B = C라 한도 = A다.
  //    ⚠️ 한도가 그 종목 **자신의 산출세액을 넘을 수 있어** 종목 열의 합이 합계 열과
  //    어긋날 수 있다 — 「해당 과세기간의 산출세액에서 공제」(§118의6①1호 본문)라
  //    공제 대상이 과세기간 전체이기 때문이다(엔진 STEP 3.5 주석 참조).
  const foreignCreditItems = aggregate?.items.filter(
    (r) => r.foreignDetail?.foreignTaxCreditApplied !== undefined,
  );
  const hasForeignCredit =
    result.foreignDetail?.foreignTaxCreditApplied !== undefined ||
    (foreignCreditItems?.length ?? 0) > 0;

  if (hasForeignCredit) {
    rows.push({
      label: "25-1. 외국납부세액공제 §118의6①1호 (한도 = 산출세액 × 「해당 종목 소득을 국외주식 소득으로 나눈 비율」)",
      values: val(
        result.foreignDetail?.foreignTaxCreditApplied ?? null,
        () =>
          aggregate?.items.reduce(
            (s, r) => s + (r.foreignDetail?.foreignTaxCreditApplied ?? 0),
            0,
          ) ?? null,
        (item) => item.foreignDetail?.foreignTaxCreditApplied ?? null,
      ),
      indent: true,
    });
  }

  /**
   * ── 국외전출세 전용 공제·가산세 (25-E1~25-E4 · 조건부) ─────────────
   *
   * 국내 양도에 **대응 항목이 없어** 본행에 실을 수 없는 것들이다. 이 행들이 없으면
   * 25행 산출세액과 29행 결정세액이 어긋나 **서식이 자기모순**이 된다
   * (엔진: 결정세액 = 산출세액 − 조정공제 − §118의13 − §118의14 + §118의15④ 가산세).
   *
   * ⚠️ 값이 있을 때만 행을 만든다 — 0을 채우면 「공제 0원」과 「공제 자체가 없음」이
   *   구분되지 않는다(18-1·18-2 행의 기존 규약과 같다).
   */
  const exitRowCount = (() => {
    if (!isExit || !result.exitDetail) return 0;
    const d = result.exitDetail;
    let n = 0;

    const pushExitRow = (label: string, v: number | undefined) => {
      if (v === undefined || v <= 0) return;
      rows.push({ label, values: val(v), indent: true });
      n += 1;
    };

    // §118의12① 조정공제 — 실양도가가 출국일 시가보다 낮을 때 그 차액분 세액을 뺀다.
    pushExitRow("25-E1. 조정공제 (§118의12①)", d.adjustmentDeduction);
    // §118의13① 외국납부세액공제 — 실제 양도국에 낸 세액.
    pushExitRow("25-E2. 외국납부세액공제 (§118의13①)", d.foreignTaxCreditApplied);
    // §118의14① 비거주자의 국내원천소득 세액공제.
    pushExitRow("25-E3. 비거주자 국내원천소득 세액공제 (§118의14①)", d.domesticTaxCreditApplied);
    // §118의15④ — 「… 100분의 2에 상당하는 금액을 **산출세액에 더한다**」. 공제가 아니라 가산이다.
    pushExitRow(
      "25-E4. 보유현황 미신고 가산세 (§118의15④ — 액면금액 2%)",
      d.holdingsReportPenalty,
    );
    return n;
  })();

  // ── [H] 가산세·공제 (26~28) ───────────────────────────────────

  // 26. 신고불성실 가산세 — 무신고 §47조의2 / 과소신고 §47조의3
  //     ⚠️ 10%는 「국세기본법」 §47조의3①2호(일반 과소신고)다 — §47의2 하나로 묶으면 틀린다.
  rows.push({
    label: "26. 신고불성실 가산세 (국세기본법 §47조의2·§47조의3)",
    values: val(
      result.underReportPenalty || null,
      (agg) => agg.totalUnderReportPenalty || null,
      (item) => item.underReportPenalty || null,
    ),
  });

  // 27. 납부지연 가산세 — 「국세기본법」 §47조의4 (조문 제목이 「납부지연가산세」다)
  //     ⚠️ 이자율은 라벨에 고정 표기하지 않는다 — 엔진은 기간별 구간율(10만분의 30/25/22)을
  //        적용하므로 「1일 22/100,000」 고정 표기는 과거분 사안에서 금액과 어긋난다.
  rows.push({
    label: "27. 납부지연 가산세 (국세기본법 §47조의4)",
    values: val(
      result.latePaymentPenalty || null,
      // 신고 단위 1회 산정이라 합계 열에만 값이 있다(종목 열은 전부 0 → null)
      (agg) => agg.totalLatePaymentPenalty || null,
      (item) => item.latePaymentPenalty || null,
    ),
  });

  // 28. 전자신고 세액공제 — 「조세특례제한법」 §104의8①
  //     🔴 G-26: 종전 「§52의2」는 이 저장소에서 상증법·상증령의 다른 조문으로 이미 쓰인다.
  rows.push({
    label: `28. 전자신고 세액공제 (${STOCK.ELECTRONIC_FILING_CREDIT}) (−20,000)`,
    values: val(
      result.electronicFilingCredit > 0 ? -result.electronicFilingCredit : null,
      (agg) => (agg.electronicFilingCredit > 0 ? -agg.electronicFilingCredit : null),
      (item) => (item.electronicFilingCredit > 0 ? -item.electronicFilingCredit : null),
    ),
    separatorAfter: true,
  });

  // ── [I] 결정세액·납부세액 (29~31) ─────────────────────────────

  // 29. 결정세액
  rows.push({
    label: "29. 결정세액 (§47① 10원 미만 절사)",
    values: val(
      result.finalTax,
      (agg) => agg.totalFinalTax,
      (item) => item.finalTax,
    ),
    highlight: true,
  });

  // 30. 지방소득세 §103의3
  rows.push({
    label: result.clause168_2Credit
      ? "30. 지방소득세 §103의3 (영 §168② 차감 «후» 산출세액 × 10%, 10원 절사)"
      : "30. 지방소득세 §103의3 (산출세액 × 10%, 10원 절사)",
    values: val(
      result.localIncomeTax,
      (agg) => agg.totalLocalIncomeTax,
      (item) => item.localIncomeTax,
    ),
  });

  // 31. 총 납부세액
  rows.push({
    label: "31. 총 납부세액 (결정세액 + 지방소득세)",
    values: val(
      result.finalTax + result.localIncomeTax,
      (agg) => agg.totalFinalTax + agg.totalLocalIncomeTax,
      (item) => item.finalTax + item.localIncomeTax,
    ),
    highlight: true,
    separatorAfter: true,
  });

  // 31-1~31-3. §111③ 확정신고 기납부세액 정산 — **합산신고 확정신고**에서만 실린다.
  //
  // 🔑 이 세 행은 31행 «뒤»다 — §111③은 「확정신고납부를 **하는 경우** … 공제하여 납부한다」라
  //    결정세액(29)·총 납부세액(31)을 바꾸지 않고 그 뒤의 **납부 단계**에서 작동한다.
  //    앞에 놓으면 결정세액이 기납부액만큼 줄어든 것처럼 읽힌다.
  //
  // ⚠️ 단건 열은 값이 없다 — 정산은 **신고 단위**라 종목에 귀속되지 않는다(가산세와 같은 축).
  const settlement = aggregate?.aggregated.settlement;
  if (settlement) {
    rows.push({
      label: "31-1. △ 예정신고 기납부세액 (소득세법 §111③)",
      values: val(null, () => -settlement.preliminaryPaidTax, () => null),
    });
    rows.push({
      label: "31-2. △ 예정신고 기납부 지방소득세",
      values: val(null, () => -settlement.preliminaryPaidLocalTax || null, () => null),
    });
    rows.push({
      label:
        settlement.settlementRefund > 0 || settlement.settlementLocalRefund > 0
          ? `31-3. 이번에 납부할 세액 (환급 ${(
              settlement.settlementRefund + settlement.settlementLocalRefund
            ).toLocaleString()})`
          : "31-3. 이번에 납부할 세액",
      values: val(null, () => settlement.settlementTotalDue, () => null),
      highlight: true,
      separatorAfter: true,
    });
  }

  // ── [J] 신고 (32) ─────────────────────────────────────────────

  // 32. 신고기한
  //
  // 🔑 국외주식(§94①3호**다목**)에는 **예정신고 의무가 없다** — §105① 본문 괄호가
  //   「같은 항 제3호다목 … 은 제외한다」로 빼고, 2호도 「제3호**가목 및 나목**」만 든다.
  //   남는 것은 §110①의 확정신고뿐이다. 종전에는 전부 국외인 신고서에도 「예정신고: 반기 말일
  //   + 2개월」이 인쇄돼 **없는 의무를 안내**했다.
  //
  // 🔑 국외전출세는 **§118의15②** — 「출국일이 속하는 달의 말일부터 3개월 이내(납세관리인을
  //   신고한 경우에는 §110①에 따른 확정신고 기간 내)」다. §105①2호(반기 말일 + 2개월)는
  //   국외전출세에 **존재하지 않는 기한**이다.
  const filingDeadlineText = isExit
    ? "출국일이 속하는 달의 말일 + 3개월 (납세관리인 신고 시 §110① 확정신고 기간 내)"
    : allForeign
      ? "확정신고: 다음연도 5월 31일 (§110①) — 예정신고 의무 없음 (§105① 본문 괄호)"
      : "예정신고: 반기 말일 + 2개월 / 확정신고: 다음연도 5월 31일";
  rows.push({
    label: isExit
      ? "32. 신고기한 §118의15②"
      : allForeign
        ? "32. 신고기한 §110① (확정신고)"
        : "32. 신고기한 §105①2호 (양도일 반기 말일 + 2개월)",
    values: val(filingDeadlineText, () => filingDeadlineText, () => null),
  });

  // 행 수 검증 — 무조건 33행 + **조건부 행 3종**
  //
  // 조건부 행을 늘릴 때는 여기 기대값도 함께 올려야 한다. 안 그러면 콘솔이 상시 경고를 뱉어
  // **진짜 행 누락을 알려주는 신호가 죽는다**(경고 피로).
  //   · §102② 양도차손 통산 — aggregate 에 `lossOffset` 이 있을 때만
  //   · 23-1 ③ 세율구분 그룹 — 다종목일 때만
  //   · 25-1 ⑫ 외국납부세액공제 — 국외주식이 있을 때만
  //
  // ⚠️ 2026-08-27 정정 — 기대값이 **32에 멈춰 있어 상시 발화**하고 있었다. `40d6cc55`(PR #1327)가
  //    무조건 행을 하나 늘리며(32→33) 여기를 안 올렸고, 조건부 목록에도 `lossOffset` 이 빠져
  //    있었다. 파일 자신이 경고한 「신호가 죽는」 상태가 실제로 벌어져 있었다.
  // ⚠️ 2026-09-14 정정 — **또 발화하고 있었다**(기대 33 / 실제 35). `clause168_2Credit`
  //    블록이 24-1·24-2 **두 행**을 조건부로 넣는데 이 식에 항이 없었다. 위 경고가 말한
  //    「신호가 죽는」 상태가 두 번째로 벌어져 있었다 — 조건부 행을 추가하면 **반드시**
  //    여기에 항을 더한다.
  const expectedRows =
    33 +
    (aggregate?.aggregated.lossOffset ? 1 : 0) +
    (isMulti ? 1 : 0) +
    (hasForeignCredit ? 1 : 0) +
    (result.clause168_2Credit ? 2 : 0) +
    // §111③ 정산 3행 — 조건부 행을 추가할 때 여기에 항을 더하지 않으면 경고가 상시 발화해
    // 「진짜 행 누락」 신호가 죽는다(위 정정 2건이 그 실례다).
    (settlement ? 3 : 0) +
    // 국외전출세 전용 공제·가산세 25-E1~25-E4 — 실제로 push 된 개수를 그대로 쓴다
    // (값이 있을 때만 만들어지므로 조건식을 다시 쓰면 두 곳이 어긋난다).
    exitRowCount +
    (hasPriorAggregation ? 6 : 0);
  if (rows.length !== expectedRows) {
    // 개발 중 경고 — 프로덕션에서도 안전하게 통과
    if (typeof console !== "undefined") {
      console.warn(
        `[StockFilingFormTable] 행 수 이상: 기대 ${expectedRows}행, 실제 ${rows.length}행`,
      );
    }
  }

  return rows;
}

