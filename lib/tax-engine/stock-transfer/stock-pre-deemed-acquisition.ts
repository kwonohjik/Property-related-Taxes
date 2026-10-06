/**
 * 의제취득일 전 «매수» 주식 — 영 §176의2④ 「많은 것」 (Z-1)
 *
 * 영 §176의2④: 의제취득일 전에 취득한 자산의 의제취득일 현재 취득가액은 다음 중 **많은 것**이다.
 *   1호 ① 의제취득일 현재 §176의2③1~3호 가액(매매사례가액·감정가액·환산취득가액)
 *   2호 ② 취득 당시 실지거래가액(또는 ③1·2호 가액) + 그 가액에 취득일부터 의제취득일의 직전일까지의
 *        생산자물가상승률을 곱하여 계산한 금액
 * 법 §97②1호 나목 — ②가 채택되면 필요경비는 «실지거래가액 방식»(② + 자본적지출·양도비)이다.
 * ①이 채택되면 법 §97②2호(① + 개산공제, 환산이면 단서 swap).
 *
 * 근거 해석: 대법원 2004두1520(비상장주식 — 실지거래가액으로 신고하는 경우에도 많은 것) ·
 *   재산46014-10094(생산자물가상승률 계산식) · 제도46014-12108(주식 사안) · 서일46014-10386(기타자산 주식).
 *   계획서: docs/00-pm/stock-pre-deemed-acquisition-176-2-4.plan.md
 *
 * 생산자물가상승 배율(재산46014-10094, 계획서 Q-2):
 *   배율 = (의제취득일의 직전일이 속하는 달의 생산자물가지수) ÷ (취득일이 속하는 달의 생산자물가지수)
 *   ② = floor(실가 총액 × 배율) — 정수 연산(BigInt, 지수 ×100 고정소수).
 *
 * 적용 범위: 취득원인 매수 · 취득일(원값) < 의제취득일. 상속·증여·합병·이월과세는 범위 밖.
 *   단건 모드는 `resolvePreDeemedBasis`(①·② 비교), 분할·다건 lot 모드는 `applyPreDeemedToLots`(② — lot 입력은 실가뿐).
 * 입력 날짜는 비파괴 저장이라 원값이 그대로 온다(Y-1) — 의제 여부는 `resolveStockDeemedDate`로 판정한다.
 */

