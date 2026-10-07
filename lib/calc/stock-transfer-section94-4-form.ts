/**
 * 폼(⑤⑧③) · 요청 본문(⑫)에서 §94①4호(기타자산) 여부를 판정한다 — 의제취득일(영 §162⑦1호 1985.1.1.) 축.
 *
 * 판정 자체는 엔진 leaf `isSection94_4Asset` 하나다. 여기서는 **단위만** 맞춘다 —
 * 폼은 % 문자열·날짜 문자열이고, 엔진은 0~1 소수·Date다. 변환은 ④(`stock-transfer-tax-api.ts`
 * 「§94①4 다목 요건 3종 + 합산창」)와 같은 규칙이어야 엔진 분류와 같은 답이 나온다.
 * parity: `__tests__/calc/stock-deemed-date-gates.anchor.test.ts` Y1-3.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  isSection94_4Asset,
  resolveStockDeemedDateString,
} from "@/lib/tax-engine/stock-transfer/stock-deemed-acquisition-date";
import { isPreDeemedPurchase } from "@/lib/tax-engine/stock-transfer/stock-pre-deemed-acquisition";
import { isBookLostAtAcquisition } from "@/lib/tax-engine/stock-transfer/gift-acquisition-163-9";
import { isTradingHaltMarketScopeViolation } from "@/lib/tax-engine/stock-transfer/trading-halt-market-scope";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { isSection165_4_1ReversalCorp } from "@/lib/tax-engine/stock-transfer/section165-4-reversal-corp";
import { reversalCorpDerivedBasis } from "@/lib/tax-engine/stock-transfer/section165-4-reversal-corp";
import { parseFloatOrUndef } from "./stock-transfer-tax-api-parse";
import { toEngineAcquisitionCause } from "./stock-acquisition-cause";
import { effectiveTransferDate, type EffectiveTransferDateFields } from "@/lib/calc/stock-effective-transfer-date";

export type Section94_4FormFields = Pick<
  StockTransferFormData,
  | "marketType"
  | "isHeavyRealEstateForRate"
  | "isQualifyingBlockShareholder"
  | "blockShareholderRealEstateRatio"
  | "blockShareholderOwnershipRatio"
  | "cumulativeTransferRatio"
  | "aggregationFirstTransferDate"
  | "transferDate"
> &
  // 분할 모드는 가장 이른 매도 lot 일자가 양도일이다(④와 같은 leaf — 엔진 4호 판정과 일치)
  EffectiveTransferDateFields;

function pctToRatio(s: string | undefined): number | undefined {
  const n = s ? parseFloatOrUndef(s) : undefined;
  return n === undefined ? undefined : n * 0.01;
}

/**
 * 영 §165④1호 괄호(2:3) 대상 법인 — 폼(⑤⑧) 판정. 엔진 leaf `isSection165_4_1ReversalCorp`와 같은 사실을
 * ④와 같은 단위 규칙(% → 소수)으로 넘긴다.
 */
export type ReversalCorpFormFields = Pick<
  StockTransferFormData,
  | "isHeavyRealEstateForValuation"
  | "isQualifyingBlockShareholder"
  | "blockShareholderRealEstateRatio"
  | "isHeavyRealEstateForRate"
>;

function reversalCorpFacts(form: ReversalCorpFormFields) {
  return {
    isHeavyRealEstateForValuation: form.isHeavyRealEstateForValuation,
    isQualifyingBlockShareholder: form.isQualifyingBlockShareholder,
    blockShareholderRealEstateRatio: pctToRatio(form.blockShareholderRealEstateRatio),
    isHeavyRealEstateForRate: form.isHeavyRealEstateForRate,
  };
}

export function isReversalCorpForm(form: ReversalCorpFormFields): boolean {
  return isSection165_4_1ReversalCorp(reversalCorpFacts(form));
}

/** 다목·라목 사실로 자동 성립하는 근거 — 화면은 이때 토글을 켠 채 잠근다 */
export function reversalCorpDerivedBasisForm(form: ReversalCorpFormFields): "ra_mok" | "da_mok_ratio" | undefined {
  return reversalCorpDerivedBasis(reversalCorpFacts(form));
}

export function isSection94_4Form(form: Section94_4FormFields): boolean {
  return isSection94_4Asset({
    marketType: form.marketType,
    isHeavyRealEstateForRate: form.isHeavyRealEstateForRate,
    isQualifyingBlockShareholder: form.isQualifyingBlockShareholder,
    blockShareholderRealEstateRatio: pctToRatio(form.blockShareholderRealEstateRatio),
    blockShareholderOwnershipRatio: pctToRatio(form.blockShareholderOwnershipRatio),
    cumulativeTransferRatio: pctToRatio(form.cumulativeTransferRatio),
    aggregationFirstTransferDate: toOptionalDate(form.aggregationFirstTransferDate),
    transferDate: toOptionalDate(effectiveTransferDate(form)),
  });
}

/**
 * R-1 — 4호 판정이 바뀌어 **환산 분자의 기준일**(의제취득일)이 움직이면 취득측 1개월 종가 잔재를 비운다.
 *
 * 의제 대상(1985년 이전 취득)에서 라목·다목 토글·시장 종류를 바꾸면 기준일이 1986.1.1. ↔ 1985.1.1.로
 * 옮겨진다. 일자별 표는 기준일로 매 렌더 재계산되지만 저장된 평균·종가 배열은 그대로 남아, 화면과
 * 엔진에 가는 분자가 갈린다 — 취득일을 바꿀 때(`AcquisitionInfoBlock` `handleAcqDateChange`)와 같은 결함이다.
 * onChange patch에 동승시킨다(useEffect 미러링 금지). 취득일 자체를 바꾸는 patch는 그쪽이 이미 처리한다.
 */
