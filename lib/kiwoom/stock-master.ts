/**
 * 종목 마스터 캐시 (KOSPI + KOSDAQ 전종목 prefetch).
 *
 * - 첫 호출 시 ka10099 (mrkt_tp=0 + mrkt_tp=10) 2회 호출 → Map<stockCode, StockMasterEntry>
 * - TTL 24h (장 마감 후 정보 갱신 가정. 환경별 변경 가능)
 * - 동시 다중 호출은 deduplicate로 단일 fetch
 *
 * 후속 (F-X): KONEX mrkt_tp 확정 / Supabase 영구 캐시 / 일별 cron prefetch
 */

import { fetchStockList, type StockMasterEntry } from "./tr/ka10099";
import { deduplicate } from "./dedup";

const TTL_MS = 24 * 60 * 60 * 1000;

/**
 * 동일 api-id(ka10099) 연속 호출 간 최소 간격.
 *
 * 키움은 같은 TR을 짧은 간격으로 호출하면 return_code=5("허용된 요청 개수를 초과하였습니다[1700]")로
 * 거부한다. Promise.all 동시 호출 시 일부가 실패 → list 누락 → 마스터 전체 로드 실패.
 * 실측: 1.2초 간격 순차는 3건 모두 성공. 안전 마진 포함 1.5초.
 */
const MASTER_FETCH_GAP_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface MasterCacheEntry {
  byCode: Map<string, StockMasterEntry>;
  loadedAt: number;
}

let cache: MasterCacheEntry | null = null;

/** 캐시 초기화 (테스트용) */
export function __resetStockMaster() {
  cache = null;
}

export function __getStockMasterSize(): number {
  return cache?.byCode.size ?? 0;
}

/**
 * 전종목 마스터 로드 (캐시 hit 우선).
 *
 * @returns 종목코드 → StockMasterEntry Map
 */
async function loadStockMaster(): Promise<Map<string, StockMasterEntry>> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < TTL_MS) {
    return cache.byCode;
  }
  return deduplicate("stock-master-load", async () => {
    // 캐시 재확인 (race condition)
    if (cache && now - cache.loadedAt < TTL_MS) return cache.byCode;

    // 동일 api-id 연속 호출 제한(1700) 회피 — 순차 호출 + 간격. Promise.all 동시 호출 금지.
    const kospi = await fetchStockList({ marketTp: "0" });
    await sleep(MASTER_FETCH_GAP_MS);
    const kosdaq = await fetchStockList({ marketTp: "10" });
    await sleep(MASTER_FETCH_GAP_MS);
    const konex = await fetchStockList({ marketTp: "50" }); // F-16 KONEX 추가

    const byCode = new Map<string, StockMasterEntry>();
    for (const entry of kospi) byCode.set(entry.stockCode, entry);
    for (const entry of kosdaq) byCode.set(entry.stockCode, entry);
    for (const entry of konex) byCode.set(entry.stockCode, entry);

    cache = { byCode, loadedAt: Date.now() };
    return byCode;
  });
}

/**
 * 단일 종목 마스터 조회 (없으면 undefined).
 *
 * 자동 mirror 용도: securityCode 입력 시 marketType / tradingHalt 즉시 확정.
 */
export async function lookupStockMaster(stockCode: string): Promise<StockMasterEntry | undefined> {
  if (!/^[0-9A-Z]{6}$/.test(stockCode)) return undefined;
  const master = await loadStockMaster();
  return master.get(stockCode);
}

/**
 * 종목명/종목코드 부분 일치 검색 (F-10 typeahead).
 *
 * 검색 우선순위:
 *   1. 종목코드 exact (대소문자 무시)
 *   2. 종목명 prefix 일치
 *   3. 종목명 부분 일치 (contains)
 *
 * @param query 사용자 입력 (1자 이상)
 * @param limit 최대 후보 수 (default 10)
 */
export async function searchStockMaster(
  query: string,
  limit = 10,
): Promise<StockMasterEntry[]> {
  const q = query.trim();
  if (!q) return [];
  const master = await loadStockMaster();
  const qUpper = q.toUpperCase();
  const exactCode = master.get(qUpper);
  if (exactCode) return [exactCode];

  // 종목명 매칭은 대소문자 무관 (영문 종목명·KONEX 영문 코드 대비). 한글은 toUpperCase no-op.
  const prefix: StockMasterEntry[] = [];
  const contains: StockMasterEntry[] = [];
  for (const entry of master.values()) {
    const nameUpper = entry.stockName.toUpperCase();
    if (nameUpper.startsWith(qUpper)) {
      prefix.push(entry);
    } else if (nameUpper.includes(qUpper)) {
      contains.push(entry);
    }
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit);
}

/** marketCode (ka10099) → store marketType (lowercase) 매핑 */
export function masterMarketCodeToStore(marketCode: string): "kospi" | "kosdaq" | "konex" | "" {
  if (marketCode === "0") return "kospi";
  if (marketCode === "10") return "kosdaq";
  if (marketCode === "50") return "konex"; // F-16 KONEX
  return "";
}