import { actualAcquisitionTotal } from "./stock-actual-acquisition";
import type { AcquisitionBasisResult } from "./stock-acquisition-basis";
import { resolveStockDeemedDate, stockDeemedAcquisitionDate } from "./stock-deemed-acquisition-date";
import { isMarketSampleAllowedMarket } from "./stock-valuation-market-sample";
import {
  PRODUCER_PRICE_INDEX_MONTHLY,
  PPI_MONTHLY_FIRST_YEAR,
  PPI_MONTHLY_LAST_YEAR,
} from "../data/producer-price-index";
import { STOCK } from "@/lib/tax-engine/legal-codes/stock";
import type { AcquisitionLot, StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";

export type PreDeemedDetail = NonNullable<StockTransferResult["preDeemedAcquisitionDetail"]>;

const PRE_DEEMED_MARKETS: ReadonlySet<string> = new Set(["kospi", "kosdaq", "konex", "unlisted", "other_asset"]);

/** 1965.01 이전 취득 + 배율 미입력 — ⑧·⑫ 공용 문구 (계획서 Q-4) */
export const PRE_DEEMED_PPI_RATIO_REQUIRED_MESSAGE =
  "취득월이 생산자물가지수 계열(1965.01~) 이전이라 물가상승 배율을 직접 입력해야 합니다 — " +
  "배율 = 의제취득일 직전 달 지수를 취득월 지수로 나눈 비율 " +
  `(${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED}2호 · ${STOCK.ENFORCEMENT_RULE_85_2_PPI_RATE}①)`;

/** 의제취득일 전 «매수»·단건 모드인가 — 엔진·⑧·⑫·⑤가 공유하는 단일 판정 */
export function isPreDeemedPurchase(args: {
  marketType: string | undefined;
  acquisitionCause: string | undefined;
  acquisitionDate: Date | string | undefined;
  is94_4: boolean;
  isSplitOrLots: boolean;
}): boolean {
  // 국내 주식·기타자산만 — 국외주식·국외전출세는 별도 엔진이다
  if (!args.marketType || !PRE_DEEMED_MARKETS.has(args.marketType)) return false;
  if (args.acquisitionCause !== "purchase" || args.isSplitOrLots || !args.acquisitionDate) return false;
  const d = args.acquisitionDate instanceof Date ? args.acquisitionDate : new Date(args.acquisitionDate);
  if (Number.isNaN(d.getTime())) return false;
  return resolveStockDeemedDate(d, args.is94_4).isDeemedApplied;
}

/** 취득월이 PPI 계열(1965.01~) 이전인가 — 이때만 직접 입력 배율이 필요하다(계획서 Q-4) */
export function isBeforePpiSeries(date: Date | string | undefined): boolean {
  if (!date) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d.getUTCFullYear() < PPI_MONTHLY_FIRST_YEAR;
}

/** "YYYY-MM" — 날짜의 UTC 연월 */
function monthKey(d: Date): { year: number; month: number; key: string } {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  return { year, month, key: `${year}-${String(month).padStart(2, "0")}` };
}

/** 의제취득일의 «직전일이 속하는 달» — 의제취득일은 항상 1월 1일이라 전년 12월이다 */
export function deemedPrevMonth(is94_4: boolean): { year: number; month: number; key: string } {
  const deemed = new Date(stockDeemedAcquisitionDate(is94_4));
  return monthKey(new Date(deemed.getTime() - 86_400_000));
}

/** 월간 지수 ×100 고정소수 — 표 밖이면 undefined. 표는 ECOS 소수 2자리라 ×100이 정수다. */
export function ppiMonthlyX100(year: number, month: number): number | undefined {
  if (year < PPI_MONTHLY_FIRST_YEAR || year > PPI_MONTHLY_LAST_YEAR) return undefined;
  const v = PRODUCER_PRICE_INDEX_MONTHLY[year]?.[month - 1];
  // 소수 2자리 데이터의 정수화 — 세액 반올림이 아니라 부동소수 표현(17.61 → 1761.0000000000002) 제거다.
  return v === undefined ? undefined : Math.round(v * 100);
}

/** floor(base × num ÷ den) — BigInt, 총액 1회 절사 */
function mulDivFloor(base: number, num: bigint, den: bigint): number {
  return Number((BigInt(base) * num) / den);
}

/** 사용자 직접 입력 배율(소수) → 10^-6 고정소수. 6자리 문자열 변환이라 부동소수 곱셈 오차가 없다. */
function ratioToScaled6(ratio: number): bigint {
  return BigInt(ratio.toFixed(6).replace(".", ""));
}

export interface PreDeemedResolution {
  /** 최종 취득가액 산정 결과 — 호출부가 이것으로 STEP 3 변수를 대체한다 */
  basis: AcquisitionBasisResult;
  /** STEP 4(필요경비)가 읽는 유효 모드 — ② 채택 시 실가·실비 */
  acquisitionMode: StockTransferInput["acquisitionMode"];
  expenseMode: StockTransferInput["expenseMode"];
  /** ②를 산정하지 못한 경우(1965.01 이전 취득 + 배율 미입력 — 엔진 직접 호출 방어)에는 없다 */
  detail?: PreDeemedDetail;
  appliedRulesDelta: StockTransferResult["appliedRules"];
  warningsDelta: string[];
}

/**
 * STEP 3 이후 보정 — ② 산정 + max 선택. 해당 없으면 undefined(호출부는 종전 경로 그대로).
 *
 * @param baseBasis `resolveAcquisitionBasis`가 입력 모드대로 산정한 ①(또는 실가) 결과
 */
export function resolvePreDeemedBasis(
  input: StockTransferInput,
  is94_4: boolean,
  baseBasis: AcquisitionBasisResult,
  isSplitOrLots: boolean,
): PreDeemedResolution | undefined {
  if (
    !isPreDeemedPurchase({
      marketType: input.marketType,
      acquisitionCause: input.acquisitionCause,
      acquisitionDate: input.acquisitionDate,
      is94_4,
      isSplitOrLots,
    })
  ) {
    return undefined;
  }
  const mode = input.acquisitionMode;
  if (mode === "face_value") return undefined; // 장부분실 액면가 — 별도 경로

  // ② 기준 실가 총액 — 실가 모드는 기존 실가 입력, 환산·매매사례 모드는 «함께 견주는» 전용 칸
  const actualBase =
    mode === "actual"
      ? actualAcquisitionTotal(input)
      : Math.max(0, Math.floor(input.preDeemedActualPricePerShare ?? 0)) * input.shareCount;
  if (!(actualBase > 0)) return undefined;

  const acq = monthKey(input.acquisitionDate);
  const prev = deemedPrevMonth(is94_4);
  const ppiAcq = ppiMonthlyX100(acq.year, acq.month);
  const ppiPrev = ppiMonthlyX100(prev.year, prev.month);

  const warningsDelta: string[] = [];
  let clause2Amount: number | undefined;
  let ratioSource: PreDeemedDetail["ratioSource"] = "table";
  let ratio: number | undefined;
  if (ppiAcq !== undefined && ppiPrev !== undefined) {
    clause2Amount = mulDivFloor(actualBase, BigInt(ppiPrev), BigInt(ppiAcq));
    ratio = ppiPrev / ppiAcq;
  } else if (input.preDeemedPpiRatio !== undefined && input.preDeemedPpiRatio > 0) {
    // 취득월이 PPI 계열(1965.01~) 이전 — 사용자 직접 입력 배율(계획서 Q-4)
    ratioSource = "override";
    ratio = input.preDeemedPpiRatio;
    clause2Amount = mulDivFloor(actualBase, ratioToScaled6(ratio), BigInt(1_000_000));
  } else {
    // 자동 fallback 금지 — ⑧·⑫가 막는 입력이다. 엔진 직접 호출 방어로 ②를 «산정하지 않았음»을 남긴다.
    warningsDelta.push(
      `취득월(${acq.key})이 생산자물가지수 계열(1965.01~) 이전이라 ②(${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED} 2호)를 산정하지 않았습니다 — 물가상승 배율을 입력하세요.`,
    );
  }

  // ① — 입력 모드가 환산·매매사례이고 그 가액이 산정된 경우
  let clause1Amount: number | undefined;
  let clause1Method: PreDeemedDetail["clause1Method"];
  if (mode === "estimated" || mode === "sale_case") {
    // 매매사례는 상장 제외(영 §176의2③1호 괄호)·사례가 «명시 입력»만 ①로 본다 —
    // `sale_case` 경로의 legacy fallback(사례가 미입력 → 실가)은 ②와 같은 값이라 ①이 아니다.
    const sampleOk =
      mode !== "sale_case" ||
      (isMarketSampleAllowedMarket(input.marketType) && (input.acquisitionMarketSamplePrice ?? 0) > 0);
    if (sampleOk && baseBasis.acquisitionPrice > 0) {
      clause1Amount = baseBasis.acquisitionPrice;
      clause1Method = mode;
    }
  }

  if (clause2Amount === undefined) {
    // ② 없음 → 입력 모드대로(종전 경로) 진행하되 사유를 남긴다. ⑧·⑫가 UI·API에서 먼저 막는다.
    return {
      basis: baseBasis,
      acquisitionMode: mode,
      expenseMode: input.expenseMode,
      appliedRulesDelta: [],
      warningsDelta,
    };
  }
  const selected: PreDeemedDetail["selected"] =
    clause1Amount !== undefined && clause1Amount > clause2Amount ? "clause1" : "clause2";

  const detail: PreDeemedDetail = {
    deemedDate: stockDeemedAcquisitionDate(is94_4),
    actualBase,
    acquisitionMonth: acq.key,
    deemedPrevMonth: prev.key,
    ...(ppiAcq !== undefined ? { ppiAtAcquisition: ppiAcq / 100 } : {}),
    ...(ppiPrev !== undefined ? { ppiAtDeemedPrev: ppiPrev / 100 } : {}),
    ratioSource,
    ...(ratio !== undefined ? { ratio } : {}),
    clause2Amount,
    ...(clause1Amount !== undefined ? { clause1Amount, clause1Method } : {}),
    selected,
    expenseBasis: selected === "clause2" ? "actual" : "estimated",
  };

  const appliedRulesDelta: StockTransferResult["appliedRules"] = ["의제취득일물가상승가산"];
  warningsDelta.push(
    // 결과 표시에는 「원」을 붙이지 않는다(feedback_no_won_suffix) — 단위는 문장 머리에 한 번만
    `${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED} — 의제취득일(${detail.deemedDate}) 전 취득(단위: 원): ` +
      `② 취득 당시 실가 + 생산자물가상승분 ${clause2Amount.toLocaleString("ko-KR")}` +
      (clause1Amount !== undefined
        ? ` · ① 의제취득일 현재 ${clause1Method === "sale_case" ? "매매사례가액" : "환산취득가액"} ${clause1Amount.toLocaleString("ko-KR")} 중 많은 것을 취득가액으로 합니다.`
        : " 을 취득가액으로 합니다(① 의제취득일 현재 매매사례·환산가액 미입력)."),
  );

  if (selected === "clause1") {
    // ① 채택 — 입력 모드 그대로(환산이면 §97②2호 단서 swap, 매매사례면 개산공제)
    return {
      basis: baseBasis,
      acquisitionMode: mode,
      expenseMode: input.expenseMode,
      detail,
      appliedRulesDelta,
      warningsDelta,
    };
  }

  // ② 채택 — 취득가액 = ② · 개산공제 없음 · 필요경비는 실비(법 §97②1호 나목)
  const perShare = input.shareCount > 0 ? Math.floor(clause2Amount / input.shareCount) : 0;
  return {
    basis: {
      ...baseBasis,
      acquisitionPrice: clause2Amount,
      usedEstimatedAcquisition: false,
      estimatedBase: undefined,
      estimatedDeduction: undefined,
      valuationDetail: {
        method: "actual_acquisition",
        netAssetFloorApplied: false,
        finalPerShareValue: perShare,
      },
      postListingDetail: undefined,
      // ①의 부수 산출(보충평가 경고·80% 하한 배지)은 ②가 채택되면 취득가액과 무관하다 — 싣지 않는다
      appliedRulesDelta: [],
      warningsDelta: [],
    },
    acquisitionMode: "actual",
    expenseMode: "actual",
    detail,
    appliedRulesDelta,
    warningsDelta,
  };
}

// ============================================================
// 분할·다건 lot 모드 — 영 §176의2④2호 ②
// ============================================================

/** 1965.01 이전 취득 lot — ⑧·⑫ 공용 문구. lot 에는 배율 입력 칸이 없어 산정할 수 없다. */
export const PRE_DEEMED_LOT_BEFORE_PPI_MESSAGE =
  "1965년 1월 이전에 취득한 매수 건은 생산자물가지수 계열(1965.01~) 밖이라 매수 건별 입력으로는 " +
  `② 취득 당시 실가 + 생산자물가상승분(${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED}2호)을 산정할 수 없습니다 — ` +
  "한 번에 취득한 주식이면 일자별 매수 건 대신 단일 입력에서 물가상승 배율을 직접 입력하세요";

/** 의제취득일 전 «매수» lot 인가 — 엔진·⑤⑥ 미리보기·⑧·⑫ 공용 (단건 술어를 lot 값으로 부른다) */
function isPreDeemedPurchaseLot(lot: Pick<AcquisitionLot, "acquisitionCause" | "acquisitionDate">, marketType: string | undefined, is94_4: boolean): boolean {
  return isPreDeemedPurchase({
    marketType,
    acquisitionCause: lot.acquisitionCause,
    acquisitionDate: lot.acquisitionDate,
    is94_4,
    isSplitOrLots: false,
  });
}

/** ⑧·⑫ — 이 lot 은 ②를 산정할 수 없는가(의제취득일 전 매수 + 1965.01 이전 취득). 날짜는 원값 문자열도 받는다. */
export function isPreDeemedLotBeforePpiSeries(
  lot: { acquisitionCause: string | undefined; acquisitionDate: Date | string | undefined },
  marketType: string | undefined,
  is94_4: boolean,
): boolean {
  if (!isBeforePpiSeries(lot.acquisitionDate)) return false;
  return isPreDeemedPurchase({ marketType, acquisitionCause: lot.acquisitionCause, acquisitionDate: lot.acquisitionDate, is94_4, isSplitOrLots: false });
}

/**
 * 분할·다건 lot — 의제취득일 전 «매수» lot 의 1주당 단가를 ② 「취득 당시 실지거래가액 + 생산자물가상승분」으로
 * 바꾼다(영 §176의2④2호 — 자산마다, 즉 lot 마다 적용한다). `allocateLots` 직전·자본조정 희석보다 **앞**이다
 * (②는 «취득 당시» 가액의 환산이고, 희석은 그 원가를 늘어난 주식수에 나눌 뿐이다).
 *
 * ⚠️ ① 의제취득일 현재 매매사례·환산가액은 견주지 않는다 — lot 입력은 실가 단가뿐이라 ①을 산정할 입력이 없다.
 *    단건 실가 모드와 같은 한계다(그쪽도 ① 미입력이면 ②로 정한다). 결과 경고 문구로 남긴다.
 * ⚠️ lot 엔진은 1주당 단가로 매칭한다(부분 매도 때문) — ②를 1주당 floor 로 구해 총액 floor 보다 최대 (주식수−1)원 작다.
 *
 * 1965.01 이전 lot 은 배율 입력 칸이 없어 바꾸지 않고 사유를 남긴다 — ⑧·⑫가 먼저 막는다.
 */
export function applyPreDeemedToLots(
  lots: AcquisitionLot[],
  marketType: string | undefined,
  is94_4: boolean,
): { lots: AcquisitionLot[]; applied: boolean; warnings: string[] } {
  const warnings: string[] = [];
  let applied = false;
  const prev = deemedPrevMonth(is94_4);
  const ppiPrev = ppiMonthlyX100(prev.year, prev.month);
  const out = lots.map((lot, i) => {
    if (!isPreDeemedPurchaseLot(lot, marketType, is94_4)) return lot;
    const acq = monthKey(lot.acquisitionDate);
    const ppiAcq = ppiMonthlyX100(acq.year, acq.month);
    const label = `${STOCK.ENFORCEMENT_DECREE_176_2_4_PRE_DEEMED} — 매수 lot #${i + 1}(${acq.key} 취득 · 의제취득일 ${stockDeemedAcquisitionDate(is94_4)} 전)`;
    if (ppiAcq === undefined || ppiPrev === undefined) {
      warnings.push(`${label}: 생산자물가지수 계열(1965.01~) 이전이라 ②를 산정하지 않았습니다.`);
      return lot;
    }
    const price = mulDivFloor(lot.perShareAcquisitionPrice, BigInt(ppiPrev), BigInt(ppiAcq));
    applied = true;
    warnings.push(
      `${label}: ② 취득 당시 1주당 실가 + 생산자물가상승분 ${lot.perShareAcquisitionPrice.toLocaleString("ko-KR")} → ` +
        `${price.toLocaleString("ko-KR")} (지수 ${prev.key} ${ppiPrev / 100} ÷ ${acq.key} ${ppiAcq / 100})을 취득가액으로 합니다` +
        "(① 의제취득일 현재 매매사례·환산가액은 매수 건별 입력에서 산정하지 않습니다).",
    );
    return { ...lot, perShareAcquisitionPrice: price };
  });
  return { lots: out, applied, warnings };
}
