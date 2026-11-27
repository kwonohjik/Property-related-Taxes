/**
 * 국외전출세 보유 종목 normalizer — sessionStorage 마이그레이션 호환 (③ 동기화 지점)
 *
 * `calc-wizard-stock-normalize.ts`가 800줄 정책 위험구간(740줄)이라 종목 normalizer를 **동작 불변**으로 분리했다.
 * 이 함수는 반환 객체를 **필드 나열로 새로 만든다** — 새 필드를 여기 나열하지 않으면 새로고침(rehydrate)마다 조용히 사라진다.
 * 그래서 키 보존은 `__tests__/lib/exit-tax-holding-normalize-roundtrip.anchor.test.ts` 왕복 테스트가 지킨다.
 */

import type { ExitTaxHoldingForm } from "./calc-wizard-stock-types";
import type { StockTransferFormData } from "./calc-wizard-stock-form";

/** 국외주식 시장 값 — 시장↔시가 모드 정합 판정에 쓴다 */
const FOREIGN_MARKET = "foreign_stock";
const FOREIGN_MODES = ["foreign_market_price", "foreign_decree_178_3"] as const;
const DOMESTIC_MODES = ["market_price", "prior_year_std", "unlisted_sample", "unlisted_std"] as const;

// ============================================================
// PR-4B 국외전출세 보유 종목 배열 normalizer
// ============================================================

export function normalizeExitTaxHoldings(raw: unknown): ExitTaxHoldingForm[] {
  if (!Array.isArray(raw)) return [];
  const validMarkets = ["kospi", "kosdaq", "konex", "unlisted", FOREIGN_MARKET] as const;
  return raw
    .map((r): ExitTaxHoldingForm | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const idVal = typeof o.id === "string" ? o.id : null;
      if (!idVal) return null;
      const mkt = typeof o.marketType === "string" &&
        (validMarkets as readonly string[]).includes(o.marketType)
        ? (o.marketType as ExitTaxHoldingForm["marketType"])
        : "kospi";
      // 시장↔시가 모드 정합: 허용 밖이거나 시장과 어긋난 모드는 **그 시장의 기본 모드**로 되돌린다
      // (UI는 시장 전환 때 모드를 함께 바꾸므로 정상 입력에서는 어긋나지 않는다 — 깨진 세션 복구용).
      const allowedModes: readonly string[] = mkt === FOREIGN_MARKET ? FOREIGN_MODES : DOMESTIC_MODES;
      const mode =
        typeof o.departureDayValuationMode === "string" && allowedModes.includes(o.departureDayValuationMode)
          ? (o.departureDayValuationMode as ExitTaxHoldingForm["departureDayValuationMode"])
          : mkt === FOREIGN_MARKET
            ? "foreign_market_price"
            : "market_price";
      return {
        id: idVal,
        stockName: typeof o.stockName === "string" ? o.stockName : "",
        marketType: mkt,
        shareCount: typeof o.shareCount === "string" ? o.shareCount : "",
        acquisitionDate: typeof o.acquisitionDate === "string" ? o.acquisitionDate : "",
        perShareAcquisitionPrice: typeof o.perShareAcquisitionPrice === "string" ? o.perShareAcquisitionPrice : "",
        departureDayValuationMode: mode,
        departureDayMarketPrice: typeof o.departureDayMarketPrice === "string" ? o.departureDayMarketPrice : "",
        priorYearEndMonthAvg: typeof o.priorYearEndMonthAvg === "string" ? o.priorYearEndMonthAvg : "",
        unlistedSamplePrice: typeof o.unlistedSamplePrice === "string" ? o.unlistedSamplePrice : "",
        unlistedStdPricePerShare: typeof o.unlistedStdPricePerShare === "string" ? o.unlistedStdPricePerShare : "",
        // 국외주식(2027.1.1. 이후 출국) — 구 세션에는 없던 필드라 factory(`createEmptyExitTaxHolding`)와 같은 기본값으로 채운다
        isListedForeignCorp: typeof o.isListedForeignCorp === "boolean" ? o.isListedForeignCorp : true,
        isSmallMediumEnterprise: o.isSmallMediumEnterprise === true,
        countryCode: typeof o.countryCode === "string" && o.countryCode !== "" ? o.countryCode : "US",
        foreignCurrencyCode:
          typeof o.foreignCurrencyCode === "string" && o.foreignCurrencyCode !== "" ? o.foreignCurrencyCode : "USD",
        departureDayPriceForeign: typeof o.departureDayPriceForeign === "string" ? o.departureDayPriceForeign : "",
        departureExchangeRate: typeof o.departureExchangeRate === "string" ? o.departureExchangeRate : "",
        perShareAcquisitionPriceForeign:
          typeof o.perShareAcquisitionPriceForeign === "string" ? o.perShareAcquisitionPriceForeign : "",
        acquisitionExchangeRate: typeof o.acquisitionExchangeRate === "string" ? o.acquisitionExchangeRate : "",
        // 보유현황 신고서 표시 전용 — 구 세션에는 없던 필드라 빈 문자열로 채운다
        stockCodeOrBizNumber: typeof o.stockCodeOrBizNumber === "string" ? o.stockCodeOrBizNumber : "",
        faceValuePerShare: typeof o.faceValuePerShare === "string" ? o.faceValuePerShare : "",
        ownershipRatio: typeof o.ownershipRatio === "string" ? o.ownershipRatio : "",
      };
    })
    .filter((l): l is ExitTaxHoldingForm => l !== null);
}