export function withDeemedBaseReset(
  form: Section94_4FormFields & Pick<StockTransferFormData, "acquisitionDate">,
  patch: Partial<StockTransferFormData>,
): Partial<StockTransferFormData> {
  if ("acquisitionDate" in patch) return patch;
  const next = { ...form, ...patch };
  const before = resolveStockDeemedDateString(form.acquisitionDate, isSection94_4Form(form)).effectiveDate;
  const after = resolveStockDeemedDateString(next.acquisitionDate, isSection94_4Form(next)).effectiveDate;
  if (before === after) return patch;
  return {
    ...patch,
    acquisitionPriceDates: [],
    acquisitionPriceClosing: [],
    acquisitionDatePriceAvg1Month: "",
  };
}

/**
 * 의제취득일 전 «매수»·단건 모드인가 (영 §176의2④ — Z-1) — ④·⑤·⑧이 공유한다.
 * 엔진 `resolvePreDeemedBasis`와 같은 leaf(`isPreDeemedPurchase`)에 폼 단위 입력만 맞춰 넘긴다.
 * 분할(lot)·lots-only 입력은 엔진 `isSplitMode`와 같이 범위 밖이다.
 */
export function isPreDeemedPurchaseForm(
  form: Section94_4FormFields &
    Pick<
      StockTransferFormData,
      "acquisitionCause" | "acquisitionDate" | "lotsMode" | "acquisitionMode" | "acquisitionActualInputMode"
    >,
): boolean {
  const isSplitOrLots =
    form.lotsMode === "split" ||
    ((form.acquisitionMode || "actual") === "actual" && form.acquisitionActualInputMode === "lots");
  return isPreDeemedPurchase({
    marketType: form.marketType,
    // 3중 패턴 default — ④와 같은 매핑(유상증자·과세 무상주 = 매수)이어야 ⑤⑧과 엔진이 갈리지 않는다
    acquisitionCause: toEngineAcquisitionCause(form.acquisitionCause || "purchase"),
    acquisitionDate: form.acquisitionDate,
    is94_4: isSection94_4Form(form),
    isSplitOrLots,
  });
}

/** 분할·다건 lot 모드인가 — `isPreDeemedPurchaseForm` 의 `isSplitOrLots` 와 같은 정의(단일 소스) */
export function isLotsModeForm(
  form: Pick<StockTransferFormData, "lotsMode" | "acquisitionMode" | "acquisitionActualInputMode">,
): boolean {
  return form.lotsMode === "split" || ((form.acquisitionMode || "actual") === "actual" && form.acquisitionActualInputMode === "lots");
}

/**
 * 폼의 의제취득일 전 «매수» lot 인덱스(입력 순서) — 엔진 술어 `isPreDeemedPurchase` 에 lot 값을 넘긴다.
 * ⑤(① 카드 노출)·④(전송 게이트)·⑧ 이 같은 답을 내야 한다. 유상증자·과세 무상주는 「매수」다(`toEngineAcquisitionCause`).
 */
export function preDeemedLotIndexesForm(form: StockTransferFormData): number[] {
  const is94_4 = isSection94_4Form(form);
  return (form.acquisitionLots ?? [])
    .map((l, i) =>
      isPreDeemedPurchase({
        marketType: form.marketType,
        acquisitionCause: toEngineAcquisitionCause(l.acquisitionCause),
        acquisitionDate: l.acquisitionDate,
        is94_4,
        isSplitOrLots: false,
      })
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
}

/**
 * 분할·다건 lot 의 ① 비교(영 §176의2④1호)가 «켜져 있는가» — lot 모드 ∧ 방식 선택 ∧ 의제 대상 매수 건 ≥ 1.
 * ④ 전송 게이트·⑤ 사이드바/Step3 안내가 같은 답을 내도록 한 곳에 둔다(엔진이 켜는 조건과 같다).
 */
export function isPreDeemedLotClause1On(form: StockTransferFormData): boolean {
  return (
    isLotsModeForm(form) &&
    (form.preDeemedLotClause1Mode === "estimated" || form.preDeemedLotClause1Mode === "sale_case") &&
    preDeemedLotIndexesForm(form).length > 0
  );
}

export type BookLostFormFields = Pick<
  StockTransferFormData,
  "marketType" | "acqFaceValueOnly" | "acqFaceValuePerShare" | "acquisitionStdMode"
>;

/**
 * 폼(⑤⑧③)에서 «취득시점 장부분실»이 성립하는가 — 영 §163⑨ 추계 차단의 예외 신호.
 *
 * 판정은 엔진 leaf `isBookLostAtAcquisition` 하나다. 여기서는 폼 → 엔진 입력의 **변환만** 맞춘다:
 * ④(`stock-transfer-tax-api.ts`)가 `tradingHaltAtTransfer = haltAllowed && acquisitionStdMode === "halt_transfer"`로
 * 싣는 것과 같은 규칙이다(코스피에서 고른 거래정지 stale 값은 성립하지 않는다).
 */
export function isBookLostAtAcquisitionForm(form: BookLostFormFields): boolean {
  return isBookLostAtAcquisition({
    acqFaceValueOnly: form.acqFaceValueOnly === true,
    acqFaceValuePerShare: parseFloatOrUndef(form.acqFaceValuePerShare ?? ""),
    marketType: form.marketType,
    tradingHaltAtTransfer:
      !isTradingHaltMarketScopeViolation(form.marketType) && form.acquisitionStdMode === "halt_transfer",
  });
}
