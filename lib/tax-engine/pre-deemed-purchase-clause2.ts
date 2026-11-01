/**
 * 영 §176조의2④2호 ② — 취득 당시 실지거래가액 + 취득일~의제취득일 직전일 생산자물가상승분
 *   = floor(실가 × 1984.12. 지수 ÷ 취득월 지수) — 재산46014-10094 · 1965.01. 전 취득월은 직접 입력 배율
 * 단건 STEP 0.471(`transfer-pre-deemed-purchase.ts`)과 일반건물 실가 경로(`general-building-route-actual.ts`)가 같이 쓴다 — 산식 이중화 금지.
 */
import type { PreDeemedPurchaseDetail, PreDeemedPurchaseInput } from "./types/transfer-pre-deemed-purchase.types";
import { DEEMED_ACQUISITION_DATE } from "./types/inheritance-acquisition.types";
import { monthKey, mulDivFloor, ppiMonthlyX100, ratioToScaled6 } from "./producer-price-ratio";

/** 의제취득일 직전일이 속하는 달 — 1984.12. */
const DEEMED_PREV = monthKey(new Date(DEEMED_ACQUISITION_DATE.getTime() - 86_400_000));

export type PreDeemedClause2Detail = Omit<PreDeemedPurchaseDetail, "clause1Amount" | "clause1Method" | "selected" | "expenseBasis">;

/** @returns ②와 그 산정 내역 · 취득월이 지수 계열 전인데 배율이 없으면 undefined(자동 fallback 금지 — ⑧·⑫가 막는 입력) */
export function computePreDeemedClause2(actualBase: number, pd: PreDeemedPurchaseInput): PreDeemedClause2Detail | undefined {
  const acq = monthKey(pd.originalAcquisitionDate);
  const ppiAcq = ppiMonthlyX100(acq.year, acq.month);
  const ppiPrev = ppiMonthlyX100(DEEMED_PREV.year, DEEMED_PREV.month);
  let clause2Amount: number;
  let ratio: number;
  let ratioSource: PreDeemedPurchaseDetail["ratioSource"] = "table";
  if (ppiAcq !== undefined && ppiPrev !== undefined) {
    clause2Amount = mulDivFloor(actualBase, BigInt(ppiPrev), BigInt(ppiAcq));
    ratio = ppiPrev / ppiAcq;
  } else if (pd.ppiRatio !== undefined && pd.ppiRatio > 0) {
    ratioSource = "override";
    ratio = pd.ppiRatio;
    clause2Amount = mulDivFloor(actualBase, ratioToScaled6(ratio), BigInt(1_000_000));
  } else {
    return undefined;
  }
  return {
    originalAcquisitionDate: pd.originalAcquisitionDate.toISOString().slice(0, 10),
    acquisitionMonth: acq.key,
    deemedPrevMonth: DEEMED_PREV.key,
    ...(ppiAcq !== undefined ? { ppiAtAcquisition: ppiAcq / 100 } : {}),
    ...(ppiPrev !== undefined ? { ppiAtDeemedPrev: ppiPrev / 100 } : {}),
    ratioSource,
    ratio,
    actualBase,
    clause2Amount,
  };
}
