/**
 * 키움증권 OpenAPI 공용 타입.
 *
 * 출처: https://openapi.kiwoom.com/guide/apiguide (REST v1, 2024+ 신규)
 */

export type KiwoomEnv = "mock" | "prod";

export type MarketType = "KOSPI" | "KOSDAQ" | "KONEX" | "UNKNOWN";

export interface KiwoomTokenCacheEntry {
  accessToken: string;
  /** epoch ms — 만료 시각 */
  expiresAt: number;
}

export interface KiwoomStockMeta {
  stockCode: string;
  stockName: string;
  marketType: MarketType;
  /** 시가총액 (원) */
  marketCap: number;
  /** 상장주식수 (주) */
  listedShares: number;
  /** 거래정지 (Y) */
  tradingHalt: boolean;
  /** 관리종목 (Y) */
  adminIssue: boolean;
}

export interface KiwoomDailyQuote {
  /** YYYY-MM-DD */
  date: string;
  close: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface OneMonthBeforeTransferResult {
  /** transferDate 기준 [transferDate-1month, transferDate-1day] 일자별 슬롯 (전체 달력일) */
  slotDates: string[];
  /** slotDates와 동일 길이. 비거래일·미상장·거래정지 빈칸은 null */
  closingPrices: (number | null)[];
  /** 비거래일 사유 라벨 (slotDates와 동일 길이). 거래일은 "" */
  weekendLabels: string[];
  /** 분모로 사용한 거래일 수 */
  tradingDays: number;
  /** 평균 (소수점은 반올림 정수) */
  average: number;
  /** 종가 합계 */
  sum: number;
  /** 거래정지·관리종목 등으로 자동조회 차단된 경우 */
  tradingHalt: boolean;
  adminIssue: boolean;
}

export class KiwoomError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "auth_failed"
      | "rate_limited"
      | "trading_halted"
      | "admin_issue"
      | "stock_not_found"
      | "upstream_error"
      | "missing_env"
      | "invalid_response",
  ) {
    super(message);
    this.name = "KiwoomError";
  }
}
