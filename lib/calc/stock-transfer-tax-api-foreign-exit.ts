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

import type { ExitTaxHoldingForm, StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isExitTaxFrom2027 } from "@/lib/tax-engine/data/exit-tax-2027-era";
import { isForeignValuationMode } from "@/lib/tax-engine/stock-transfer/exit-tax-fx";
import type { ExitTaxRateBucket } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";
import { previewExitTaxBucketsFromBody } from "./stock-transfer-exit-tax-buckets";
import {
  parseIntOrUndef,
  parseFloatOrUndef,
  parseIntOrZero,
} from "./stock-transfer-tax-api-parse";
import { appendForeignCarryoverBody } from "./stock-transfer-tax-api-carryover";

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
    // 영 §178의5① 지출일 환율 — 미입력이면 **키를 싣지 않는다**. 0 을 실으면 엔진의
    // `?? transferExchangeRate` fallback 이 발동하지 않아 필요경비가 조용히 0원이 된다.
    capitalExpenditureExchangeRate: parseFloatOrUndef(form.capitalExpenditureExchangeRate),
    transferCostForeign: parseFloatOrUndef(form.transferCostForeign) ?? 0,
    transferCostExchangeRate: parseFloatOrUndef(form.transferCostExchangeRate),

    // ── 외국납부세액 §118의6 ──
    hasForeignTax: form.hasForeignTax,               // 3중 패턴 default: false
    foreignTaxMethod,                                 // 3중 패턴 default: "credit"

    // ── 기타 ──
    isElectronicFiling: form.isElectronicFiling,     // default: false

    // ── 신고축(가산세) — 국외주식도 같은 양도소득세 신고다(§110① **직접** 적용 · §118의8 아님) ──
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

  // 취득가액 — 실가·시가 **두 모드 모두** 같은 칸이다(엔진이 시가 모드도 1주당 시가로 읽는다).
  // 🔴 2026-09-30(B21) 종전엔 실가만 실어 시가 모드는 취득가액 0으로 계산됐다(2,700,000 → 5,100,000).
  const perAcq = parseFloatOrUndef(form.perShareAcquisitionPriceForeign);
  if (perAcq !== undefined) body.perShareAcquisitionPriceForeign = perAcq;

  // 외국납부세액 — hasForeignTax=true 시 필수
  if (form.hasForeignTax) {
    const paid = parseFloatOrUndef(form.foreignTaxPaidForeign);
    if (paid !== undefined) body.foreignTaxPaidForeign = paid;
    const fxCode = form.foreignTaxCurrencyCode || "USD";
    body.foreignTaxCurrencyCode = fxCode;
    const fxRate = parseFloatOrUndef(form.foreignTaxExchangeRate);
    if (fxRate !== undefined) body.foreignTaxExchangeRate = fxRate;
  }

  // §97의2① 이월과세 (④⑬) — 선언한 종목만. 국내 `appendCarryoverDonorBody`는 부르지 않는다.
  appendForeignCarryoverBody(body, form);

  return body;
}

// ⑬ grep 자가점검 목록 (callStockTransferTaxAPI body spread — TypeScript 미감지):
//   transferCurrencyCode / acquisitionExchangeRate / transferExchangeRate /
//   perShareTransferPriceForeign / totalTransferPriceForeign /
//   perShareAcquisitionPriceForeign / capitalExpenditureForeign / transferCostForeign /
//   foreignTaxPaidForeign / foreignTaxCurrencyCode / foreignTaxExchangeRate /
//   hasForeignTax / foreignTaxMethod / fgCountryCode(→countryCode) /
//   fsTransferReceiptMode(→transferReceiptMode) / fsTransferInstallmentReceipts(→transferInstallmentReceipts) [FS-09] /
//   acquisitionCause / donorRelation / donorDeceased / donorAcquisitionDate / donorAcquisitionMode(←donorAcquisitionModeFS) /
//   donorPerShareAcquisitionPriceForeign / donorAcquisitionCurrencyCode / donorAcquisitionExchangeRate /
//   donorCapitalExpenditureForeign / donorCapitalExpenditureExchangeRate / giftTaxAmount / transferredAssetValue /
//   giftTaxableValue [§97의2① — appendForeignCarryoverBody]

