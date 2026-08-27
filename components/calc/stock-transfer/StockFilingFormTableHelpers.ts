/**
 * StockFilingFormTable 순수 계산 헬퍼 — 800줄 분리 정책 준수
 *
 * 32행 고정 신고서 양식 (별지 제84호 서식 — 주식 적용)
 * 부동산 FilingFormTableHelpers.ts 패턴 차용.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import type { StockTransferAggregateResult } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { resolveStockRateKey } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";

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

  const stockCols: Column[] = aggregate.items.map((item, i) => ({
    key: `stock${i}`,
    label: `종목 ${i + 1} (${item.taxCategory})`,
  }));

  return {
    columns: [{ key: "total", label: "합계" }, ...stockCols],
  };
}

// ── 라벨 헬퍼 ─────────────────────────────────────────────────

/**
 * 조문 라벨.
 *
 * ⚠️ `Record<string, string>`이 아니라 **union을 키로** 받는다 — 그래야 `appliedSection94`에
 *    값이 추가될 때 컴파일러가 누락을 잡는다. 종전에는 `Record<string, string>`이라
 *    가목 1)·2)의 라벨이 **서로 뒤바뀐 채로** 아무도 모르게 남아 있었다
 *    (안전망 실측 P-2: 두 라벨을 교환해도 반응하는 테스트 0건).
 *
 * 소득세법 §94①3 가목 (KoreanLaw 실측, mst 280405):
 *   1) … **대주주가 양도하는** 주식등
 *   2) 1)에 따른 **대주주에 해당하지 아니하는 자가 증권시장에서의 거래에 의하지 아니하고**
 *      양도하는 주식등
 */
function sectionLabel(appliedSection94: StockTransferResult["appliedSection94"]): string {
  const map: Record<StockTransferResult["appliedSection94"], string> = {
    "①3가1)": "§94①3 가목1) — 상장 대주주",
    "①3가2)": "§94①3 가목2) — 상장 비대주주 장외",
    "해당없음": "§94①3 비해당 — 상장 비대주주 장내 (과세대상 아님)",
    "①3나_본문": "§94①3 나목 본문 — 비상장",
    "①3나_단서": "§94①3 나목 단서 — K-OTC",
    "①3다": "§94①3 다목 — 국외주식",
    "①4다": "§94①4 다목 — 과점주주",
    "①4라": "§94①4 라목 — 부동산과다보유",
  };
  return map[appliedSection94] ?? `§94 ${appliedSection94}`;
}

/**
 * ③ 세율구분 그룹 라벨 — 별지 제84호서식 작성요령 4번의 「세율이 같은 자산」 축.
 *
 * 엔진의 `resolveStockRateKey`와 **같은 축**을 쓴다(§102② 통산 그룹과 동일) — 서식의 합산
 * 단위와 통산 단위가 같은 것이 아니라, 둘 다 「세율」을 축으로 삼기 때문이다.
 * 다른 축을 쓰면 표시와 계산이 어긋난다([[feedback_ui_engine_dual_truth_avoidance]]).
 */
function rateGroupLabel(r: StockTransferResult): string {
  if (r.isExempt) return "비과세 (합산 제외)";
  const key = resolveStockRateKey(
    r.taxCategory,
    // 중소기업 축은 결과에 남지 않는다 — 세율에서 역산한다(10%면 중소, 20%면 비중소).
    r.appliedRate === 0.1,
    r.isShortTermHolding,
  );
  const LABEL: Record<string, string> = {
    "10": "10% 그룹",
    "20": "20% 그룹 (국내 비대주주·국외주식 공통)",
    "20_25": "20~25% 그룹 (대주주 누진)",
    "30": "30% 그룹 (비중소 대주주 1년 미만)",
    other_asset_progressive: "기타자산 누진 (③란 합산 제외)",
    other_asset_progressive_nbl: "기타자산 §104①9호 (③란 합산 제외)",
    exempt_or_out_of_scope: "비과세·범위 밖",
  };
  return LABEL[key] ?? key;
}

function acquisitionModeLabel(mode: StockTransferResult["acquisitionMode"]): string {
  const map: Record<string, string> = {
    actual: "실가",
    sale_case: "매매사례",
    appraisal: "감정가액",
    estimated: "환산취득가 (§165⑤)",
    face_value: "액면가 (장부분실)",
  };
  return map[mode] ?? mode;
}

function taxCategoryLabel(cat: StockTransferResult["taxCategory"]): string {
  const map: Record<string, string> = {
    listed_major: "상장 대주주",
    listed_non_major_in_market: "상장 비대주주 (장내)",
    // legacy — 통합 이후 새로 만들지 않는다(저장된 이력 표시용)
    listed_otc_non_major: "상장 비대주주 (장외)",
    listed_off_market_non_major: "상장 비대주주 (장외)",
    unlisted_major: "비상장 대주주",
    unlisted_non_major: "비상장 소액",
    kotc_sme_mid_exempt: "K-OTC 중소·중견 (비과세)",
    kotc_venture_exempt: "K-OTC 벤처 (비과세)",
    other_asset_block_shareholder: "과점주주 (§94①4 다목)",
    other_asset_heavy_re: "부동산과다보유 (§94①4 라목)",
    // §104①9호 — 분류는 다목·라목 그대로이고 세율만 기본세율 + 10%p다.
    // ⚠️ 이 map은 `map[cat] ?? cat` 폴백이라 **누락돼도 tsc가 잡지 못한다** —
    //   빠뜨리면 내부 id가 화면에 그대로 노출된다(memory `feedback_no_internal_id_in_result`).
    other_asset_block_shareholder_nbl: "과점주주 (§94①4 다목) · §104①9호 비사업용토지 과다소유법인",
    other_asset_heavy_re_nbl: "부동산과다보유 (§94①4 라목) · §104①9호 비사업용토지 과다소유법인",
    out_of_scope_foreign: "해외주식 (별도 도메인)",
  };
  return map[cat] ?? cat;
}

