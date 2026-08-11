/**
 * 주식 양도소득세 폼 - 서브 객체 타입 + 빈 행 팩토리.
 *
 * `calc-wizard-stock-store.ts`에서 분리 (800줄 정책).
 * StockTransferFormData 본체는 store에 유지.
 */

import { nanoid } from "nanoid";

// ============================================================
// PR-4B 국외전출세 — 보유 종목 폼 타입 (ExitTaxHoldingForm)
// ============================================================

export interface ExitTaxHoldingForm {
  /** UI key (nanoid) */
  id: string;
  /** 종목명 */
  stockName: string;
  /** 시장 분류 (§178의9: 보유 종목은 국내 상장·비상장 주식) */
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  /** 보유 주식수 (정수 문자열) */
  shareCount: string;
  /** 취득일 "YYYY-MM-DD" */
  acquisitionDate: string;
  /** 1주당 취득가액 (원) 문자열 */
  perShareAcquisitionPrice: string;
  /**
   * 출국일 시가 산정 모드 (§178의9)
   * "market_price"    → 출국일 거래가액 직접 입력
   * "prior_year_std"  → §99①3 기준시가 (1개월 종가평균)
   * "unlisted_sample" → 전후 각 3개월 매매사례가액
   * "unlisted_std"    → §99①4 비상장 기준시가
   */
  departureDayValuationMode: "market_price" | "prior_year_std" | "unlisted_sample" | "unlisted_std";
  /** 출국일 거래가액 1주당 (market_price 모드) */
  departureDayMarketPrice: string;
  /** §99①3 1개월 종가평균 1주당 (prior_year_std 모드) */
  priorYearEndMonthAvg: string;
  /** 전후 각 3개월 매매사례가액 1주당 (unlisted_sample 모드) */
  unlistedSamplePrice: string;
  /** §99①4 비상장 기준시가 1주당 (unlisted_std 모드) */
  unlistedStdPricePerShare: string;
}

/** 신규 국외전출세 보유 종목 빈 행 팩토리 */
export function createEmptyExitTaxHolding(): ExitTaxHoldingForm {
  return {
    id: nanoid(),
    stockName: "",
    marketType: "kospi",           // 3중 패턴 default
    shareCount: "",
    acquisitionDate: "",
    perShareAcquisitionPrice: "",
    departureDayValuationMode: "market_price",  // 3중 패턴 default
    departureDayMarketPrice: "",
    priorYearEndMonthAvg: "",
    unlistedSamplePrice: "",
    unlistedStdPricePerShare: "",
  };
}

// ============================================================
// 분할 매수·분할 양도 lot 타입 (Plan v2.2)
// ============================================================

// R-2 자본조정 폼 (UI 측 string Date·string ratio)
export interface CapitalAdjustmentForm {
  type:
    | "bonus_capital_reserve"
    | "bonus_retained_earnings"
    | "reduction_proportional"
    | "reduction_capital_return";
  eventDate: string;       // "YYYY-MM-DD"
  ratio: string;            // parseDecimal로 변환
  notes: string;
}

export interface AcquisitionLotForm {
  id: string;                                  // UUID (UI key, specificMatchings 참조)
  acquisitionDate: string;                     // "YYYY-MM-DD" (gift는 수증일)
  shareCount: string;                          // 주
  perShareAcquisitionPrice: string;            // 원 (상속/증여 lot도 §163⑨ 평가가액 직접 입력)
  /** `carryover_gift` = §97의2①이 적용되는 증여 (2025.1.1.~ 증여분 · 배우자·직계존비속) */
  acquisitionCause: "purchase" | "inheritance" | "gift" | "carryover_gift" | "merger_split";
  decedentAcquisitionDate?: string;            // 상속 시 피상속인 취득일 (§104②1)
  donorAcquisitionDate?: string;               // 이월과세 시 증여자 취득일 (§104②2)
  preMergerAcquisitionDate?: string;           // 합병·분할 시 종전 주식 취득일 (§104②3)
}

export interface TransferLotForm {
  id: string;
  transferDate: string;
  shareCount: string;
  perShareTransferPrice: string;
}

export interface SpecificMatchingForm {
  transferLotId: string;
  acquisitionLotId: string;
  shareCount: string;
}

/**
 * 취득 다건 + 양도 단건 모드(lots-only)에서 API가 합성하는 단일 매도 lot의 sentinel ID.
 * 개별법(specific)에서 specificMatchings.transferLotId가 이 값을 가리킨다.
 * api.ts(합성)·AcquisitionLotsMatrix(매칭 입력)·validate(합계 검증) 단일 소스 (A-1).
 */
export const SYNTH_SINGLE_TRANSFER_ID = "__synth_single_transfer__";

/**
 * 매수 lot 빈 row 팩토리 — SplitLotsBlock, AcquisitionLotsMatrix, Step2 자동 1행 추가에서 공유.
 * R-12 (계획서) 해결.
 */
export function createEmptyAcquisitionLot(): AcquisitionLotForm {
  return {
    id: nanoid(),
    acquisitionDate: "",
    shareCount: "",
    perShareAcquisitionPrice: "",
    acquisitionCause: "purchase",
  };
}