// ============================================================
// ④⑬ PR-4B 국외전출세 전용 API 변환 (buildExitTaxApiBody)
// 3중 패턴: API fallback = validate fallback = store factory default
// 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback):
//   시가 모드별 필수 입력 빈값 → undefined → Zod/validate에서 차단
// ⑬ grep 자가점검 목록:
//   etYearsResidentLast10 / etDepartureDate / etIsMajorShareholder /
//   etHoldings[] / etDeferralRequested / etDeferralReason /
//   etActualTransferDate / etActualTransferPricePerShare /
//   etHasForeignTax / etForeignTaxPaid / etForeignTaxExclusionReason /
//   etDomesticSourceTaxWithheld / etHasFiledHoldingsReport / etTotalFaceValue /
//   [2027.1.1. 이후 출국] holdings[].isListedForeignCorp / isSmallMediumEnterprise / countryCode /
//   foreignCurrencyCode / departureDayPriceForeign / departureExchangeRate /
//   perShareAcquisitionPriceForeign / acquisitionExchangeRate (국외주식 종목만) /
//   etForeignWorkerStatus(→foreignWorkerStatus) / etForeignWorker{IsOfficerOrEmployee,IsNotDailyWorker,
//   DomesticRatio80,Departed6Months}(→foreignWorkerChecks) / etForeignWorkerFamilyKind(→foreignWorkerFamilyKind) /
//   etForeignWorkerStartDate(→foreignWorkerStartDate) / etBasicDeductionAllocClause1·2a·2b(→basicDeductionAllocation)
// ============================================================

/**
 * 종목 1건 → body. **국외주식 행**(`marketType === "foreign_stock"`)과 **외화 시가 모드**만 외화 필드를 싣는다 —
 * 국내 행에 외화 필드가 한 개라도 실리면 엔진이 거부한다(숨은 값 금지: 시장을 바꿔도 이전 시장의 값은 전송되지 않는다).
 * 외화 모드는 원화 단가를 **0**으로 보낸다(엔진: 원화·외화 단가 혼용 거부) — 원화 칸에 남은 stale 값이 전송되지 않는다.
 */
export function buildExitTaxHoldingBody(h: ExitTaxHoldingForm): Record<string, unknown> {
  const isForeignRow = h.marketType === "foreign_stock";
  // 3중 패턴 default: 국외주식 행은 외화 거래가액, 그 밖은 원화 거래가액 (UI RadioCardGroup value 직접 · normalize · ⑧ 동일)
  const mode = h.departureDayValuationMode || (isForeignRow ? "foreign_market_price" : "market_price");
  const foreignMode = isForeignValuationMode(mode);

  const holdingBody: Record<string, unknown> = {
    id: h.id,
    stockName: h.stockName,
    marketType: h.marketType || "kospi",     // 3중 패턴 default
    shareCount: parseIntOrUndef(h.shareCount) ?? 0,
    acquisitionDate: h.acquisitionDate,      // ⑭ route에서 toDate() 변환 (holdings[] map)
    perShareAcquisitionPrice: foreignMode ? 0 : (parseIntOrUndef(h.perShareAcquisitionPrice) ?? 0),
    departureDayValuationMode: mode,
  };

  if (isForeignRow) {
    // 국외주식 분류 — 외국법인 발행(true, default)이면 중소기업 가목이 불가하므로 false로 고정한다(stale 값 차단, 해외주식 트랙과 같은 게이트)
    const isForeignCorp = h.isListedForeignCorp ?? true;
    holdingBody.isListedForeignCorp = isForeignCorp;
    holdingBody.isSmallMediumEnterprise = isForeignCorp ? false : h.isSmallMediumEnterprise === true;
    holdingBody.countryCode = h.countryCode || "US";               // 3중 패턴 default
    holdingBody.foreignCurrencyCode = h.foreignCurrencyCode || "USD"; // 3중 패턴 default
  }

  if (foreignMode) {
    // 외화 경로 — 환율·외화 단가 빈값은 **키를 싣지 않는다**(대체 환율·이전 값 보간 없음 → Zod/엔진/⑧이 차단)
    const priceF = parseFloatOrUndef(h.departureDayPriceForeign);
    if (priceF !== undefined) holdingBody.departureDayPriceForeign = priceF;
    const depRate = parseFloatOrUndef(h.departureExchangeRate);
    if (depRate !== undefined) holdingBody.departureExchangeRate = depRate;
    const acqF = parseFloatOrUndef(h.perShareAcquisitionPriceForeign);
    if (acqF !== undefined) holdingBody.perShareAcquisitionPriceForeign = acqF;
    const acqRate = parseFloatOrUndef(h.acquisitionExchangeRate);
    if (acqRate !== undefined) holdingBody.acquisitionExchangeRate = acqRate;
    return holdingBody;
  }

  // 모드별 시가 — 자동 안분 fallback 금지, 미입력 시 undefined
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
}

