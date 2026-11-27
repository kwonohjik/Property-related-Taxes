/**
 * 국외전출세 보유 종목 normalizer — sessionStorage 마이그레이션 호환 (③ 동기화 지점)
 *
 * `calc-wizard-stock-normalize.ts`가 800줄 정책 위험구간(740줄)이라 종목 normalizer를 **동작 불변**으로 분리했다.
 * 이 함수는 반환 객체를 **필드 나열로 새로 만든다** — 새 필드를 여기 나열하지 않으면 새로고침(rehydrate)마다 조용히 사라진다.
 * 그래서 키 보존은 `__tests__/lib/exit-tax-holding-normalize-roundtrip.anchor.test.ts` 왕복 테스트가 지킨다.
 */

import type { ExitTaxHoldingForm } from "./calc-wizard-stock-types";

// ============================================================
// PR-4B 국외전출세 보유 종목 배열 normalizer
// ============================================================

export function normalizeExitTaxHoldings(raw: unknown): ExitTaxHoldingForm[] {
  if (!Array.isArray(raw)) return [];
  const validModes = ["market_price", "prior_year_std", "unlisted_sample", "unlisted_std"] as const;
  const validMarkets = ["kospi", "kosdaq", "konex", "unlisted"] as const;
  return raw
    .map((r): ExitTaxHoldingForm | null => {
      if (!r || typeof r !== "object") return null;
      const o = r as Record<string, unknown>;
      const idVal = typeof o.id === "string" ? o.id : null;
      if (!idVal) return null;
      const mode = typeof o.departureDayValuationMode === "string" &&
        (validModes as readonly string[]).includes(o.departureDayValuationMode)
        ? (o.departureDayValuationMode as ExitTaxHoldingForm["departureDayValuationMode"])
        : "market_price";
      const mkt = typeof o.marketType === "string" &&
        (validMarkets as readonly string[]).includes(o.marketType)
        ? (o.marketType as ExitTaxHoldingForm["marketType"])
        : "kospi";
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
        // 보유현황 신고서 표시 전용 — 구 세션에는 없던 필드라 빈 문자열로 채운다
        stockCodeOrBizNumber: typeof o.stockCodeOrBizNumber === "string" ? o.stockCodeOrBizNumber : "",
        faceValuePerShare: typeof o.faceValuePerShare === "string" ? o.faceValuePerShare : "",
        ownershipRatio: typeof o.ownershipRatio === "string" ? o.ownershipRatio : "",
      };
    })
    .filter((l): l is ExitTaxHoldingForm => l !== null);
}

