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
import { SYNTH_SINGLE_TRANSFER_ID } from "@/lib/stores/calc-wizard-stock-store";
import { adaptFlatToApiBody } from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
import {
  adaptUnlistedFlatToApiBody,
  shouldSkipNetIncome,
} from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";
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
  };

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

export function buildStockTransferApiBody(form: StockTransferFormData): Record<string, unknown> {
  // ── PR-4A 해외주식 분기 (④⑬) ──
  if (form.marketType === "foreign_stock") {
    return buildForeignStockApiBody(form);
  }

  // ── PR-4B 국외전출세 분기 (④⑬) ──
  if (form.marketType === "exit_tax") {
    return buildExitTaxApiBody(form);
  }

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
    isOnMarketTransaction: form.isOnMarketTransaction ?? true, // §94①3 가목 1) 단서 — 3중 패턴 default: true (store·normalize·Zod 일치. legacy 폼 undefined 방어)
    // F-15·F-16 (2026-05-19) — 대차주식·사모펀드 간접소유 자동 가산 (시행령 §157 2013.2.15.~)
    lentSharesCount: parseIntOrUndef(form.lentSharesCount) ?? 0,
    pefIndirectSharesCount: parseIntOrUndef(form.pefIndirectSharesCount) ?? 0,
    // F-09/F-10/F-14/F-23 (2026-05-19) — 판정 기준일 override
    judgmentDateOverride: form.judgmentDateOverride || undefined,
    judgmentBasis: form.judgmentBasis === "default" ? undefined : form.judgmentBasis,

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

  // §94①4 다목 누적 비율 — UI는 % 단위 입력, 엔진은 decimal(0.0~1.0) 수신 → ×0.01 변환
  const cumRatioPercent = parseFloatOrUndef(form.cumulativeTransferRatio);
  if (cumRatioPercent !== undefined) body.cumulativeTransferRatio = cumRatioPercent * 0.01;

  // ── 양도가액 ──
  body.transferPriceMode = transferPriceMode;         // 3중 패턴 default: "actual"
  if (transferPriceMode === "actual") {
    const actualMode = form.transferActualInputMode || "total";  // 3중 패턴 default
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
      const transferInputMode = form.transferActualInputMode || "total";
      const syntheticPerShareTransferPrice =
        transferInputMode === "total"
          ? syntheticShareCount > 0
            ? Math.round((parseIntOrUndef(form.transferTotalPrice) ?? 0) / syntheticShareCount)
            : 0
          : parseIntOrUndef(form.perShareTransferPrice) ?? 0;
      body.transferLots = [
        {
          id: SYNTH_SINGLE_TRANSFER_ID,
          transferDate: form.transferDate,
          shareCount: syntheticShareCount,
          perShareTransferPrice: syntheticPerShareTransferPrice,
        },
      ];
      // [A-1] 개별법(specific): 합성 단일 매도 lot에 대한 매수 lot별 배정 매핑.
      //   transferLotId는 합성 sentinel로 강제(폼 값 무시) — UI는 acquisitionLotId·shareCount만 입력.
      //   shareCount > 0 행만 전송. 합계 검증은 Zod isSplit 무결성 체크(매도=합성 1건)·validate가 담당.
      if ((form.costAllocationMethod || "fifo") === "specific") {
        body.specificMatchings = form.specificMatchings
          .map((m) => ({
            transferLotId: SYNTH_SINGLE_TRANSFER_ID,
            acquisitionLotId: m.acquisitionLotId,
            shareCount: parseIntOrUndef(m.shareCount) ?? 0,
          }))
          .filter((m) => m.shareCount > 0);
      }
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
    const acquisitionAvg = parseIntOrUndef(form.acquisitionDatePriceAvg1Month);
    if (acquisitionAvg !== undefined) body.acquisitionDatePriceAvg1Month = acquisitionAvg;
    // §163⑨ 분모 입력 방식 메타 (산식 영향 없음, UI mirror 패턴 식별용)
    if (form.transferStdInputMode) body.transferStdInputMode = form.transferStdInputMode;
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
    // 소칙 §81④ 1호 월할 가산 — 전전연도 평가(빈값 undefined → 엔진 C-4 방어) + 직전사업연도 월수
    // ⚠ parseAmount(빈값 0) 금지 — 0이면 엔진 C-4 차단 우회 + 오보정
    const ppNI = parseFloatOrUndef(form.prePriorYearNetIncomePerShare);
    const ppNA = parseFloatOrUndef(form.prePriorYearNetAssetPerShare);
    if (ppNI !== undefined) body.prePriorYearNetIncomePerShare = ppNI;
    if (ppNA !== undefined) body.prePriorYearNetAssetPerShare = ppNA;
    const pbm = parseIntOrUndef(form.priorBizYearMonths);
    if (pbm !== undefined) body.priorBizYearMonths = pbm; // 미입력 시 엔진 ?? 12 fallback
    // [B-4 §165⑨ 본체] 비상장 환산 양도·취득 기준시가 동일 동일사업연도 토글 (top-level bool)
    body.unlistedSameBizYearToggle = form.unlistedSameBizYearToggle === true;
  } else if (acquisitionMode === "face_value") {
    const faceVal = parseIntOrUndef(form.faceValuePerShare);
    if (faceVal !== undefined) body.faceValuePerShare = faceVal;
  } else if (acquisitionMode === "sale_case") {
    const perAcq = parseIntOrUndef(form.perShareAcquisitionPrice);
    if (perAcq !== undefined) body.perShareAcquisitionPrice = perAcq;
    // R-1' 매매사례가액 — sale_case 모드 확장 (영§176의2③1호)
    const acqMS = parseIntOrUndef(form.acquisitionMarketSamplePrice);
    if (acqMS !== undefined) body.acquisitionMarketSamplePrice = acqMS;
    if (form.acquisitionMarketSampleDate) body.acquisitionMarketSampleDate = form.acquisitionMarketSampleDate;
    if (form.acquisitionMarketSampleCounterparty) body.acquisitionMarketSampleCounterparty = form.acquisitionMarketSampleCounterparty;
  }

  // R-1' 양도 매매사례가액 — acquisitionMode 무관, transferPriceMode === "actual" + 입력값 있을 때
  if ((form.transferPriceMode || "actual") === "actual") {
    const trnMS = parseIntOrUndef(form.transferMarketSamplePrice);
    if (trnMS !== undefined) body.transferMarketSamplePrice = trnMS;
    if (form.transferMarketSampleDate) body.transferMarketSampleDate = form.transferMarketSampleDate;
    if (form.transferMarketSampleCounterparty) body.transferMarketSampleCounterparty = form.transferMarketSampleCounterparty;
  }

  // [A-2] R-2 자본조정 — 단일·분할 공통 전송 (분할은 엔진이 lot별 희석 전처리). strip 조건 제거.
  if (form.capitalAdjustments && form.capitalAdjustments.length > 0) {
    body.capitalAdjustments = form.capitalAdjustments
      .filter((a) => a.eventDate && a.ratio)
      .map((a) => ({
        type: a.type,
        eventDate: a.eventDate,
        ratio: parseFloat(a.ratio),
        notes: a.notes || undefined,
      }));
  }

  // 취득 후 상장 + 거래정지 (3중 패턴)
  body.acquiredBeforeListing = form.acquiredBeforeListing;     // default: false
  body.tradingHaltAtTransfer = form.tradingHaltAtTransfer;     // default: false
  body.tradingHaltAtAcquisition = form.tradingHaltAtAcquisition; // [C-1] default: false

  // [사례 49] 취득시 장부분실 액면가 + 양도시 §165④ 보충 평가 혼합
  // 활성 조건: (marketType==="unlisted" || 거래정지) + estimated + acqFaceValueOnly===true
  // [C-2] 거래정지(양도) 상장주식도 §165③→§165④ 비상장 보충평가 → 사례49 허용(silent strip 해소)
  if (
    (form.marketType === "unlisted" || form.tradingHaltAtTransfer) &&
    form.acquisitionMode === "estimated" &&
    form.acqFaceValueOnly === true &&
    form.acqFaceValuePerShare
  ) {
    body.acqFaceValueOnly = true;
    const faceVal = parseIntOrUndef(form.acqFaceValuePerShare);
    if (faceVal !== undefined && faceVal > 0) {
      body.acqFaceValuePerShare = faceVal;
    }
    // 취득연도 NI/NA는 body 미설정 (엔진이 액면가로 대체)
    delete (body as Record<string, unknown>).acquisitionYearNetIncomePerShare;
    delete (body as Record<string, unknown>).acquisitionYearNetAssetPerShare;
  }

  // [unlisted-direct-calc] 비상장 §165④ full 모드 — adapter로 4 필드 자동 합성
  // 활성 조건: (marketType === "unlisted" || 거래정지) + estimated 모드 + unlistedValuationMode === "full"
  // [C-2] 거래정지(양도) 상장주식도 비상장 보충평가 → full 결산서 허용(silent strip 해소)
  // [E-6] isNetAssetOnly === true 시 NI 호출 skip + body NI 미설정 (엔진이 isNetAssetOnly 시 NI 값 무시)
  if ((form.marketType === "unlisted" || form.tradingHaltAtTransfer) && form.unlistedValuationMode === "full") {
    const niSkip = shouldSkipNetIncome(form);
    const reduced = adaptUnlistedFlatToApiBody(form, { niSkip });
    if (!niSkip) body.transferYearNetIncomePerShare = reduced.transferNi;
    body.transferYearNetAssetPerShare = reduced.transferNa;
    if (!niSkip) body.acquisitionYearNetIncomePerShare = reduced.acqNi;
    body.acquisitionYearNetAssetPerShare = reduced.acqNa;
    // 74 신규 필드는 body 미포함 — Zod stripping/엔진 미도달 위험 0
  }

  // Round 4 H-02 — full/listing_only 모드 시 adapter로 nested + 4 필드 자동 합성
  if (form.acquiredBeforeListing && (form.unlistedDetailMode === "listing_only" || form.unlistedDetailMode === "full")) {
    const adapted = adaptFlatToApiBody(form, true);
    body.postListingDetail = adapted.postListingDetail;
    // 합성된 4 필드로 덮어쓰기 (UI 미리보기와 결과 일치 보장)
    if (adapted.listingDatePriceAvg1Month) body.listingDatePriceAvg1Month = adapted.listingDatePriceAvg1Month;
    if (adapted.listingYearNetIncomePerShare) body.listingYearNetIncomePerShare = adapted.listingYearNetIncomePerShare;
    if (adapted.listingYearNetAssetPerShare) body.listingYearNetAssetPerShare = adapted.listingYearNetAssetPerShare;
    if (adapted.acquisitionYearNetIncomePerShare) body.acquisitionYearNetIncomePerShare = adapted.acquisitionYearNetIncomePerShare;
    if (adapted.acquisitionYearNetAssetPerShare) body.acquisitionYearNetAssetPerShare = adapted.acquisitionYearNetAssetPerShare;
  }

  // ── 장부분실 ──
  body.bookLost = form.bookLost;                               // default: false

  // ── 순자산 단독 평가 사유 ──
  if (form.netAssetOnlyReason) {
    body.netAssetOnlyReason = form.netAssetOnlyReason;
  }

  // ── 필요경비 ──
  // 소령 §163⑥4 — expenseMode는 acquisitionMode에서 100% 자동 도출 (사용자 선택 폐지).
  //   실가(actual)   → "actual"  (실제 경비 입력)
  //   추계(estimated/sale_case/face_value) → "estimated" (개산공제 1% 자동)
  const isEstimatedAcq =
    form.acquisitionMode === "estimated" ||
    form.acquisitionMode === "sale_case" ||
    form.acquisitionMode === "face_value";
  const resolvedExpenseMode: "actual" | "estimated" = isEstimatedAcq ? "estimated" : "actual";
  body.expenseMode = resolvedExpenseMode;
  // [B-2] actualExpenses는 expenseMode 무관 항상 전송 — 환산 모드에서도 §97②2호 단서 비교 입력
  //   (이전: actual일 때만 전송 → 환산 모드 실비 silent strip). sale_case는 엔진 게이트 미진입(무해).
  {
    const exp = parseIntOrUndef(form.actualExpenses);
    if (exp !== undefined) body.actualExpenses = exp;
  }

  // ── 신고 ──
  body.filingType = filingType;                                // 3중 패턴 default: "preliminary"
  body.filingDate = form.filingDate || new Date().toISOString().split("T")[0];
  body.isElectronicFiling = form.isElectronicFiling;          // default: false
  body.filingViolation = form.filingViolation || "none";      // 3중 패턴 default: "none" — 가산세 게이트
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
