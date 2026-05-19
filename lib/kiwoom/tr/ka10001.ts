/**
 * ka10001 — 주식기본정보요청.
 *
 * 출처: 키움 OpenAPI REST 가이드 (https://openapi.kiwoom.com/guide/apiguide)
 * 경로: /api/dostk/stkinfo · api-id: ka10001
 * 요청: { stk_cd: string } (종목코드 6자리)
 * 응답 핵심 필드:
 *   - stk_nm: 종목명
 *   - mket_id 또는 mket_div_nm: 시장구분 (KOSPI/KOSDAQ/KONEX)
 *   - tot_stk_amt: 시가총액 (단위: 원 또는 백만원 — 키움 사양 변형 대응)
 *   - lstg_stk_amt: 상장주식수
 *   - trde_halt 또는 trd_halt: 거래정지 (Y/N)
 *   - mngt_isue 또는 admn_isue: 관리종목 (Y/N)
 */

import { kiwoomFetch, type KiwoomRequestOptions } from "../client";
import { KiwoomError, type KiwoomStockMeta, type MarketType } from "../types";

const PATH = "/api/dostk/stkinfo";
const API_ID = "ka10001";

/**
 * ka10001 실응답 필드 (K-PING-01 모의투자 검증 결과, 2026-05-19):
 *   - stk_cd / stk_nm: 종목코드·종목명 ✓
 *   - mac: 시가총액 (백만원 추정 — 005930 응답 16,106,498 = 약 161조원)
 *   - flo_stk: 유동주식 (천주 추정 — 005930 응답 5,846,279 천주 = 약 58.4억주)
 *   - cap: 자본금 (억원 추정)
 *   - cur_prc / pred_pre / flu_rt: 현재가·전일대비·등락률 (부호 prefix로 방향 표시)
 *
 * 응답에 ★ 없는 필드 ★:
 *   - mket_id (시장구분 KOSPI/KOSDAQ/KONEX) — 별도 TR 또는 UI 직접 입력 필요
 *   - trde_halt / admn_isue (거래정지·관리종목) — 별도 TR 또는 UI 직접 입력 필요
 *
 * 후속 F-X: 시장구분·거래정지 정확 매핑은 ka10099(전종목정보) 또는 별도 TR로 분리.
 */
interface Ka10001Response {
  return_code?: number;
  return_msg?: string;
  stk_cd?: string;
  stk_nm?: string;
  // 시장구분 — 실응답 미반환. fallback 매핑 시도용 (응답 변형 대비)
  mket_id?: string;
  mket_div_nm?: string;
  // 시가총액 (백만원) — 실응답 필드명 mac
  mac?: string | number;
  tot_stk_amt?: string | number; // fallback
  // 유동주식 (천주) — 실응답 필드명 flo_stk
  flo_stk?: string | number;
  lstg_stk_amt?: string | number; // fallback
  list_stk_qty?: string | number; // fallback
  // 거래정지·관리종목 — 실응답 미반환. fallback 시도용
  trde_halt?: string;
  trd_halt?: string;
  mngt_isue?: string;
  admn_isue?: string;
}

function normalizeMarket(raw: string | undefined): MarketType {
  if (!raw) return "UNKNOWN";
  const t = raw.trim().toUpperCase();
  if (t.includes("KOSPI") || t.includes("유가증권") || t === "0") return "KOSPI";
  if (t.includes("KOSDAQ") || t.includes("코스닥") || t === "10") return "KOSDAQ";
  if (t.includes("KONEX") || t.includes("코넥스")) return "KONEX";
  return "UNKNOWN";
}

function toNumber(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  return Number(cleaned);
}

function isYesFlag(v: string | undefined): boolean {
  if (!v) return false;
  const t = v.trim().toUpperCase();
  return t === "Y" || t === "1" || t === "TRUE";
}

export interface FetchStockInfoArgs {
  stockCode: string;
  reqOverrides?: Partial<Omit<KiwoomRequestOptions, "apiId" | "path" | "body">>;
}

/**
 * 종목 기본정보 조회.
 *
 * @throws KiwoomError("stock_not_found") — 응답에 stk_nm 없음
 */
export async function fetchStockInfo({ stockCode, reqOverrides }: FetchStockInfoArgs): Promise<KiwoomStockMeta> {
  if (!/^\d{6}$/.test(stockCode)) {
    throw new KiwoomError(`종목코드는 6자리 숫자여야 합니다: ${stockCode}`, "stock_not_found");
  }

  const json = await kiwoomFetch<Ka10001Response>({
    apiId: API_ID,
    path: PATH,
    body: { stk_cd: stockCode },
    ...reqOverrides,
  });

  if (!json.stk_nm) {
    throw new KiwoomError(
      `종목을 찾을 수 없습니다 (${stockCode}). return_code=${json.return_code ?? "?"}`,
      "stock_not_found",
    );
  }

  return {
    stockCode,
    stockName: json.stk_nm,
    marketType: normalizeMarket(json.mket_id ?? json.mket_div_nm), // 실응답 미반환 → UNKNOWN
    marketCap: toNumber(json.mac ?? json.tot_stk_amt) * 1_000_000, // mac 백만원 → 원
    listedShares: toNumber(json.flo_stk ?? json.lstg_stk_amt ?? json.list_stk_qty) * 1_000, // flo_stk 천주 → 주
    tradingHalt: isYesFlag(json.trde_halt ?? json.trd_halt), // 실응답 미반환 → false
    adminIssue: isYesFlag(json.mngt_isue ?? json.admn_isue), // 실응답 미반환 → false
  };
}

export const KA10001 = { API_ID, PATH, normalizeMarket, isYesFlag, toNumber };
