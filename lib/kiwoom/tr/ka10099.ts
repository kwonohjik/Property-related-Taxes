/**
 * ka10099 — 종목정보 리스트 (전종목 마스터).
 *
 * 경로: /api/dostk/stkinfo · api-id: ka10099
 * 요청: { mrkt_tp: "0" | "10" | ... }
 *   - "0" 거래소(KOSPI), "10" 코스닥(KOSDAQ), "3" ELW, "8" ETF (F-15 PING 검증, 2026-05-19)
 *   - KONEX 코드는 본 PR scope에서 미확정 — 후속 검증
 * 응답:
 *   - list: [{ code, name, marketCode, marketName, state, auditInfo, listCount, lastPrice, ... }]
 *   - state 필드: "증거금40%|담보대출|신용가능" 등 파이프 구분. 거래정지·관리종목 키워드 포함
 *   - auditInfo: "정상" / "감사의견거절" 등
 *
 * 출처: 키움 모의투자 mockapi.kiwoom.com 실응답 캡처 (K-PING-F15, 2026-05-19)
 */

import { kiwoomFetch, type KiwoomRequestOptions } from "../client";
import { KiwoomError } from "../types";

const PATH = "/api/dostk/stkinfo";
const API_ID = "ka10099";

/**
 * ka10099 mrkt_tp 매핑 (모의투자 실응답 검증):
 *   - "0"  거래소 (KOSPI), 2,452 종목
 *   - "10" 코스닥 (KOSDAQ), 1,823 종목
 *   - "50" 코넥스 (KONEX, F-16 2026-05-19 확정), 109 종목
 *
 * KONEX 응답: marketCode="50", marketName="KONEX"
 */
export type StockListMarketTp = "0" | "10" | "50";

interface Ka10099Row {
  code?: string;
  name?: string;
  marketCode?: string;
  marketName?: string;
  state?: string;
  auditInfo?: string;
  listCount?: string;
  lastPrice?: string;
  upName?: string;
  upSizeName?: string;
  companyClassName?: string;
  kind?: string;
  regDay?: string;
}

interface Ka10099Response {
  return_code?: number;
  return_msg?: string;
  list?: Ka10099Row[];
}

export interface StockMasterEntry {
  stockCode: string;
  stockName: string;
  marketCode: string; // "0" / "10"
  marketName: string; // "거래소" / "코스닥"
  state: string;
  auditInfo: string;
  tradingHalt: boolean;
  adminIssue: boolean;
}

/** state 문자열에서 거래정지 여부 추출 */
function detectTradingHalt(state: string | undefined): boolean {
  if (!state) return false;
  return state.includes("거래정지");
}

/** state 또는 companyClassName에서 관리종목 여부 추출 */
function detectAdminIssue(state: string | undefined, companyClass: string | undefined): boolean {
  if (state?.includes("관리종목")) return true;
  if (companyClass?.includes("관리종목")) return true;
  return false;
}

export interface FetchStockListArgs {
  marketTp: StockListMarketTp;
  reqOverrides?: Partial<Omit<KiwoomRequestOptions, "apiId" | "path" | "body">>;
}

/**
 * 시장별 전종목 마스터 조회.
 *
 * 호출 1회로 1,800~2,500개 종목 정보 일괄 반환. prefetch 후 메모리 캐시 권장.
 *
 * @throws KiwoomError("upstream_error" | "invalid_response")
 */
export async function fetchStockList({
  marketTp,
  reqOverrides,
}: FetchStockListArgs): Promise<StockMasterEntry[]> {
  const json = await kiwoomFetch<Ka10099Response>({
    apiId: API_ID,
    path: PATH,
    body: { mrkt_tp: marketTp },
    ...reqOverrides,
  });

  if (!json.list || !Array.isArray(json.list)) {
    throw new KiwoomError(
      `ka10099 응답 형식이 예상과 다릅니다. return_code=${json.return_code ?? "?"}`,
      "invalid_response",
    );
  }

  return json.list
    .filter((r): r is Required<Pick<Ka10099Row, "code" | "name">> & Ka10099Row => Boolean(r.code && r.name))
    .map((r) => ({
      stockCode: r.code!,
      stockName: r.name!,
      marketCode: r.marketCode ?? marketTp,
      marketName: r.marketName ?? "",
      state: r.state ?? "",
      auditInfo: r.auditInfo ?? "",
      tradingHalt: detectTradingHalt(r.state),
      adminIssue: detectAdminIssue(r.state, r.companyClassName),
    }));
}

export const KA10099 = { API_ID, PATH };
