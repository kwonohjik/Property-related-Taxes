/**
 * 주식 양도소득세 API 클라이언트 (14지점 ④⑬)
 *
 * 폼 상태(StockTransferFormData) → 엔진 input → POST /api/calc/stock-transfer
 *
 * 3중 패턴 강제:
 *   UI display fallback = API 변환 fallback = validate fallback (동일)
 *
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
 *   미입력 필수 필드는 undefined → 엔진이 오류 반환.
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// ③ normalize helper (빈 문자열 → undefined / 숫자 파싱)
// ============================================================

function parseIntOrUndef(s: string): number | undefined {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? undefined : n;
}

function parseFloatOrUndef(s: string): number | undefined {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? undefined : n;
}

function parseIntOrZero(s: string): number {
  const n = parseInt(s.replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}

// ============================================================
// ④ API 변환 — 폼 → fetch body (⑬ body spread 포함)
// ============================================================

export function buildStockTransferApiBody(form: StockTransferFormData): Record<string, unknown> {
  // 3중 패턴 default 적용 (UI/API/validate 동일)
  const acquisitionMode = form.acquisitionMode || "actual";
  const transferPriceMode = form.transferPriceMode || "actual";
  const acquisitionCause = form.acquisitionCause || "purchase";
  const filingType = form.filingType || "preliminary";

  const body: Record<string, unknown> = {
    // ── 시장 분류 ──
    marketType: form.marketType || "unlisted",

    // ── 대주주 판정 ──
    isMajorShareholder: form.isMajorShareholder,
    selfShareRatio: parseFloatOrUndef(form.selfShareRatio) ?? 0,
    selfMarketCap: parseIntOrZero(form.selfMarketCap),
    isLargestShareholderGroup: form.isLargestShareholderGroup,   // 3중 패턴
    combinedShareRatio: parseFloatOrUndef(form.combinedShareRatio) ?? 0,
    combinedMarketCap: parseIntOrZero(form.combinedMarketCap),
    priorYearEndDate: form.priorYearEndDate || new Date().toISOString().split("T")[0],

    // ── §94①4 기타자산 ──
    isQualifyingBlockShareholder: form.isQualifyingBlockShareholder,
    isHeavyRealEstateForRate: form.isHeavyRealEstateForRate,
    isHeavyRealEstateForValuation: form.isHeavyRealEstateForValuation,

    // ── 회사 분류 ──
    isSmallMediumEnterprise: form.isSmallMediumEnterprise,
    isMidsizeEnterprise: form.isMidsizeEnterprise,
    isListedSmallShareholder: form.isListedSmallShareholder,
    isVentureCompany: form.isVentureCompany,        // 3중 패턴 default: false
    isKOTCTrading: form.isKOTCTrading,              // 3중 패턴 default: false

    // ── 거래 일자·수량 ──
    acquisitionDate: form.acquisitionDate,
    transferDate: form.transferDate,
    shareCount: parseIntOrUndef(form.shareCount) ?? 1,
    totalIssuedShares: parseIntOrUndef(form.totalIssuedShares) ?? 1,

    // ── 보유기간 기산점 ──
    acquisitionCause,                               // 3중 패턴 default: "purchase"
  };

  // 보조 일자 (취득원인별 조건부)
  if (acquisitionCause === "inheritance" && form.decedentAcquisitionDate) {
    body.decedentAcquisitionDate = form.decedentAcquisitionDate;
  }
  if (acquisitionCause === "gift" && form.donorAcquisitionDate) {
    body.donorAcquisitionDate = form.donorAcquisitionDate;
  }
  if (acquisitionCause === "merger_split" && form.preMergerAcquisitionDate) {
    body.preMergerAcquisitionDate = form.preMergerAcquisitionDate;
  }

  // §94①4 다목 누적 비율
  const cumRatio = parseFloatOrUndef(form.cumulativeTransferRatio);
  if (cumRatio !== undefined) body.cumulativeTransferRatio = cumRatio;

  // ── 양도가액 ──
  body.transferPriceMode = transferPriceMode;         // 3중 패턴 default: "actual"
  if (transferPriceMode === "actual") {
    const perShare = parseIntOrUndef(form.perShareTransferPrice);
    if (perShare !== undefined) body.perShareTransferPrice = perShare;
  } else {
    // 교환 (exchange)
    const propVal = parseIntOrUndef(form.exchangePropertyValue);
    const debtVal = parseIntOrUndef(form.exchangeDebtRelief);
    const cashVal = parseIntOrUndef(form.exchangeCash);
    if (propVal !== undefined) body.exchangePropertyValue = propVal;
    if (debtVal !== undefined) body.exchangeDebtRelief = debtVal;
    if (cashVal !== undefined) body.exchangeCash = cashVal;
  }

  // ── 취득가액 ──
  body.acquisitionMode = acquisitionMode;             // 3중 패턴 default: "actual"
  if (acquisitionMode === "actual") {
    const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
    if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
  } else if (acquisitionMode === "estimated") {
    // 환산 — 상장 (1개월 종가평균)
    const transferAvg = parseIntOrUndef(form.transferDatePriceAvg1Month);
    if (transferAvg !== undefined) body.transferDatePriceAvg1Month = transferAvg;
    if (form.listingDate) body.listingDate = form.listingDate;
    const listingAvg = parseIntOrUndef(form.listingDatePriceAvg1Month);
    if (listingAvg !== undefined) body.listingDatePriceAvg1Month = listingAvg;

    // 환산 — 비상장 보충적 평가 (3시점)
    const tyNI = parseFloatOrUndef(form.transferYearNetIncomePerShare);
    const tyNA = parseFloatOrUndef(form.transferYearNetAssetPerShare);
    const lyNI = parseFloatOrUndef(form.listingYearNetIncomePerShare);
    const lyNA = parseFloatOrUndef(form.listingYearNetAssetPerShare);
    const ayNI = parseFloatOrUndef(form.acquisitionYearNetIncomePerShare);
    const ayNA = parseFloatOrUndef(form.acquisitionYearNetAssetPerShare);
    if (tyNI !== undefined) body.transferYearNetIncomePerShare = tyNI;
    if (tyNA !== undefined) body.transferYearNetAssetPerShare = tyNA;
    if (lyNI !== undefined) body.listingYearNetIncomePerShare = lyNI;
    if (lyNA !== undefined) body.listingYearNetAssetPerShare = lyNA;
    if (ayNI !== undefined) body.acquisitionYearNetIncomePerShare = ayNI;
    if (ayNA !== undefined) body.acquisitionYearNetAssetPerShare = ayNA;
  } else if (acquisitionMode === "face_value") {
    const faceVal = parseIntOrUndef(form.faceValuePerShare);
    if (faceVal !== undefined) body.faceValuePerShare = faceVal;
  } else if (acquisitionMode === "sale_case" || acquisitionMode === "appraisal") {
    const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
    if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
  }

  // 취득 후 상장 + 거래정지 (3중 패턴)
  body.acquiredBeforeListing = form.acquiredBeforeListing;     // default: false
  body.tradingHaltAtTransfer = form.tradingHaltAtTransfer;     // default: false

  // ── 장부분실 ──
  body.bookLost = form.bookLost;                               // default: false

  // ── 순자산 단독 평가 사유 ──
  if (form.netAssetOnlyReason) {
    body.netAssetOnlyReason = form.netAssetOnlyReason;
  }

  // ── 필요경비 ──
  body.expenseMode = form.expenseMode || "actual";
  if ((form.expenseMode || "actual") === "actual") {
    const exp = parseIntOrUndef(form.actualExpenses);
    if (exp !== undefined) body.actualExpenses = exp;
  }

  // ── 신고 ──
  body.filingType = filingType;                                // 3중 패턴 default: "preliminary"
  body.filingDate = form.filingDate || new Date().toISOString().split("T")[0];
  body.isElectronicFiling = form.isElectronicFiling;          // default: false
  body.isFraudulent = form.isFraudulent;                      // default: false
  body.isInternationalTransaction = form.isInternationalTransaction;  // default: false

  // ── §103② 기본공제 그룹 ──
  body.realEstateGroupBasicDeductionUsed = parseIntOrZero(form.realEstateGroupBasicDeductionUsed);  // default: 0

  return body;
}

// ============================================================
// ⑬ callStockTransferTaxAPI — POST /api/calc/stock-transfer
// ============================================================

export async function callStockTransferTaxAPI(
  form: StockTransferFormData
): Promise<StockTransferResult> {
  const body = buildStockTransferApiBody(form);

  const res = await fetch("/api/calc/stock-transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.result as StockTransferResult;
}
