/**
 * 주식 양도소득세 API 변환 — **해외주식·국외전출세 전용** (14지점 ④⑬)
 *
 * `stock-transfer-tax-api.ts`가 800줄 정책을 넘겨 분리했다.
 * 이음매는 **도메인**이다 — 국내주식 본체(`buildStockTransferApiBody`)와 이 두 빌더는
 * 입력 필드도 엔진도 완전히 갈라져 있어 서로를 참조하지 않는다.
 * 진입점은 그대로 `buildStockTransferApiBody`의 `marketType` 분기다.
 *
 * 3중 패턴 강제: UI display fallback = API 변환 fallback = validate fallback
 * 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback)
 */

import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import {
  parseIntOrUndef,
  parseFloatOrUndef,
  parseIntOrZero,
} from "./stock-transfer-tax-api-parse";

// ============================================================
// ④⑬ PR-4A 해외주식 전용 API 변환 (buildForeignStockApiBody)
// 3중 패턴: API fallback = validate fallback = store factory default
// 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
//   환율·외화 단가 빈값 → undefined → Zod/validate에서 차단
// ============================================================
export function buildForeignStockApiBody(form: StockTransferFormData): Record<string, unknown> {
  const fgTransferPriceMode = form.fgTransferPriceMode || "per_share";       // 3중 패턴 default
  const acquisitionModeFS = form.acquisitionModeFS || "actual";               // 3중 패턴 default
  const foreignTaxMethod = form.foreignTaxMethod || "credit";                 // 3중 패턴 default
  const fsTransferReceiptMode = form.fsTransferReceiptMode || "single";       // 3중 패턴 default (FS-09)

  const body: Record<string, unknown> = {
    // ── 도메인 식별자 ──
    marketType: "foreign_stock",

    // ── 납세의무 요건 §118의2 ──
    yearsResidentInKorea: parseIntOrUndef(form.yearsResidentInKorea) ?? 0,

    // ── 자산 분류 §157의3 ──
    isListedForeignCorp: form.isListedForeignCorp,   // 3중 패턴 default: true
    // §104①12호가목 — 영 §157의3 2호(내국법인 해외상장)일 때만 10%. 1호에는 근거가 없어
    // UI가 토글을 숨기고 값을 지우지만, ④에서도 같은 게이트를 걸어 stale 값을 막는다(3중 패턴).
    isSmallMediumEnterprise: form.isListedForeignCorp ? false : form.isSmallMediumEnterprise,
    stockName: form.securityName || "",
    countryCode: form.fgCountryCode || "US",         // 3중 패턴 default

    // ── 양도 정보 ──
    shareCount: parseIntOrUndef(form.shareCount) ?? 1,
    transferDate: form.transferDate,
    transferPriceMode: fgTransferPriceMode,
    transferCurrencyCode: form.transferCurrencyCode || "USD",  // 3중 패턴 default

    // 환율 — 자동 안분 fallback 금지. 빈값 → validate 차단
    transferExchangeRate: parseFloatOrUndef(form.transferExchangeRate),

    // ── FS-09 §178의5② 수령 방식 ──
    transferReceiptMode: fsTransferReceiptMode,       // 3중 패턴 default: "single"

    // ── 취득 정보 ──
    acquisitionDate: form.acquisitionDate,
    acquisitionMode: acquisitionModeFS,
    acquisitionCurrencyCode: form.acquisitionCurrencyCode || "USD",  // 3중 패턴 default
    acquisitionExchangeRate: parseFloatOrUndef(form.acquisitionExchangeRate),

    // ── 필요경비 (외화) §118의4 ──
    capitalExpenditureForeign: parseFloatOrUndef(form.capitalExpenditureForeign) ?? 0,
    transferCostForeign: parseFloatOrUndef(form.transferCostForeign) ?? 0,

    // ── 외국납부세액 §118의6 ──
    hasForeignTax: form.hasForeignTax,               // 3중 패턴 default: false
    foreignTaxMethod,                                 // 3중 패턴 default: "credit"

    // ── 기타 ──
    isElectronicFiling: form.isElectronicFiling,     // default: false

    // ── 신고축(가산세) — 국외자산 양도도 같은 신고다(소득세법 §118조의8 준용) ──
    filingViolation: form.filingViolation || "none",   // 3중 패턴 default
    isFraudulent: form.isFraudulent,
    isInternationalTransaction: form.isInternationalTransaction,
  };

  // 가산세 상세 — 0·빈값이면 넣지 않는다(국내 경로와 같은 규칙)
  {
    const originalFiled =
      form.filingViolation === "under_report" ? parseIntOrZero(form.originalFiledTax) : 0;
    if (originalFiled > 0) body.originalFiledTax = originalFiled;
    const priorPaid = parseIntOrZero(form.priorPaidTax);
    if (priorPaid > 0) body.priorPaidTax = priorPaid;
    const interest = parseIntOrZero(form.interestSurcharge);
    if (interest > 0) body.interestSurcharge = interest;
    // §47조의3①1호 가목 base — **빈 문자열이면 보내지 않는다**(미입력 = 전액 부정).
    // 0 은 「부정행위분이 없다」는 유효한 선언이므로 0도 보낸다.
    if (form.fraudulentPortion.trim() !== "") {
      body.fraudulentPortion = parseIntOrZero(form.fraudulentPortion);
    }
    const unpaid = parseIntOrZero(form.unpaidTax);
    if (unpaid > 0) body.unpaidTax = unpaid;
    if (form.paymentDeadline) body.paymentDeadline = form.paymentDeadline;
    if (form.actualPaymentDate) body.actualPaymentDate = form.actualPaymentDate;
  }

  // 양도가액 — 수령 방식에 따라 분기 (TypeScript 미감지 → 자가 grep 점검 필수)
  if (fsTransferReceiptMode === "installments") {
    // FS-09: §178의5② 장기할부 분할 수령 배열 — ⑬ body spread
    const receipts = (form.fsTransferInstallmentReceipts || [])
      .map((r) => {
        const amountForeign = parseFloatOrUndef(r.amountForeign);
        const exchangeRate = parseFloatOrUndef(r.exchangeRate);
        if (amountForeign === undefined || exchangeRate === undefined) return null;
        return {
          receiptDate: r.receiptDate,      // ISO string — route handler에서 toDate() 변환
          amountForeign,
          exchangeRate,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    body.transferInstallmentReceipts = receipts;
    // 분할 수령 모드에서는 단일 양도가액 필드를 포함하지 않음
  } else {
    // single 모드 — 기존 양도가액 필드 분기
    if (fgTransferPriceMode === "per_share") {
      const perShare = parseFloatOrUndef(form.perShareTransferPriceForeign);
      if (perShare !== undefined) body.perShareTransferPriceForeign = perShare;
    } else {
      const total = parseFloatOrUndef(form.totalTransferPriceForeign);
      if (total !== undefined) body.totalTransferPriceForeign = total;
    }
  }

  // 취득가액 — actual 모드만 입력 필요
  if (acquisitionModeFS === "actual") {
    const perAcq = parseFloatOrUndef(form.perShareAcquisitionPriceForeign);
    if (perAcq !== undefined) body.perShareAcquisitionPriceForeign = perAcq;
  }

  // 외국납부세액 — hasForeignTax=true 시 필수
  if (form.hasForeignTax) {
    const paid = parseFloatOrUndef(form.foreignTaxPaidForeign);
    if (paid !== undefined) body.foreignTaxPaidForeign = paid;
    const fxCode = form.foreignTaxCurrencyCode || "USD";
    body.foreignTaxCurrencyCode = fxCode;
    const fxRate = parseFloatOrUndef(form.foreignTaxExchangeRate);
    if (fxRate !== undefined) body.foreignTaxExchangeRate = fxRate;
  }

  return body;
}

// ⑬ grep 자가점검 목록 (callStockTransferTaxAPI body spread — TypeScript 미감지):
//   transferCurrencyCode / acquisitionExchangeRate / transferExchangeRate /
//   perShareTransferPriceForeign / totalTransferPriceForeign /
//   perShareAcquisitionPriceForeign / capitalExpenditureForeign / transferCostForeign /
//   foreignTaxPaidForeign / foreignTaxCurrencyCode / foreignTaxExchangeRate /
//   hasForeignTax / foreignTaxMethod / fgCountryCode(→countryCode) /
//   fsTransferReceiptMode(→transferReceiptMode) / fsTransferInstallmentReceipts(→transferInstallmentReceipts) [FS-09]

// ============================================================
// ④⑬ PR-4B 국외전출세 전용 API 변환 (buildExitTaxApiBody)
// 3중 패턴: API fallback = validate fallback = store factory default
// 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
//   시가 모드별 필수 입력 빈값 → undefined → Zod/validate에서 차단
// ⑬ grep 자가점검 목록:
//   etYearsResidentLast10 / etDepartureDate / etIsMajorShareholder /
//   etHoldings[] / etDeferralRequested / etDeferralReason /
//   etActualTransferDate / etActualTransferPricePerShare /
//   etForeignTaxPaid / etForeignTaxExclusionReason /
//   etDomesticSourceTaxWithheld / etHasFiledHoldingsReport / etTotalFaceValue
// ============================================================
export function buildExitTaxApiBody(form: StockTransferFormData): Record<string, unknown> {
  const deferralReason = form.etDeferralReason || "none";      // 3중 패턴 default
  const exclusionReason = form.etForeignTaxExclusionReason || "none";  // 3중 패턴 default

  // ⑬ holdings[] 배열 변환 — acquisitionDate 포함 전수 spread
  const holdings = (form.etHoldings || []).map((h) => {
    const holdingBody: Record<string, unknown> = {
      id: h.id,
      stockName: h.stockName,
      marketType: h.marketType || "kospi",     // 3중 패턴 default
      shareCount: parseIntOrUndef(h.shareCount) ?? 0,
      acquisitionDate: h.acquisitionDate,      // ⑭ route에서 toDate() 변환 (holdings[] map)
      perShareAcquisitionPrice: parseIntOrUndef(h.perShareAcquisitionPrice) ?? 0,
      departureDayValuationMode: h.departureDayValuationMode || "market_price",  // 3중 패턴
    };
    // 모드별 시가 — 자동 안분 fallback 금지, 미입력 시 undefined
    const mode = h.departureDayValuationMode || "market_price";
    if (mode === "market_price") {
      const v = parseIntOrUndef(h.departureDayMarketPrice);
      if (v !== undefined) holdingBody.departureDayMarketPrice = v;
    } else if (mode === "prior_year_std") {
      const v = parseIntOrUndef(h.priorYearEndMonthAvg);
      if (v !== undefined) holdingBody.priorYearEndMonthAvg = v;
    } else if (mode === "unlisted_sample") {
      const v = parseIntOrUndef(h.unlistedSamplePrice);
      if (v !== undefined) holdingBody.unlistedSamplePrice = v;
    } else if (mode === "unlisted_std") {
      const v = parseIntOrUndef(h.unlistedStdPricePerShare);
      if (v !== undefined) holdingBody.unlistedStdPricePerShare = v;
    }
    return holdingBody;
  });

  const body: Record<string, unknown> = {
    // 도메인 식별자
    marketType: "exit_tax",

    // ── 거주자 요건 §118의9①1호 ──
    yearsResidentLast10: parseFloatOrUndef(form.etYearsResidentLast10) ?? 0,

    // ── 출국일 ──
    departureDate: form.etDepartureDate,        // ⑭ route에서 toDate() 변환

    // ── 대주주 요건 §178의8 ──
    isMajorShareholder: form.etIsMajorShareholder,

    // ── 보유 종목 배열 ⑬ ──
    holdings,

    // ── 납부유예 §118의16 ──
    deferralRequested: form.etDeferralRequested,
    deferralReason,                             // 3중 패턴 default: "none"

    // ── 외국납부세액·배제 사유 §118의13 ──
    foreignTaxExclusionReason: exclusionReason, // 3중 패턴 default: "none"

    // ── 보유현황 신고 §118의15 ──
    hasFiledHoldingsReport: form.etHasFiledHoldingsReport,

    // ── 재전입 환급 §118의17①1호 ──
    reenteredWithin5Years: form.etReenteredWithin5Years,

    // ── 납부유예 이자상당액 §118의16④·§178의12③ (빈값 undefined → 안내만) ──
    deferralInterestDays: parseIntOrUndef(form.etDeferralInterestDays),
    deferralInterestDailyRate: parseFloatOrUndef(form.etDeferralInterestDailyRate),
  };

  // 경정청구용 실양도 — 입력값 있을 때만 포함 (자동 안분 fallback 금지)
  if (form.etActualTransferDate) {
    body.actualTransferDate = form.etActualTransferDate;
  }
  if (form.etActualTransferPricePerShare) {
    const v = parseIntOrUndef(form.etActualTransferPricePerShare);
    if (v !== undefined) body.actualTransferPricePerShare = v;
  }

  // 외국납부세액 — 입력값 있을 때만 포함
  if (form.etForeignTaxPaid) {
    const v = parseIntOrUndef(form.etForeignTaxPaid);
    if (v !== undefined) body.foreignTaxPaid = v;
  }
  // 외화 + 기준환율(소령 §178의5) — 둘 다 있어야 엔진이 환산한다.
  // 한쪽만 보내면 엔진이 원화 입력값으로 되돌아가므로 여기서도 각각 그대로 전달한다.
  if (form.etForeignTaxPaidForeign) {
    const v = parseFloatOrUndef(form.etForeignTaxPaidForeign);
    if (v !== undefined) body.foreignTaxPaidForeign = v;
  }
  if (form.etForeignTaxExchangeRate) {
    const v = parseFloatOrUndef(form.etForeignTaxExchangeRate);
    if (v !== undefined) body.foreignTaxExchangeRate = v;
  }
  if (form.etForeignTaxCurrencyCode) {
    body.foreignTaxCurrencyCode = form.etForeignTaxCurrencyCode;
  }

  // §118의14 비거주자 원천징수세액
  if (form.etDomesticSourceTaxWithheld) {
    const v = parseIntOrUndef(form.etDomesticSourceTaxWithheld);
    if (v !== undefined) body.domesticSourceTaxWithheld = v;
  }

  // 보유현황 미신고 가산세용 액면금액
  if (!form.etHasFiledHoldingsReport && form.etTotalFaceValue) {
    const v = parseIntOrUndef(form.etTotalFaceValue);
    if (v !== undefined) body.totalFaceValue = v;
  }

  return body;
}