/**
 * 외국인근로자(영 §178의8②2·3호) — **출국일 2027.1.1. 이후 + 국외주식 종목이 있을 때만** 싣는다.
 * 그 밖에는 입력칸 자체가 없으므로(숨은 값) 보내지 않는다. 3중 패턴 default "none"은 «보내지 않음»이다.
 * 요건 4개는 사용자 선언 4개를 **모두** 싣는다(키가 빠지면 Zod가 거부한다 — false로 채우지 않는다).
 */
function appendExitTaxWorkerBody(body: Record<string, unknown>, form: StockTransferFormData): void {
  const hasForeignRow = (form.etHoldings || []).some((h) => h.marketType === "foreign_stock");
  if (!isExitTaxFrom2027(form.etDepartureDate) || !hasForeignRow) return;
  const status = form.etForeignWorkerStatus || "none";   // 3중 패턴 default
  if (status === "none") return;
  body.foreignWorkerStatus = status;
  body.foreignWorkerChecks = {
    isOfficerOrEmployee: !!form.etForeignWorkerIsOfficerOrEmployee,
    isNotDailyWorker: !!form.etForeignWorkerIsNotDailyWorker,
    domesticWorkRatioAtLeast80: !!form.etForeignWorkerDomesticRatio80,
    departedWithin6MonthsOfWorkEnd: !!form.etForeignWorkerDeparted6Months,
  };
  if (status === "foreign_worker_family") {
    // 가족 구분·근로 개시일은 비어 있으면 키를 싣지 않는다 → 엔진·⑧이 필수로 차단(선택을 대신하지 않는다)
    if (form.etForeignWorkerFamilyKind) body.foreignWorkerFamilyKind = form.etForeignWorkerFamilyKind;
    if (form.etForeignWorkerStartDate) body.foreignWorkerStartDate = form.etForeignWorkerStartDate;
  }
}

const ALLOC_FIELD: Record<ExitTaxRateBucket, keyof StockTransferFormData> = {
  clause1: "etBasicDeductionAllocClause1",
  clause2a: "etBasicDeductionAllocClause2a",
  clause2b: "etBasicDeductionAllocClause2b",
};

/**
 * 기본공제 250만원 구분별 배분(§118의10④ · 결정 C-1) — **과세 구분이 둘 이상**일 때만, **과세 구분의 입력값만** 싣는다.
 * 구분이 하나이면 법문 직접 적용이라 배분이 없고(엔진은 입력이 있으면 자동값과 같은지 검증하므로 stale 값이 오류가 된다),
 * 과세 구분이 아닌 쪽 값도 보내지 않는다. 빈 칸은 0으로 채우지 않는다 → 엔진이 «0이라도 직접 입력»으로 차단.
 */
function appendExitTaxAllocationBody(
  body: Record<string, unknown>,
  form: StockTransferFormData,
  buckets: ExitTaxRateBucket[] | null,
): void {
  if (!buckets || buckets.length < 2) return;
  const alloc: Record<string, number> = {};
  for (const b of buckets) {
    const v = parseIntOrUndef(String(form[ALLOC_FIELD[b]] ?? ""));
    if (v !== undefined) alloc[b] = v;
  }
  if (Object.keys(alloc).length > 0) body.basicDeductionAllocation = alloc;
}

