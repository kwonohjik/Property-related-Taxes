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
    // 폼은 % 단위 (예: "3" = 3%), 엔진은 decimal (0.03). 0.01을 곱해 정규화.
    isMajorShareholder: form.isMajorShareholder,
    selfShareRatio: (parseFloatOrUndef(form.selfShareRatio) ?? 0) * 0.01,
    selfMarketCap: parseIntOrZero(form.selfMarketCap),
    isLargestShareholderGroup: form.isLargestShareholderGroup,   // 3중 패턴
    combinedShareRatio: (parseFloatOrUndef(form.combinedShareRatio) ?? 0) * 0.01,
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
    const actualMode = form.transferActualInputMode || "per_share";  // 3중 패턴 default
    body.transferActualInputMode = actualMode;
    if (actualMode === "total") {
      const total = parseIntOrUndef(form.transferTotalPrice);
      if (total !== undefined) body.transferTotalPrice = total;
    } else {
      const perShare = parseIntOrUndef(form.perShareTransferPrice);
      if (perShare !== undefined) body.perShareTransferPrice = perShare;
    }
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
    const acqInputMode = form.acquisitionActualInputMode || "per_share";  // 3중 패턴 default
    body.acquisitionActualInputMode = acqInputMode;   // ⑬ body spread 명시

    if (acqInputMode === "lots" && form.lotsMode === "single") {
      // ─────────────────────────────────────────────────────────────
      // lots-only 모드: 취득 lot 배열 + 합성 transferLot 1건 자동 생성
      // 엔진 변경 없음 — isSplitMode() 분기 그대로 사용
      // ─────────────────────────────────────────────────────────────
      body.costAllocationMethod = form.costAllocationMethod || "fifo";  // R-3 default
      body.acquisitionLots = form.acquisitionLots.map((lot) => {
        const o: Record<string, unknown> = {
          id: lot.id,
          acquisitionDate: lot.acquisitionDate,
          shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
          perShareAcquisitionPrice: parseIntOrUndef(lot.perShareAcquisitionPrice) ?? 0,
          acquisitionCause: lot.acquisitionCause,
        };
        if (lot.acquisitionCause === "inheritance" && lot.decedentAcquisitionDate) {
          o.decedentAcquisitionDate = lot.decedentAcquisitionDate;
        }
        if (lot.acquisitionCause === "merger_split" && lot.preMergerAcquisitionDate) {
          o.preMergerAcquisitionDate = lot.preMergerAcquisitionDate;
        }
        return o;
      });
      // 합성 transferLot — 폼 전역 단일 양도 정보로 1행 생성
      // ID prefix "__synth_single_transfer__" 로 사용자 입력 ID와 충돌 차단 (R-5)
      // total 모드 호환: transferActualInputMode === "total" 시 합계 → 1주당 단가 역산 (round)
      //   잔돈은 ±(shareCount-1)원 범위 (Math.round로 최소화). UI 안내 카드로 사전 고지.
      const syntheticShareCount = parseIntOrUndef(form.shareCount) ?? 0;
      const transferInputMode = form.transferActualInputMode || "per_share";
      const syntheticPerShareTransferPrice =
        transferInputMode === "total"
          ? syntheticShareCount > 0
            ? Math.round((parseIntOrUndef(form.transferTotalPrice) ?? 0) / syntheticShareCount)
            : 0
          : parseIntOrUndef(form.perShareTransferPrice) ?? 0;
      body.transferLots = [
        {
          id: "__synth_single_transfer__",
          transferDate: form.transferDate,
          shareCount: syntheticShareCount,
          perShareTransferPrice: syntheticPerShareTransferPrice,
        },
      ];
      // specificMatchings는 본 모드 미지원 (Zod refine + UI disabled 차단)
      // ⑪ acquisitionDate fallback — 가장 오래된 lot 일자 (legacy 호환)
      const oldestLotDate = form.acquisitionLots
        .map((l) => l.acquisitionDate)
        .filter((d) => d && d.length > 0)
        .sort()[0];
      if (oldestLotDate && !body.acquisitionDate) {
        body.acquisitionDate = oldestLotDate;
      }
    } else {
      // per_share 모드 (기존)
      const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
      if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
    }
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

  // ── 분할 매수·분할 양도 (Plan v2.2) ──⑪⑫⑬
  if (form.lotsMode === "split") {
    body.costAllocationMethod = form.costAllocationMethod || "fifo";
    body.acquisitionLots = form.acquisitionLots.map((lot) => {
      const o: Record<string, unknown> = {
        id: lot.id,
        acquisitionDate: lot.acquisitionDate,
        shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
        perShareAcquisitionPrice: parseIntOrUndef(lot.perShareAcquisitionPrice) ?? 0,
        acquisitionCause: lot.acquisitionCause,
      };
      if (lot.acquisitionCause === "inheritance" && lot.decedentAcquisitionDate) {
        o.decedentAcquisitionDate = lot.decedentAcquisitionDate;
      }
      if (lot.acquisitionCause === "merger_split" && lot.preMergerAcquisitionDate) {
        o.preMergerAcquisitionDate = lot.preMergerAcquisitionDate;
      }
      return o;
    });
    body.transferLots = form.transferLots.map((lot) => ({
      id: lot.id,
      transferDate: lot.transferDate,
      shareCount: parseIntOrUndef(lot.shareCount) ?? 0,
      perShareTransferPrice: parseIntOrUndef(lot.perShareTransferPrice) ?? 0,
    }));
    if (form.costAllocationMethod === "specific") {
      body.specificMatchings = form.specificMatchings.map((m) => ({
        transferLotId: m.transferLotId,
        acquisitionLotId: m.acquisitionLotId,
        shareCount: parseIntOrUndef(m.shareCount) ?? 0,
      }));
    }

    // ⑪ acquisitionDate FIFO fallback — 가장 오래된 매수 lot 일자를 단건 필드에도 채움
    //   (legacy calcHoldingPeriod / STT 호환. 엔진은 split 모드에서 이 값을 무시하고 lot 사용)
    const oldestLotDate = form.acquisitionLots
      .map((l) => l.acquisitionDate)
      .filter((d) => d && d.length > 0)
      .sort()[0];
    if (oldestLotDate && !body.acquisitionDate) {
      body.acquisitionDate = oldestLotDate;
    }
    const oldestTrnDate = form.transferLots
      .map((l) => l.transferDate)
      .filter((d) => d && d.length > 0)
      .sort()[0];
    if (oldestTrnDate && !body.transferDate) {
      body.transferDate = oldestTrnDate;
    }
  }

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