function rateLabel(result: StockTransferResult): string {
  if (result.isExempt) return "비과세";
  const pct = (result.appliedRate * 100).toFixed(1);
  if (result.appliedRate === 0.30) return "30% (§104①11 가목1) 단기)";
  if (result.appliedRate === 0.20) return "20% (§104①11 가목2) / 나목2))";
  if (result.appliedRate === 0.10) return "10% (§104①11 나목1) 중소)";
  if (result.appliedRate === 0.25) return "25% (§104①11 가목2) 초과 구간)";
  return `${pct}% (§55 누진)`;
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

  // 보유기간 문자열
  const holdingMonthsStr = (r: StockTransferResult) =>
    `${r.holdingPeriodMonths}개월`;

  // 기본공제 그룹 라벨
  const basicDeductGroupLabel = (r: StockTransferResult) =>
    r.basicDeductionGroup === "stock"
      ? "§103①2호 (주식 그룹)"
      : "§103①1호 (부동산·기타자산 그룹)";

  const rows: RowDef[] = [];

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

  /** 분모가 사용자 입력이 아니라 1주당 양도가액 자동 대체인지 — 거짓 표시 방지 */
  const transferStdLabel = (r: StockTransferResult) =>
    r.valuationDetail?.conversionUsedFallback
      ? "12-2.  환산 분모 — 양도 당시 1주당 기준시가 (미입력 · 1주당 양도가액으로 대체)"
      : "12-2.  환산 분모 — 양도 당시 1주당 기준시가";

  rows.push({
    label: transferStdLabel(result),
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
      () => null,
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

  // ── [E] 양도차익·소득금액 (18~19) ─────────────────────────────

  // 18. 양도차익
  rows.push({
    label: "18. 양도차익 (①−②−③)",
    values: val(
      result.transferIncome,
      (agg) => agg.totalTransferIncome,
      (item) => item.transferIncome,
    ),
    highlight: true,
  });

  // 18-1. 양도차손 통산 (§102② · 시행령 §167의2) — 다자산 모드에서 통산이 일어난 경우만.
  //   부동산 정본이 `calculationSteps`에 한 행으로 노출하는 것과 대칭이다
  //   (`transfer-tax-aggregate.ts` 「양도차손 통산 (§102② · 시행령 §167의2)」).
  //   잔여 차손은 **소멸**한다(양도소득에 결손금 이월 없음) — 그 사실을 라벨에 남긴다.
  if (aggregate?.aggregated.lossOffset) {
    const { totalOffset, unusedLoss } = aggregate.aggregated.lossOffset;
    rows.push({
      label:
        unusedLoss > 0
          ? `18-1. 양도차손 통산 (§102②·영 §167의2) — 잔여 ${unusedLoss.toLocaleString()} 소멸(이월 불가)`
          : "18-1. 양도차손 통산 (§102②·영 §167의2)",
      values: val(0, () => -totalOffset, () => null),
    });
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
    label: "20. 기본공제 (§103① 그룹별 250만 한도)",
    values: val(
      result.basicDeduction,
      (agg) =>
        agg.basicDeductionByGroup.stock +
        agg.basicDeductionByGroup.real_estate_and_other_asset,
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
    label: "24.   누진공제 (§55 / §104①11 가목2)",
    values: val(
      result.progressiveDeduction ?? null,
      () => null,
      (item) => item.progressiveDeduction ?? null,
    ),
    indent: true,
  });

  // 25. 산출세액
  rows.push({
    label: "25. 산출세액 (§47① 10원 미만 절사)",
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
      label: "25-1. 외국납부세액공제 §118의6①1호 (한도 = 산출세액 × 해당 종목 소득 ÷ 국외주식 소득)",
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

  // ── [H] 가산세·공제 (26~28) ───────────────────────────────────

  // 26. 신고불성실 가산세 §47의2
  rows.push({
    label: "26. 신고불성실 가산세 §47의2 (10%·20%·40%·60%)",
    values: val(
      result.underReportPenalty || null,
      (agg) => agg.totalUnderReportPenalty || null,
      (item) => item.underReportPenalty || null,
    ),
  });

  // 27. 납부불성실 가산세 §47의4
  rows.push({
    label: "27. 납부불성실 가산세 §47의4 (1일 22/100,000)",
    values: val(
      result.latePaymentPenalty || null,
      // 신고 단위 1회 산정이라 합계 열에만 값이 있다(종목 열은 전부 0 → null)
      (agg) => agg.totalLatePaymentPenalty || null,
      (item) => item.latePaymentPenalty || null,
    ),
  });

  // 28. 전자신고 세액공제 §52의2
  rows.push({
    label: "28. 전자신고 세액공제 §52의2 (−20,000)",
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
    label: "30. 지방소득세 §103의3 (산출세액 × 10%, 10원 절사)",
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

  // ── [J] 신고 (32) ─────────────────────────────────────────────

  // 32. 신고기한 §105①2호 (양도일 속한 반기 말일 + 2개월)
  rows.push({
    label: "32. 신고기한 §105①2호 (양도일 반기 말일 + 2개월)",
    values: val(
      "예정신고: 반기 말일 + 2개월 / 확정신고: 다음연도 5월 31일",
      () => "예정신고: 반기 말일 + 2개월 / 확정신고: 다음연도 5월 31일",
      () => null,
    ),
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
  const expectedRows =
    33 +
    (aggregate?.aggregated.lossOffset ? 1 : 0) +
    (isMulti ? 1 : 0) +
    (hasForeignCredit ? 1 : 0);
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