// ============================================================
// 2027.1.1. 이후 출국분 — 폼 전역 필드 (외국인근로자 · 기본공제 배분)
// ============================================================

const WORKER_STATUSES = ["none", "foreign_worker", "foreign_worker_family"] as const;
const WORKER_FAMILY_KINDS = ["", "spouse", "child_20_or_under"] as const;

type ExitTaxFormExtras = Pick<
  StockTransferFormData,
  | "etForeignWorkerStatus"
  | "etForeignWorkerIsOfficerOrEmployee"
  | "etForeignWorkerIsNotDailyWorker"
  | "etForeignWorkerDomesticRatio80"
  | "etForeignWorkerDeparted6Months"
  | "etForeignWorkerFamilyKind"
  | "etForeignWorkerStartDate"
  | "etBasicDeductionAllocClause1"
  | "etBasicDeductionAllocClause2a"
  | "etBasicDeductionAllocClause2b"
>;

/**
 * 국외전출세 폼 전역 신규 필드 normalize (③). 구 세션에는 없던 필드라 factory 기본값
 * (`createInitialStockFormData`의 `et*`)과 **같은 값**으로 채운다 — 3중 패턴(factory = normalize = UI 직접 사용).
 * 반환 객체를 필드 나열로 만드는 형식이라 누락 방지는 왕복 anchor가 지킨다.
 */
export function normalizeExitTaxFormExtras(
  d: Record<string, unknown>,
  defaults: StockTransferFormData,
): ExitTaxFormExtras {
  const bool = (k: keyof ExitTaxFormExtras, def: boolean): boolean => {
    const v = d[k];
    return typeof v === "boolean" ? v : def;
  };
  const str = (k: keyof ExitTaxFormExtras): string => {
    const v = d[k];
    return typeof v === "string" ? v : "";
  };
  const status = d.etForeignWorkerStatus;
  const kind = d.etForeignWorkerFamilyKind;
  return {
    etForeignWorkerStatus:
      typeof status === "string" && (WORKER_STATUSES as readonly string[]).includes(status)
        ? (status as ExitTaxFormExtras["etForeignWorkerStatus"])
        : defaults.etForeignWorkerStatus,
    etForeignWorkerIsOfficerOrEmployee: bool(
      "etForeignWorkerIsOfficerOrEmployee",
      defaults.etForeignWorkerIsOfficerOrEmployee,
    ),
    etForeignWorkerIsNotDailyWorker: bool(
      "etForeignWorkerIsNotDailyWorker",
      defaults.etForeignWorkerIsNotDailyWorker,
    ),
    etForeignWorkerDomesticRatio80: bool(
      "etForeignWorkerDomesticRatio80",
      defaults.etForeignWorkerDomesticRatio80,
    ),
    etForeignWorkerDeparted6Months: bool(
      "etForeignWorkerDeparted6Months",
      defaults.etForeignWorkerDeparted6Months,
    ),
    etForeignWorkerFamilyKind:
      typeof kind === "string" && (WORKER_FAMILY_KINDS as readonly string[]).includes(kind)
        ? (kind as ExitTaxFormExtras["etForeignWorkerFamilyKind"])
        : defaults.etForeignWorkerFamilyKind,
    etForeignWorkerStartDate: str("etForeignWorkerStartDate"),
    etBasicDeductionAllocClause1: str("etBasicDeductionAllocClause1"),
    etBasicDeductionAllocClause2a: str("etBasicDeductionAllocClause2a"),
    etBasicDeductionAllocClause2b: str("etBasicDeductionAllocClause2b"),
  };
}
