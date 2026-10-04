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
>;

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
    transferDate: toOptionalDate(form.transferDate),
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
    acquisitionCause: form.acquisitionCause || "purchase", // 3중 패턴 default
    acquisitionDate: form.acquisitionDate,
    is94_4: isSection94_4Form(form),
    isSplitOrLots,
  });
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
