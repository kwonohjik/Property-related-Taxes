/**
 * ka10081 — 주식일봉차트조회요청.
 *
 * 경로: /api/dostk/chart · api-id: ka10081
 * 요청:
 *   - stk_cd: 종목코드 6자리
 *   - base_dt: 기준일자 (YYYYMMDD) — 본 기준일로부터 과거 일봉 N건 반환
 *   - upd_stkpc_tp: 수정주가구분 "1"(적용) — 액면분할·증자 보정
 * 응답 핵심:
 *   - stk_dt_pole_chart_qry[] 또는 dly_chart[] ← [{ dt(YYYYMMDD), cur_prc(종가), trde_qty, open_pric, high_pric, low_pric }]
 *
 * 키움 응답 자체가 거래일만 포함하므로 휴장일·주말 별도 필터 불필요. 호출 측에서 일자 매핑만 수행.
 */

import { kiwoomFetch, type KiwoomRequestOptions } from "../client";
import { KiwoomError, type KiwoomDailyQuote } from "../types";

const PATH = "/api/dostk/chart";
const API_ID = "ka10081";

interface Ka10081Row {
  dt?: string;
  date?: string;
  cur_prc?: string | number;
  close?: string | number;
  open_pric?: string | number;
  high_pric?: string | number;
  low_pric?: string | number;
  trde_qty?: string | number;
}

interface Ka10081Response {
  return_code?: number;
  return_msg?: string;
  stk_dt_pole_chart_qry?: Ka10081Row[];
  dly_chart?: Ka10081Row[];
  // 키움 신규 스펙은 자주 변경되어 fallback 키 다수
  stk_pre_pric?: Ka10081Row[];
}

function toNumberSafe(v: string | number | undefined): number {
  if (v === undefined || v === null) return 0;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  if (!cleaned) return 0;
  // 키움 종가는 음수 부호로 등락 표시할 수 있음 → 절대값
  return Math.abs(Number(cleaned));
}

function toIsoDate(yyyymmdd: string | undefined): string {
  if (!yyyymmdd) return "";
  const s = String(yyyymmdd).replace(/[^0-9]/g, "");
  if (s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export interface FetchDailyChartArgs {
  stockCode: string;
  /** 기준일 (YYYY-MM-DD) — 이 일자로부터 과거 600개까지 응답 */
  baseDateIso: string;
  /** 응답 절단 — 시작일 (포함). baseDateIso로부터 거꾸로 받은 후 본 시작일까지만 보존 */
  fromDateIso?: string;
  reqOverrides?: Partial<Omit<KiwoomRequestOptions, "apiId" | "path" | "body">>;
}

/**
 * 일봉 종가 배열을 [fromDateIso, baseDateIso] 범위로 반환.
 * 응답은 거래일만 포함 (휴장·주말 누락). 호출 측은 자체 슬롯에 매핑.
 */
export async function fetchDailyChart(args: FetchDailyChartArgs): Promise<KiwoomDailyQuote[]> {
  if (!/^\d{6}$/.test(args.stockCode)) {
    throw new KiwoomError(`종목코드는 6자리 숫자여야 합니다: ${args.stockCode}`, "stock_not_found");
  }
  const baseYmd = args.baseDateIso.replace(/-/g, "");
  if (baseYmd.length !== 8) {
    throw new KiwoomError(`base_dt 포맷이 잘못되었습니다: ${args.baseDateIso}`, "invalid_response");
  }

  const json = await kiwoomFetch<Ka10081Response>({
    apiId: API_ID,
    path: PATH,
    body: {
      stk_cd: args.stockCode,
      base_dt: baseYmd,
      upd_stkpc_tp: "1",
    },
    ...args.reqOverrides,
  });

  const rows = json.stk_dt_pole_chart_qry ?? json.dly_chart ?? json.stk_pre_pric ?? [];
  const quotes: KiwoomDailyQuote[] = [];
  for (const r of rows) {
    const iso = toIsoDate(r.dt ?? r.date);
    if (!iso) continue;
    if (args.fromDateIso && iso < args.fromDateIso) continue;
    if (iso > args.baseDateIso) continue;
    quotes.push({
      date: iso,
      close: toNumberSafe(r.cur_prc ?? r.close),
      open: r.open_pric !== undefined ? toNumberSafe(r.open_pric) : undefined,
      high: r.high_pric !== undefined ? toNumberSafe(r.high_pric) : undefined,
      low: r.low_pric !== undefined ? toNumberSafe(r.low_pric) : undefined,
      volume: r.trde_qty !== undefined ? toNumberSafe(r.trde_qty) : undefined,
    });
  }

  // 오래된→최신 정렬
  quotes.sort((a, b) => a.date.localeCompare(b.date));
  return quotes;
}

export const KA10081 = { API_ID, PATH };