/** 배분을 제외한 body — 배분 칸 노출·전송 게이트가 쓰는 과세 구분 미리보기의 입력이다 */
export function buildExitTaxApiBodyCore(form: StockTransferFormData): Record<string, unknown> {
  const body = buildExitTaxApiBodyBase(form);
  appendExitTaxWorkerBody(body, form);
  return body;
}

/** 입력 화면용 — 과세 세율 구분 미리보기 (엔진 분류 helper 호출). 배분 칸 노출·④ 전송 게이트의 단일 소스 */
export function previewExitTaxBuckets(form: StockTransferFormData): ExitTaxRateBucket[] | null {
  return previewExitTaxBucketsFromBody(buildExitTaxApiBodyCore(form));
}

export function buildExitTaxApiBody(form: StockTransferFormData): Record<string, unknown> {
  const body = buildExitTaxApiBodyCore(form);
  appendExitTaxAllocationBody(body, form, previewExitTaxBucketsFromBody(body));
  return body;
}

function buildExitTaxApiBodyBase(form: StockTransferFormData): Record<string, unknown> {
  const deferralReason = form.etDeferralReason || "none";      // 3중 패턴 default
  // 외국납부세액 토글이 꺼져 있으면 숨은 값(원화·외화·환율·통화·배제 사유)은 엔진에 보내지 않는다.
  // 배제 사유는 Zod 필수 키라 꺼짐이면 "none" 으로 고정한다.
  const hasForeignTax = !!form.etHasForeignTax;
  const exclusionReason = hasForeignTax ? form.etForeignTaxExclusionReason || "none" : "none";  // 3중 패턴 default

  // ⑬ holdings[] 배열 변환 — acquisitionDate 포함 전수 spread (종목 1건 = `buildExitTaxHoldingBody`)
  const holdings = (form.etHoldings || []).map(buildExitTaxHoldingBody);

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
  };

  // 납부유예 이자상당액 §118의16④·§178의12③ — 납부유예 신청이 켜져 있을 때만 (빈값 undefined → 안내만).
  // 꺼진 폼에 남은 일수·이율을 body에 싣지 않는다(숨은 값 금지 — 외국납부세액 토글과 같은 원칙).
  if (form.etDeferralRequested) {
    body.deferralInterestDays = parseIntOrUndef(form.etDeferralInterestDays);
    body.deferralInterestDailyRate = parseFloatOrUndef(form.etDeferralInterestDailyRate);
  }

  // 경정청구용 실양도 — 입력값 있을 때만 포함 (자동 안분 fallback 금지)
  if (form.etActualTransferDate) {
    body.actualTransferDate = form.etActualTransferDate;
  }
  if (form.etActualTransferPricePerShare) {
    const v = parseIntOrUndef(form.etActualTransferPricePerShare);
    if (v !== undefined) body.actualTransferPricePerShare = v;
  }

  // 외국납부세액 — 토글이 켜져 있고 입력값 있을 때만 포함
  if (hasForeignTax && form.etForeignTaxPaid) {
    const v = parseIntOrUndef(form.etForeignTaxPaid);
    if (v !== undefined) body.foreignTaxPaid = v;
  }
  // 외화 + 기준환율(소령 §178의5) — 둘 다 있어야 엔진이 환산한다.
  // 한쪽만 보내면 엔진이 원화 입력값으로 되돌아가므로 여기서도 각각 그대로 전달한다.
  if (hasForeignTax && form.etForeignTaxPaidForeign) {
    const v = parseFloatOrUndef(form.etForeignTaxPaidForeign);
    if (v !== undefined) body.foreignTaxPaidForeign = v;
  }
  if (hasForeignTax && form.etForeignTaxExchangeRate) {
    const v = parseFloatOrUndef(form.etForeignTaxExchangeRate);
    if (v !== undefined) body.foreignTaxExchangeRate = v;
  }
  if (hasForeignTax && form.etForeignTaxCurrencyCode) {
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

